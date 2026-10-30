import { z } from 'zod';

export const INTERVIEW_QUESTION_CATEGORIES = ['behavioral', 'situational', 'role', 'candidate_questions'] as const;
export type InterviewQuestionCategory = typeof INTERVIEW_QUESTION_CATEGORIES[number];

export const InterviewQuestion = z.object({
  id: z.string(),
  category: z.enum(INTERVIEW_QUESTION_CATEGORIES),
  text: z.string(),
});
export type InterviewQuestion = z.infer<typeof InterviewQuestion>;

export const UpsertInterviewPrepInput = z.object({
  selectedQuestionIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  notes: z.string().max(10000).optional(),
});
export type UpsertInterviewPrepInput = z.infer<typeof UpsertInterviewPrepInput>;

export const InterviewReflectionInput = z.object({
  learned: z.string().min(1).max(4000),
  followUp: z.string().max(2000).optional(),
  nextDate: z.string().optional(),
});
export type InterviewReflectionInput = z.infer<typeof InterviewReflectionInput>;
