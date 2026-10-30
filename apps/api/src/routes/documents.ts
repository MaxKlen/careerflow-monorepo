import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { applications, documents, documentVersions, evidenceItems, opportunities, profileVersions, workspaces } from '@careerflow/db';
import { CreateDocumentInput, CreateDocumentVersionInput } from '@careerflow/shared';
import { assertAll } from '@careerflow/core';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}
async function validProvenance(provenance: CreateDocumentInput['provenance'], workspaceId: string): Promise<boolean> {
  try { assertAll(provenance); } catch { return false; }
  for (const claim of provenance) {
    if (!claim.sourceId) continue;
    if (claim.sourceType === 'evidence_item') {
      const row = (await db.select({ id: evidenceItems.id }).from(evidenceItems).where(and(eq(evidenceItems.id, claim.sourceId), eq(evidenceItems.workspaceId, workspaceId))).limit(1))[0];
      if (!row) return false;
    } else if (claim.sourceType === 'profile_version') {
      const row = (await db.select({ id: profileVersions.id }).from(profileVersions).where(and(eq(profileVersions.id, claim.sourceId), eq(profileVersions.workspaceId, workspaceId))).limit(1))[0];
      if (!row) return false;
    } else if (claim.sourceType === 'opportunity_listing') {
      const row = (await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, claim.sourceId)).limit(1))[0];
      if (!row) return false;
    }
  }
  return true;
}
export async function registerDocuments(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => { if (!req.user) return reply.code(401).send({ error: 'unauthenticated' }); });
  app.get('/by-workspace/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    return { documents: await db.select().from(documents).where(eq(documents.workspaceId, workspaceId)).orderBy(desc(documents.createdAt)) };
  });
  app.post('/by-workspace/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateDocumentInput.parse(req.body);
    if (body.applicationId) {
      const application = (await db.select({ id: applications.id }).from(applications).where(and(eq(applications.id, body.applicationId), eq(applications.workspaceId, workspaceId))).limit(1))[0];
      if (!application) return reply.code(404).send({ error: 'application_not_found' });
    }
    if (!(await validProvenance(body.provenance, workspaceId))) return reply.code(400).send({ error: 'provenance_invalid' });
    const document = (await db.insert(documents).values({ workspaceId, applicationId: body.applicationId, kind: body.kind, title: body.title }).returning())[0]!;
    const version = (await db.insert(documentVersions).values({ documentId: document.id, content: body.content, provenance: body.provenance, createdBy: req.user!.id }).returning())[0]!;
    return reply.code(201).send({ document, version });
  });
  app.get('/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const document = (await db.select().from(documents).where(eq(documents.id, id)).limit(1))[0];
    if (!document || !(await ownsWorkspace(document.workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    return { document, versions: await db.select().from(documentVersions).where(eq(documentVersions.documentId, id)).orderBy(desc(documentVersions.createdAt)) };
  });

  app.post('/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const document = (await db.select().from(documents).where(eq(documents.id, id)).limit(1))[0];
    if (!document || !(await ownsWorkspace(document.workspaceId, req.user!.id))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    const body = CreateDocumentVersionInput.parse(req.body);
    if (!(await validProvenance(body.provenance, document.workspaceId))) {
      return reply.code(400).send({ error: 'provenance_invalid' });
    }
    const version = (await db.insert(documentVersions).values({
      documentId: id,
      content: body.content,
      provenance: body.provenance,
      createdBy: req.user!.id,
    }).returning())[0]!;
    return reply.code(201).send({ version });
  });
}
