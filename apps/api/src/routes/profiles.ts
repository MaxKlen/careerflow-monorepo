import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { educations, experiences, profileVersions, skills, workspaces } from '@careerflow/db';
import { CreateProfileVersionInput, ExperienceInput } from '@careerflow/shared';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}
async function ownedVersion(id: string, userId: string) {
  const rows = await db.select().from(profileVersions).where(eq(profileVersions.id, id)).limit(1);
  return rows[0] && await ownsWorkspace(rows[0].workspaceId, userId) ? rows[0] : null;
}
export async function registerProfiles(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => { if (!req.user) return reply.code(401).send({ error: 'unauthenticated' }); });
  app.get('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    return { versions: await db.select().from(profileVersions).where(eq(profileVersions.workspaceId, workspaceId)).orderBy(desc(profileVersions.updatedAt)) };
  });
  app.post('/:workspaceId', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = CreateProfileVersionInput.parse(req.body);
    const row = (await db.insert(profileVersions).values({ workspaceId, label: body.label, headline: body.headline, summary: body.summary, targetRoles: body.targetRoles }).returning())[0]!;
    return reply.code(201).send({ version: row });
  });
  app.get('/versions/:id', async (req, reply) => {
    const row = await ownedVersion((req.params as { id: string }).id, req.user!.id);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    const [exp, edu, sk] = await Promise.all([
      db.select().from(experiences).where(eq(experiences.profileVersionId, row.id)),
      db.select().from(educations).where(eq(educations.profileVersionId, row.id)),
      db.select().from(skills).where(eq(skills.profileVersionId, row.id)),
    ]);
    return { version: row, experiences: exp, educations: edu, skills: sk };
  });
  app.post('/versions/:id/experience', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    if (!(await ownedVersion(id, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const body = ExperienceInput.parse(req.body);
    const row = (await db.insert(experiences).values({ profileVersionId: id, ...body }).returning())[0]!;
    return reply.code(201).send({ experience: row });
  });
}
