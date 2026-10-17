import { z } from 'zod';

export const createLessonNoteSchema = z.object({
  componentId: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(2000),
  videoSeconds: z.number().int().min(0).max(86400).nullable(),
});
export const updateLessonNoteSchema = z.object({ text: createLessonNoteSchema.shape.text });
export type CreateLessonNoteInput = z.infer<typeof createLessonNoteSchema>;
export type LessonNote = CreateLessonNoteInput & {
  id: string;
  courseId: string;
  createdAt: string;
  updatedAt: string;
};
export class LessonNoteLimitError extends Error {
  constructor() { super('A course can have at most 500 notes per account.'); }
}
