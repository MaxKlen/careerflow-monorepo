import { z } from 'zod';
import { SOURCE_TYPES } from '../enums.js';

const provenanceClaim = z.object({
  text: z.string(),
  sourceType: z.enum(SOURCE_TYPES),
  sourceId: z.string().uuid().optional(),
  note: z.string().optional(),
});

export const CreateDocumentInput = z.object({
  applicationId: z.string().uuid().optional(),
  kind: z.enum(['cv', 'cover_letter', 'portfolio', 'profile_summary']),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  provenance: z.array(provenanceClaim).default([]),
});
export type CreateDocumentInput = z.infer<typeof CreateDocumentInput>;

export const CreateDocumentVersionInput = z.object({
  content: z.string().min(1).max(50000),
  provenance: z.array(provenanceClaim).default([]),
});
export type CreateDocumentVersionInput = z.infer<typeof CreateDocumentVersionInput>;
