import { z } from 'zod';

export const FEEDBACK_KINDS = ['bug', 'suggestion', 'question', 'concern'] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];

export const SubmitFeedbackInput = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10000),
  contactOk: z.boolean().default(false),
  contextScreen: z.string().max(200).optional(),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInput>;

export const UpdateFeedbackStatusInput = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'closed']),
  adminNotes: z.string().max(5000).optional(),
});
export type UpdateFeedbackStatusInput = z.infer<typeof UpdateFeedbackStatusInput>;
