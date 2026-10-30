import { z } from 'zod';

export const CreateEvidenceInput = z.object({
  title: z.string().min(1).max(200),
  context: z.string().min(1).max(4000),
  action: z.string().min(1).max(4000),
  result: z.string().max(4000).optional(),
  dates: z.object({
    start: z.string().max(20).optional(),
    end: z.string().max(20).optional(),
  }).default({}),
  skills: z.array(z.string().max(100)).default([]),
  tags: z.array(z.string().max(50)).default([]),
});
export type CreateEvidenceInput = z.infer<typeof CreateEvidenceInput>;
