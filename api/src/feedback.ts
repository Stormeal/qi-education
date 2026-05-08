import { z } from 'zod';

export const feedbackRatingSchema = z.enum(['great', 'okay', 'needs-work']);
export const feedbackWorkStatusSchema = z.enum(['work', 'completed', 'wont-do']);
export const feedbackPrioritySchema = z.enum(['low', 'medium', 'high']);

export const createFeedbackSchema = z.object({
  page: z.string().trim().min(1).max(120),
  rating: feedbackRatingSchema,
  message: z.string().trim().max(2000).default(''),
  userAgent: z.string().trim().max(500).optional(),
});

export const updateFeedbackTriageSchema = z.object({
  workStatus: feedbackWorkStatusSchema,
  priority: feedbackPrioritySchema.nullable().optional(),
});

export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export type FeedbackWorkStatus = z.infer<typeof feedbackWorkStatusSchema>;
export type FeedbackPriority = z.infer<typeof feedbackPrioritySchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type UpdateFeedbackTriageInput = z.infer<typeof updateFeedbackTriageSchema>;

export type FeedbackEntry = CreateFeedbackInput & {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  createdAt: string;
  workStatus?: FeedbackWorkStatus;
  priority?: FeedbackPriority;
};

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
] as const;

export function feedbackToSheetRow(feedback: FeedbackEntry): string[] {
  return [
    feedback.id,
    feedback.createdAt,
    feedback.userId,
    feedback.userEmail,
    feedback.userRole,
    feedback.page,
    feedback.rating,
    feedback.message,
    feedback.userAgent ?? '',
    feedback.workStatus ?? '',
    feedback.priority ?? '',
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
  };
}
