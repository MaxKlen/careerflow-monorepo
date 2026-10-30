import { z } from 'zod';

const SECTION_KEYS = ['contact','summary','experience','education','skills','certifications','projects','languages','references','other'] as const;
export const SectionKey = z.enum(SECTION_KEYS);
export type SectionKey = z.infer<typeof SectionKey>;

export const ParsedSection = z.object({
  key: SectionKey, heading: z.string(), rawText: z.string(), lines: z.array(z.string()),
});
export type ParsedSection = z.infer<typeof ParsedSection>;

export const ConfirmSectionsInput = z.object({
  sections: z.array(z.object({ key: SectionKey, include: z.boolean(), editedText: z.string().max(20000) })),
  profileLabel: z.string().min(1).max(80),
});
export type ConfirmSectionsInput = z.infer<typeof ConfirmSectionsInput>;
