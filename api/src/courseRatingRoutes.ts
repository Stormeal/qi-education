import type { Express, Request, RequestHandler } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { Course } from './course.js';
import { canSeeCourse } from './courseAccess.js';
import type { CourseContentRepository } from './courseContentRepository.js';
import type { CourseRatingRepository } from './courseRatingRepository.js';
import type { CourseRepository } from './courseRepository.js';
import { aggregateRatings, ratingInputSchema, ratingRefusal, reviewVisibilitySchema, type CourseRating } from './courseRatings.js';
import { clearCourseRequestReads } from './courseRequestReads.js';
import { CourseReadOnlyError } from './courseStore.js';
import type { LearningProgressRepository } from './learningProgressRepository.js';

const caller = (request: Request) => (request as Request & { user?: AuthenticatedUser }).user;
const ratingView = ({ stars, comment, hidden, updatedAt }: CourseRating) => ({ stars, ...(comment ? { comment } : {}), hidden, updatedAt });
class RatingError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function registerCourseRatingRoutes(app: Express, deps: {
  authenticate: RequestHandler; optionalAuthenticate: RequestHandler; requireAdmin: RequestHandler;
  auth: AuthRepository; courses: CourseRepository; storedCourses: CourseRepository;
  content: CourseContentRepository; progress: LearningProgressRepository; ratings: CourseRatingRepository;
}): void {
  const privateResponse: RequestHandler = (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  };
  const findCourse = async (id: string): Promise<Course> => {
    const course = (await deps.courses.listCourses()).find(course => course.id === id);
    if (!course) throw new RatingError(404, 'Course not found');
    return course;
  };
  const refusal = async (course: Course, user: AuthenticatedUser) => {
    const [progress, content] = await Promise.all([deps.progress.get(user.id, course.id), deps.content.getCourseContent(course.id)]);
    return ratingRefusal(course, user, progress?.completedIds ?? [], content?.sections.flatMap(section => section.components.map(lesson => lesson.id)) ?? []);
  };
  const rewriteAggregate = async (course: Course) => {
    const aggregate = aggregateRatings(await deps.ratings.listForCourse(course.id));
    // Bypass authoring snapshots: these derived catalog fields are live even on
    // published courses, and their write must not advance a review revision.
    const updated = await deps.storedCourses.updateCourseCatalogMetadata(course.id, {
      isPremium: course.isPremium, isBestseller: course.isBestseller, category: course.category, languages: course.languages,
      rating: aggregate.average, ratingCount: aggregate.count,
    });
    if (!updated) throw new RatingError(404, 'Course not found');
    return aggregate;
  };
  async function change<T>(id: string, operation: (course: Course) => Promise<T>): Promise<T> {
    await findCourse(id);
    if (deps.storedCourses.readOnly) throw new CourseReadOnlyError();
    if (deps.storedCourses.storageType !== 'memory' && deps.content.storageType !== 'mongodb') {
      throw new RatingError(503, 'Shared course operations require MongoDB content and coordination storage.');
    }
    // The same durable lock serializes catalog edits and rating/moderation writes
    // across instances. Send the HTTP response only after the lock is released.
    return deps.content.withCourseMutationLock(id, async () => {
      clearCourseRequestReads();
      return operation(await findCourse(id));
    });
  }
  const handle = (operation: (request: Request) => Promise<unknown>, status = 200): RequestHandler => async (request, response, next) => {
    try {
      const result = await operation(request);
      if (status === 204) response.status(204).send();
      else response.status(status).json(result);
    } catch (error) {
      if (error instanceof RatingError) response.status(error.status).json({ message: error.message });
      else next(error);
    }
  };

  const ownPath = '/users/me/courses/:id/rating';
  app.get(ownPath, privateResponse, deps.authenticate, handle(async request => {
    const course = await findCourse(String(request.params.id));
    const user = caller(request)!;
    const [reason, rating] = await Promise.all([refusal(course, user), deps.ratings.get(course.id, user.id)]);
    return { canRate: reason === null, rating: rating ? ratingView(rating) : null };
  }));
  app.put(ownPath, privateResponse, deps.authenticate, handle(async request => {
    const input = ratingInputSchema.parse(request.body);
    return change(String(request.params.id), async course => {
      const user = caller(request)!;
      const reason = await refusal(course, user);
      if (reason) throw new RatingError(403, reason);
      const rating = await deps.ratings.upsert(course.id, user.id, input);
      return { rating: ratingView(rating), ...await rewriteAggregate(course) };
    });
  }));
  app.get('/courses/:id/reviews', privateResponse, deps.optionalAuthenticate, handle(async request => {
    const course = await findCourse(String(request.params.id));
    const user = caller(request);
    if (!canSeeCourse(course, user)) throw new RatingError(404, 'Course not found');
    const rows = await deps.ratings.listForCourse(course.id);
    const permitted = rows.filter(row => !row.hidden || user?.role === 'admin' || row.userId === user?.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)).slice(0, 50);
    const reviews = await Promise.all(permitted.map(async row => {
      const author = await deps.auth.findById(row.userId, { fresh: true });
      const firstName = author && !author.privacyErasure ? author.displayName.trim().split(/\s+/)[0] || 'Learner' : 'Learner';
      return { id: row.id, firstName, stars: row.stars, ...(row.comment ? { comment: row.comment } : {}), updatedAt: row.updatedAt,
        ...(row.hidden ? { hidden: true } : {}), ...(user?.id === row.userId ? { mine: true } : {}) };
    }));
    return { ...aggregateRatings(rows), reviews };
  }));
  app.patch('/admin/courses/:id/reviews/:reviewId', privateResponse, deps.authenticate, deps.requireAdmin, handle(async request => {
    const input = reviewVisibilitySchema.parse(request.body);
    await change(String(request.params.id), async course => {
      if (!await deps.ratings.setHidden(course.id, String(request.params.reviewId), input.hidden)) throw new RatingError(404, 'Review not found');
      await rewriteAggregate(course);
    });
  }, 204));
}
