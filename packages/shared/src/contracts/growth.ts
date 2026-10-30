import { z } from 'zod';

export const GrowthGoalInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: z.string().optional(),
  applicationId: z.string().uuid().optional(),
});
export type GrowthGoalInput = z.infer<typeof GrowthGoalInput>;

export const GROWTH_ENTRY_KINDS = ['achievement', 'reflection', 'conversation', 'learning'] as const;
export type GrowthEntryKind = typeof GROWTH_ENTRY_KINDS[number];

export const GrowthEntryInput = z.object({
  goalId: z.string().uuid().optional(),
  kind: z.enum(GROWTH_ENTRY_KINDS),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10000),
  occurredAt: z.string().optional(),
});
export type GrowthEntryInput = z.infer<typeof GrowthEntryInput>;
