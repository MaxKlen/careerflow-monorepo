import type { FastifyInstance } from 'fastify';
import { and, desc, eq, inArray, isNull, gt } from 'drizzle-orm';
import { db } from '../db.js';
import {
  employerInvitations, applications, opportunities,
  documents, documentVersions, applicationRequirements, requirementEvidenceLinks, applicationEvents,
} from '@careerflow/db';

function whitelistProvenance(value: unknown): { sourceType: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((claim): { sourceType: string }[] => {
    if (!claim || typeof claim !== 'object') return [];
    const sourceType = (claim as { sourceType?: unknown }).sourceType;
    return typeof sourceType === 'string' ? [{ sourceType }] : [];
  });
}

async function authorizedApplicationIds(employerId: string): Promise<string[]> {
  const rows = await db.select({ applicationId: employerInvitations.applicationId }).from(employerInvitations)
    .where(and(
      eq(employerInvitations.employerUserId, employerId),
      isNull(employerInvitations.revokedAt),
      gt(employerInvitations.expiresAt, new Date()),
    ));
  return [...new Set(rows.map(r => r.applicationId))];
}

export async function registerEmployerApplications(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.employer) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/', async (req) => {
    const ids = await authorizedApplicationIds(req.employer!.id);
    if (!ids.length) return { applications: [] };
    const rows = await db.select({
      applicationId: applications.id,
      stage: applications.stage,
      opportunityTitle: opportunities.title,
      opportunityCompany: opportunities.company,
    }).from(applications)
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(inArray(applications.id, ids));
    return { applications: rows };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const ids = await authorizedApplicationIds(req.employer!.id);
    if (!ids.includes(id)) return reply.code(404).send({ error: 'not_found' });

    const appRows = await db.select({
      id: applications.id,
      stage: applications.stage,
      submissionRecordedAt: applications.submissionRecordedAt,
      nextAction: applications.nextAction,
      dueDate: applications.dueDate,
      opportunityTitle: opportunities.title,
      opportunityCompany: opportunities.company,
      opportunityLocation: opportunities.location,
      opportunityArrangement: opportunities.arrangement,
    }).from(applications)
      .leftJoin(opportunities, eq(opportunities.id, applications.opportunityId))
      .where(eq(applications.id, id)).limit(1);
    const appRow = appRows[0];
    if (!appRow) return reply.code(404).send({ error: 'not_found' });

    // Only documents attached to this application; expose the latest version and approved fields.
    const docs = await db.select({
      id: documents.id,
      kind: documents.kind,
      title: documents.title,
    }).from(documents).where(eq(documents.applicationId, id));
    const docIds = docs.map(d => d.id);
    const versions = docIds.length
      ? await db.select({
          documentId: documentVersions.documentId,
          content: documentVersions.content,
          provenance: documentVersions.provenance,
          createdAt: documentVersions.createdAt,
        }).from(documentVersions)
          .where(inArray(documentVersions.documentId, docIds))
          .orderBy(desc(documentVersions.createdAt))
      : [];
    const latestByDocument = new Map<string, typeof versions[number]>();
    for (const version of versions) if (!latestByDocument.has(version.documentId)) latestByDocument.set(version.documentId, version);

    // Only requirements and evidence links explicitly confirmed as linked; never phrase matches/details.
    const appReqs = await db.select({
      text: applicationRequirements.text,
      position: applicationRequirements.position,
      id: applicationRequirements.id,
    }).from(applicationRequirements).where(eq(applicationRequirements.applicationId, id));
    const reqIds = appReqs.map(r => r.id);
    const links = reqIds.length
      ? await db.select({
          requirementId: requirementEvidenceLinks.requirementId,
          state: requirementEvidenceLinks.state,
          linkedAt: requirementEvidenceLinks.linkedAt,
          confirmedAt: requirementEvidenceLinks.confirmedAt,
        }).from(requirementEvidenceLinks).where(and(
          inArray(requirementEvidenceLinks.requirementId, reqIds),
          eq(requirementEvidenceLinks.state, 'linked'),
        ))
      : [];

    await db.insert(applicationEvents).values({
      applicationId: id,
      kind: 'note',
      occurredAt: new Date(),
      note: 'Employer viewed your application',
      sourceType: 'employer_action',
      createdBy: null,
    });

    return {
      application: appRow,
      documents: docs.map(d => {
        const latest = latestByDocument.get(d.id);
        return {
          kind: d.kind,
          title: d.title,
          content: latest?.content ?? null,
          provenance: whitelistProvenance(latest?.provenance),
        };
      }),
      requirements: appReqs.map(r => ({
        text: r.text,
        position: r.position,
        linkedEvidence: links.filter(l => l.requirementId === r.id).map(l => ({
          state: l.state,
          linkedAt: l.linkedAt,
          confirmedAt: l.confirmedAt,
        })),
      })),
    };
  });
}
