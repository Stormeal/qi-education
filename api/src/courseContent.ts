import { z } from 'zod';

const quizAnswerOptionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  text: z.string().trim().max(300).default(''),
  description: z.string().trim().max(500).default(''),
  isCorrect: z.boolean().default(false),
});

const quizQuestionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  question: z.string().trim().max(1000).default(''),
  points: z.coerce.number().int().min(1).max(100).default(1),
  answers: z.tuple([
    quizAnswerOptionSchema,
    quizAnswerOptionSchema,
    quizAnswerOptionSchema,
    quizAnswerOptionSchema,
  ]),
});

const quizComponentSchema = z.object({
  passPoints: z.coerce.number().int().min(1).max(100).default(1),
  questions: z.array(quizQuestionSchema).min(1).max(50).default([]),
});

const baseCourseContentComponentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.coerce.number().int().min(0).max(600).default(0),
  content: z.string().trim().max(20000).default(''),
  resourceUrl: z.string().trim().max(2000).default(''),
});

export const courseContentComponentSchema = z.discriminatedUnion('type', [
  baseCourseContentComponentSchema.extend({
    type: z.literal('video'),
  }),
  baseCourseContentComponentSchema.extend({
    type: z.literal('text'),
  }),
  baseCourseContentComponentSchema.extend({
    type: z.literal('quiz'),
    quiz: quizComponentSchema,
  }),
]);

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
