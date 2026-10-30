import { z } from 'zod';
import { SOURCE_TYPES } from '../enums.js';

export const CreateProfileVersionInput = z.object({
  label: z.string().min(1).max(80),
  headline: z.string().max(200).optional(),
  summary: z.string().max(4000).optional(),
  targetRoles: z.array(z.string().max(100)).default([]),
});
export type CreateProfileVersionInput = z.infer<typeof CreateProfileVersionInput>;

export const ExperienceInput = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  startDate: z.string().max(20).optional(),
  endDate: z.string().max(20).optional(),
  bullets: z.array(z.object({
    text: z.string().min(1).max(1000),
    sourceType: z.enum(SOURCE_TYPES).default('candidate_input'),
  })).default([]),
  position: z.number().int().nonnegative().default(0),
});
export type ExperienceInput = z.infer<typeof ExperienceInput>;
