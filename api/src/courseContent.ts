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
  questions: z.array(quizQuestionSchema).max(50).default([]),
});

const baseCourseContentComponentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  durationMinutes: z.coerce.number().int().min(0).max(600).default(0),
  content: z.string().trim().max(20000).default(''),
  resourceUrl: z.string().trim().max(2000).default(''),
  attachments: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(120),
        assetId: z.string().trim().min(1).max(200),
        fileName: z.string().trim().min(1).max(240),
        contentType: z.string().trim().min(1).max(160),
        sizeBytes: z.coerce.number().int().nonnegative().max(25 * 1024 * 1024),
        createdAt: z.string().trim().min(1).max(80),
      }),
    )
    .max(50)
    .default([]),
});

const muxVideoSchema = z.object({
  provider: z.literal('mux').default('mux'),
  uploadId: z.string().trim().max(200).default(''),
  assetId: z.string().trim().max(200).default(''),
  playbackId: z.string().trim().max(200).default(''),
  playbackPolicy: z.enum(['public', 'signed']).default('public'),
  status: z.enum(['waiting', 'uploading', 'processing', 'ready', 'errored']).default('waiting'),
  durationSeconds: z.coerce.number().nonnegative().nullable().default(null),
  thumbnailUrl: z.string().trim().max(2000).default(''),
  errorMessage: z.string().trim().max(1000).default(''),
  captions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        languageCode: z.string().trim().min(1).max(35),
        name: z.string().trim().max(120).default(''),
        status: z.enum(['ready', 'processing', 'errored']).default('processing'),
      }),
    )
    .default([]),
});

export const courseContentComponentSchema = z.discriminatedUnion('type', [
  baseCourseContentComponentSchema.extend({
    type: z.literal('video'),
    mux: muxVideoSchema.optional(),
  }),
  baseCourseContentComponentSchema.extend({
    type: z.literal('text'),
  }),
  baseCourseContentComponentSchema.extend({
    type: z.literal('quiz'),
    quiz: quizComponentSchema,
  }),
  baseCourseContentComponentSchema.extend({
    type: z.literal('resources'),
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

export const createMuxUploadSchema = z.object({
  sectionId: z.string().trim().min(1).max(120),
});

export type CourseContentComponent = z.infer<typeof courseContentComponentSchema>;
export type CourseContentSection = z.infer<typeof courseContentSectionSchema>;
export type UpdateCourseContentInput = z.infer<typeof updateCourseContentSchema>;
