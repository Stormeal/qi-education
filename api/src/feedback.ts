import { z } from 'zod';

export const feedbackRatingSchema = z.enum(['great', 'okay', 'needs-work']);

export const createFeedbackSchema = z.object({
  page: z.string().trim().min(1).max(120),
  rating: feedbackRatingSchema,
  message: z.string().trim().max(2000).default(''),
  userAgent: z.string().trim().max(500).optional(),
});

export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export type FeedbackEntry = CreateFeedbackInput & {
  id: string;
  userId: string;
  userEmail: string;
  userRole: string;
  createdAt: string;
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
  ];
}
