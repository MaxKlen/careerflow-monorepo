import { z } from 'zod';
import { WORKSPACE_KINDS } from '../enums.js';

export const CreateWorkspaceInput = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(WORKSPACE_KINDS).default('personal'),
});
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceInput>;
