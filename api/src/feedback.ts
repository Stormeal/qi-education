import { z } from 'zod';

export const feedbackRatingSchema = z.enum(['great', 'okay', 'needs-work']);
export const feedbackTypeSchema = z.enum(['feedback', 'defect', 'change-request']);
export type FeedbackType = z.infer<typeof feedbackTypeSchema>;
export const feedbackWorkStatusSchema = z.enum(['work', 'completed', 'wont-do']);
export const feedbackPrioritySchema = z.enum(['low', 'medium', 'high']);
export const lessonFeedbackKindSchema = z.enum(['helpful', 'not-helpful', 'problem']);
export const problemCategorySchema = z.enum(['video', 'content-error', 'unclear', 'files', 'other']);
export const createLessonFeedbackSchema = z.object({
  componentId: z.string().trim().min(1).max(120),
  kind: lessonFeedbackKindSchema,
  category: problemCategorySchema.optional(),
  message: z.string().trim().max(2000).default(''),
}).refine(input => input.kind === 'problem' ? input.category !== undefined : input.category === undefined,
  { message: 'A category is required only for problem reports.', path: ['category'] });

export const createFeedbackSchema = z.object({
  page: z.string().trim().min(1).max(120),
  type: feedbackTypeSchema.optional(),
  summary: z.string().trim().min(1).max(120).optional(),
  rating: feedbackRatingSchema.optional(),
  message: z.string().trim().max(2000).default(''),
  userAgent: z.string().trim().max(500).optional(),
  path: z.string().max(500).regex(/^\/(?!\/)[^?#\\\s]*$/, 'Use an internal path without query parameters or fragments.').optional(),
  reproductionSteps: z.string().trim().max(2000).optional(),
  expectedBehavior: z.string().trim().max(2000).optional(),
}).superRefine((input, context) => {
  const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
  if (input.type) {
    if (!input.summary) issue('summary', 'Add a short summary.');
    if (!input.message) issue('message', 'Add a description.');
    if (input.type !== 'feedback' && input.rating) issue('rating', 'Ratings apply only to general feedback.');
  } else if (!input.rating) issue('rating', 'An experience rating is required for legacy feedback.');
  if (input.type !== 'defect' && (input.reproductionSteps !== undefined || input.expectedBehavior !== undefined)) {
    issue('reproductionSteps', 'These details apply only to defect reports.');
  }
});

export const updateFeedbackTriageSchema = z.object({
  workStatus: feedbackWorkStatusSchema,
  priority: feedbackPrioritySchema.nullable().optional(),
});

export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export type FeedbackWorkStatus = z.infer<typeof feedbackWorkStatusSchema>;
export type FeedbackPriority = z.infer<typeof feedbackPrioritySchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema> & {
  courseId?: string;
  componentId?: string;
  lessonFeedbackKind?: z.infer<typeof lessonFeedbackKindSchema>;
  problemCategory?: z.infer<typeof problemCategorySchema>;
};
export type UpdateFeedbackTriageInput = z.infer<typeof updateFeedbackTriageSchema>;

export type FeedbackEntry = CreateFeedbackInput & {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  createdAt: string;
  workStatus?: FeedbackWorkStatus;
  priority?: FeedbackPriority;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
};

export function feedbackType(entry: Pick<FeedbackEntry, 'type' | 'lessonFeedbackKind'>): FeedbackType {
  return entry.type ?? (entry.lessonFeedbackKind === 'problem' ? 'defect' : 'feedback');
}

export const feedbackSheetHeaders = [
  'ID',
  'Created At',
  'User ID',
  'User Email',
  'User Role',
  'Page',
  'Rating',
  'Message',
  'User Agent',
  'Work Status',
  'Priority',
  'GitHub Issue Number',
  'GitHub Issue URL',
  'Course ID',
  'Component ID',
  'Lesson Feedback Kind',
  'Problem Category',
] as const;

export function feedbackToSheetRow(feedback: FeedbackEntry): string[] {
  return [
    feedback.id,
    feedback.createdAt,
    feedback.userId,
    feedback.userEmail,
    feedback.userRole,
    feedback.page,
    feedback.rating ?? '',
    feedback.message,
    feedback.userAgent ?? '',
    feedback.workStatus ?? '',
    feedback.priority ?? '',
    feedback.githubIssueNumber?.toString() ?? '',
    feedback.githubIssueUrl ?? '',
    feedback.courseId ?? '',
    feedback.componentId ?? '',
    feedback.lessonFeedbackKind ?? '',
    feedback.problemCategory ?? '',
  ];
}

export function feedbackFromSheetRow(row: string[]): FeedbackEntry {
  return {
    id: row[0] ?? '',
    createdAt: row[1] ?? '',
    userId: row[2] ?? '',
    userEmail: row[3] ?? '',
    userRole: row[4] ?? '',
    page: row[5] ?? '',
    rating: feedbackRatingSchema.catch('okay').parse(row[6]),
    message: row[7] ?? '',
    userAgent: row[8] || undefined,
    workStatus: feedbackWorkStatusSchema.optional().catch(undefined).parse(row[9] || undefined),
    priority: feedbackPrioritySchema.optional().catch(undefined).parse(row[10] || undefined),
    githubIssueNumber: parseGithubIssueNumber(row[11]),
    githubIssueUrl: row[12] || undefined,
    courseId: row[13] || undefined,
    componentId: row[14] || undefined,
    lessonFeedbackKind: lessonFeedbackKindSchema.optional().catch(undefined).parse(row[15] || undefined),
    problemCategory: problemCategorySchema.optional().catch(undefined).parse(row[16] || undefined),
  };
}

function parseGithubIssueNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
