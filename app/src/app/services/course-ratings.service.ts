import { Injectable, inject } from '@angular/core';
import { ApiClientService } from './api-client.service';

export type MyCourseRating = { stars: number; comment?: string; hidden: boolean; updatedAt: string };
export type MyCourseRatingState = { canRate: boolean; rating: MyCourseRating | null };
export type CourseReview = {
  id: string;
  firstName: string;
  stars: number;
  comment?: string;
  updatedAt: string;
  hidden?: boolean;
  mine?: boolean;
};
export type CourseReviews = { average: number; count: number; reviews: CourseReview[] };
export type SavedCourseRating = { rating: MyCourseRating; average: number; count: number };

/** US-L028 learner ratings. Reads bypass the shared JSON cache: ratings change on other devices. */
@Injectable({ providedIn: 'root' })
export class CourseRatingsService {
  private readonly apiClient = inject(ApiClientService);

  mine(courseId: string, token: string): Promise<MyCourseRatingState> {
    return this.request(`/users/me/courses/${encodeURIComponent(courseId)}/rating`, token, 'GET', undefined, 'Unable to load your rating.');
  }

  save(courseId: string, input: { stars: number; comment?: string }, token: string): Promise<SavedCourseRating> {
    return this.request(`/users/me/courses/${encodeURIComponent(courseId)}/rating`, token, 'PUT', input, 'Unable to save your rating.');
  }

  reviews(courseId: string, token: string): Promise<CourseReviews> {
    return this.request(`/courses/${encodeURIComponent(courseId)}/reviews`, token, 'GET', undefined, 'Unable to load reviews.');
  }

  async setHidden(courseId: string, reviewId: string, hidden: boolean, token: string): Promise<void> {
    await this.request(`/admin/courses/${encodeURIComponent(courseId)}/reviews/${encodeURIComponent(reviewId)}`, token, 'PATCH', { hidden }, 'Unable to update the review.');
  }

  private async request<T>(path: string, token: string, method: string, input: unknown, fallback: string): Promise<T> {
    let response: Response;
    try {
      response = await this.apiClient.fetch(path, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(input === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      });
    } catch {
      throw new Error(fallback);
    }
    if (response.ok && response.status === 204) return undefined as T;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' && body.message.trim()
        ? body.message : fallback;
      throw new Error(message);
    }
    if (body === undefined) throw new Error(fallback);
    return body as T;
  }
}
