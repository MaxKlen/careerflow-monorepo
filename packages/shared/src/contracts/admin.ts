import { z } from 'zod';

export const AdminRole = z.enum(['owner', 'support', 'viewer']);
export type AdminRole = z.infer<typeof AdminRole>;

export const AdminSignupInput = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(12).max(200),
  displayName: z.string().trim().min(1).max(80).optional(),
  bootstrapToken: z.string().min(1).max(200).optional(),
});
export const AdminSigninInput = z.object({
  email: z.string().email().max(254).toLowerCase(),
  password: z.string().min(1).max(200),
});
export const FeatureFlagInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/),
  enabled: z.boolean(),
  description: z.string().max(500).optional(),
});
export type FeatureFlagInput = z.infer<typeof FeatureFlagInput>;
