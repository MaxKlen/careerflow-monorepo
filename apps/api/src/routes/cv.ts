import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import { workspaces, cvImportSessions, profileVersions, experiences, skills, educations } from '@careerflow/db';
import { ConfirmSectionsInput } from '@careerflow/shared';
import { parseCv } from '@careerflow/core';
import { putObject } from '../storage.js';
import { extractText } from '../extractText.js';

async function ownsWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const rows = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.ownerId, userId))).limit(1);
  return !!rows[0];
}

export async function registerCv(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.post('/:workspaceId/import', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'file_required' });
    const buffer = await file.toBuffer();
    if (buffer.length === 0) return reply.code(400).send({ error: 'empty_file' });
    if (buffer.length > 10 * 1024 * 1024) return reply.code(413).send({ error: 'file_too_large' });

    const storageKey = `cv-imports/${workspaceId}/${randomUUID()}-${file.filename.replace(/[^\w.\-]/g, '_')}`;
    await putObject(storageKey, buffer, file.mimetype);

    const sess = (await db.insert(cvImportSessions).values({ workspaceId, filename: file.filename, mime: file.mimetype, storageKey, status: 'pending' }).returning())[0]!;

    try {
      const text = await extractText(buffer, file.mimetype, file.filename);
      const sections = parseCv(text);
      await db.update(cvImportSessions).set({ status: 'parsed', rawText: text, sections, parsedAt: new Date() }).where(eq(cvImportSessions.id, sess.id));
      return reply.code(201).send({ sessionId: sess.id, status: 'parsed', sections });
    } catch (e) {
      await db.update(cvImportSessions).set({ status: 'failed', error: (e as Error).message }).where(eq(cvImportSessions.id, sess.id));
      return reply.code(422).send({ sessionId: sess.id, status: 'failed', error: (e as Error).message });
    }
  });

  app.get('/:workspaceId/session/:id', async (req, reply) => {
    const { workspaceId, id } = req.params as { workspaceId: string; id: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(cvImportSessions).where(eq(cvImportSessions.id, id)).limit(1);
    if (!rows[0] || rows[0].workspaceId !== workspaceId) return reply.code(404).send({ error: 'not_found' });
    return { session: rows[0] };
  });

  app.post('/:workspaceId/session/:id/confirm', async (req, reply) => {
    const { workspaceId, id } = req.params as { workspaceId: string; id: string };
    if (!(await ownsWorkspace(workspaceId, req.user!.id))) return reply.code(404).send({ error: 'not_found' });
    const rows = await db.select().from(cvImportSessions).where(eq(cvImportSessions.id, id)).limit(1);
    if (!rows[0] || rows[0].workspaceId !== workspaceId) return reply.code(404).send({ error: 'not_found' });

    const body = ConfirmSectionsInput.parse(req.body);
    const version = (await db.insert(profileVersions).values({ workspaceId, label: body.profileLabel, targetRoles: [] }).returning())[0]!;

    for (const sec of body.sections) {
      if (!sec.include || !sec.editedText.trim()) continue;
      if (sec.key === 'summary')
        await db.update(profileVersions).set({ summary: sec.editedText }).where(eq(profileVersions.id, version.id));
      if (sec.key === 'skills') {
        const items = sec.editedText.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        if (items.length) await db.insert(skills).values(items.map(name => ({ profileVersionId: version.id, name })));
      }
      if (sec.key === 'experience') {
        const blocks = sec.editedText.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        for (let i = 0; i < blocks.length; i++)
          await db.insert(experiences).values({ profileVersionId: version.id, company: 'Imported', role: (blocks[i]!.split(/\n/)[0] ?? '').slice(0, 200) || 'Imported role', bullets: [{ text: blocks[i]!, sourceType: 'candidate_input' }], position: i });
      }
      if (sec.key === 'education') {
        const blocks = sec.editedText.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        for (const b of blocks) await db.insert(educations).values({ profileVersionId: version.id, institution: b.split(/\n/)[0] ?? 'Imported', credential: null, field: null });
      }
    }
    await db.update(cvImportSessions).set({ status: 'confirmed' }).where(eq(cvImportSessions.id, id));
    return reply.code(201).send({ profileVersionId: version.id });
  });
}
