import { z } from 'zod';
import { ARRANGEMENTS } from '../enums.js';
import { Compensation } from './compensation.js';

export const CreateOpportunityInput = z.object({
  title: z.string().min(1).max(200),
  company: z.string().min(1).max(200),
  location: z.string().max(200).optional(),
  arrangement: z.enum(ARRANGEMENTS).optional(),
  description: z.string().min(1).max(20000),
  sourceUrl: z.string().url().max(2000).optional(),
  sourceKind: z.enum(['manual', 'import', 'partner_feed']).default('manual'),
  compensation: Compensation.optional(),
  requirementLines: z.array(z.string().min(1).max(1000)).default([]),
});
export type CreateOpportunityInput = z.infer<typeof CreateOpportunityInput>;
