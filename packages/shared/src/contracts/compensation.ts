import { z } from 'zod';

export const MEA_CURRENCIES = ['AED','SAR','QAR','KWD','BHD','OMR','EGP','NGN','ZAR','KES','GHS','MAD','TND','USD','EUR','GBP'] as const;

export const CompensationPeriod = z.enum(['month', 'year']);
export type CompensationPeriod = z.infer<typeof CompensationPeriod>;

export const Compensation = z.object({
  currency: z.enum(MEA_CURRENCIES),
  amountMin: z.number().int().nonnegative().optional(),
  amountMax: z.number().int().nonnegative().optional(),
  period: CompensationPeriod,
  isEstimate: z.boolean().default(true),
  note: z.string().max(500).optional(),
}).refine(
  (v) => v.amountMin == null || v.amountMax == null || v.amountMin <= v.amountMax,
  { message: 'amountMin must be <= amountMax' },
);
export type Compensation = z.infer<typeof Compensation>;
