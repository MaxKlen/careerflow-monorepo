import { z } from 'zod';

export const ChangePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

export const DeleteAccountInput = z.object({
  password: z.string().min(1).max(200),
  confirmEmail: z.string().email().max(254).toLowerCase(),
  acknowledgeIrreversible: z.literal(true),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountInput>;

export const UpdateProfileInput = z.object({
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  timezone: z.string().min(1).max(64).optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
