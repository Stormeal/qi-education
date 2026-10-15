import type { Express, Request, RequestHandler } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import { canSeeCourse } from './courseAccess.js';
import type { CourseRepository } from './courseRepository.js';
import type { LearningHandler } from './learningAccess.js';

// Each app owns its cache, so injected repositories and test instances stay isolated.
export class CourseStatsCache {
  private readonly counts = new Map<string, { expiresAt: number; value: Promise<number> }>();
  constructor(private readonly auth: AuthRepository) {}
  invalidate(courseId: string): void { this.counts.delete(courseId); }
  async count(courseId: string): Promise<number> {
    const cached = this.counts.get(courseId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const entry = { expiresAt: Date.now() + 300000, value: this.auth.listUsers().then(users =>
      users.filter(user => user.status === 'active' && user.enrolledCourseIds.includes(courseId)).length) };
    this.counts.set(courseId, entry);
    try { return await entry.value; }
    catch (error) { if (this.counts.get(courseId) === entry) this.counts.delete(courseId); throw error; }
  }
}
export function registerCourseStatsRoutes(app: Express, dependencies: {
  optionalAuthentication: RequestHandler; read: (handler: LearningHandler) => RequestHandler;
  courses: CourseRepository; stats: CourseStatsCache;
}): void {
  app.get('/courses/:id/stats', dependencies.optionalAuthentication, dependencies.read(async (request, response) => {
    const courseId = String(request.params.id);
    const course = (await dependencies.courses.listCourses()).find(item => item.id === courseId);
    const user = (request as Request & { user?: AuthenticatedUser }).user;
    if (!course || !canSeeCourse(course, user)) { response.status(404).json({ message: 'Course not found' }); return; }
    const enrolledCount = await dependencies.stats.count(courseId);
    response.set('Cache-Control', course.status === 'published' ? 'public, max-age=60' : 'private, no-store');
    response.vary('Authorization');
    response.json({ courseId, enrolledCount });
  }));
}
