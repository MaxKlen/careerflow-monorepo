import { z } from 'zod';
import { APP_STAGES, REQ_EVIDENCE_STATES } from '../enums.js';

export const CreateApplicationInput = z.object({ opportunityId: z.string().uuid().optional() });
export type CreateApplicationInput = z.infer<typeof CreateApplicationInput>;
export const UpdateApplicationStageInput = z.object({ stage: z.enum(APP_STAGES) });
export type UpdateApplicationStageInput = z.infer<typeof UpdateApplicationStageInput>;
export const LinkEvidenceInput = z.object({
  requirementId: z.string().uuid(),
  evidenceId: z.string().uuid().optional(),
  state: z.enum(REQ_EVIDENCE_STATES),
  phrase: z.string().max(500).optional(),
});
export type LinkEvidenceInput = z.infer<typeof LinkEvidenceInput>;
