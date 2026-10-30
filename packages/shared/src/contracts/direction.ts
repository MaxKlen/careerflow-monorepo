import { z } from 'zod';
import { ARRANGEMENTS } from '../enums.js';
import { MEA_CURRENCIES } from './compensation.js';

export const EntryPoint = z.enum(['exploring', 'new_role', 'returning', 'changing', 'advancing', 'developing']);

export const DirectionConstraints = z.object({
  locations: z.array(z.string().max(100)).default([]),
  arrangements: z.array(z.enum(ARRANGEMENTS)).default([]),
  salaryFloor: z.number().int().nonnegative().optional(),
  salaryCurrency: z.enum(MEA_CURRENCIES).optional(),
  schedule: z.string().max(200).optional(),
  accessibility: z.string().max(500).optional(),
  other: z.string().max(1000).optional(),
});

export const CreateDirectionInput = z.object({
  summaryInOwnWords: z.string().min(10).max(2000),
  entryPoint: EntryPoint,
  constraints: DirectionConstraints.default({}),
  firstGoalTitle: z.string().min(3).max(200),
});
export type CreateDirectionInput = z.infer<typeof CreateDirectionInput>;
