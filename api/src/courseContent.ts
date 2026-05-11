import { z } from 'zod';

export const courseContentComponentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  type: z.enum(['video', 'quiz', 'text']),
  durationMinutes: z.coerce.number().int().min(0).max(600).default(0),
  content: z.string().trim().max(20000).default(''),
  resourceUrl: z.string().trim().max(2000).default(''),
});

export const courseContentSectionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  components: z.array(courseContentComponentSchema).max(200).default([]),
});

export const updateCourseContentSchema = z.object({
  sections: z.array(courseContentSectionSchema).max(200).default([]),
});

export type CourseContentComponent = z.infer<typeof courseContentComponentSchema>;
export type CourseContentSection = z.infer<typeof courseContentSectionSchema>;
export type UpdateCourseContentInput = z.infer<typeof updateCourseContentSchema>;
