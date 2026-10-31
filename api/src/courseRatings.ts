import { z } from 'zod';
import type { AuthenticatedUser } from './auth.js';
import { courseTeacherIds, type Course } from './course.js';

export const ratingInputSchema = z.object({
  stars: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional(),
}).strict().transform(({ stars, comment }) => ({ stars, ...(comment ? { comment } : {}) }));
export const reviewVisibilitySchema = z.object({ hidden: z.boolean() }).strict();
export type RatingInput = z.infer<typeof ratingInputSchema>;
export type CourseRating = RatingInput & {
  id: string; courseId: string; userId: string; hidden: boolean; createdAt: string; updatedAt: string;
};
export type ExportedCourseRating = Omit<CourseRating, 'id' | 'userId'>;

export function ratingRefusal(course: Course, user: AuthenticatedUser, completedIds: readonly string[], lessonIds: readonly string[]): string | null {
  if (course.ownerUserId === user.id || courseTeacherIds(course).includes(user.id)) return 'Teachers cannot rate their own course.';
  if (!user.enrolledCourseIds.includes(course.id) || !completedIds.some(id => lessonIds.includes(id))) {
    return 'Complete a lesson in this course before rating it.';
  }
  return null;
}

export function aggregateRatings(ratings: readonly Pick<CourseRating, 'stars' | 'hidden'>[]): { average: number; count: number } {
  const visible = ratings.filter(rating => !rating.hidden);
  return { average: visible.length ? Math.round(visible.reduce((sum, rating) => sum + rating.stars, 0) / visible.length * 10) / 10 : 0,
    count: visible.length };
}
