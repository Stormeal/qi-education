import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { AuthRepository } from './authRepository.js';
import { courseReviewerIds, courseTeacherIds } from './course.js';
import type { CourseRepository } from './courseRepository.js';
import type { MailSender } from './mailSender.js';
import { sendReviewRequest } from './courseReviewerMail.js';

export type CourseReviewer = { id: string; displayName: string; email: string; active: boolean };
const reviewerListSchema = z.object({ reviewerIds: z.array(z.string().trim().min(1).max(120)).max(20) });

export function registerCourseReviewersRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; requireAdmin: RequestHandler;
  withCourseLock: (handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) => RequestHandler;
  courses: CourseRepository; auth: Pick<AuthRepository, 'findById'>;
  sender: MailSender; appUrl: string;
}): void {
  const { authenticate, requireAdmin, withCourseLock, courses, auth } = dependencies;
  const path = '/courses/:id/reviewers';
  app.use(path, (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  async function reviewers(ids: string[]): Promise<CourseReviewer[]> {
    return Promise.all(ids.map(async id => {
      const user = await auth.findById(id);
      return { id, displayName: user?.displayName ?? '', email: user?.email ?? '',
        active: !!user && ['teacher', 'admin'].includes(user.role) && user.status === 'active' };
    }));
  }
  app.get(path, authenticate, requireAdmin, async (request, response) => {
    const course = (await courses.listCourses()).find(item => item.id === String(request.params.id));
    if (!course) { response.status(404).json({ message: 'Course not found' }); return; }
    response.json({ reviewers: await reviewers(courseReviewerIds(course)) });
  });
  app.put(path, authenticate, requireAdmin, withCourseLock(async (request, response) => {
    const parsed = reviewerListSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Reviewers must be a list of at most 20 account ids.' }); return;
    }
    const { reviewerIds } = parsed.data;
    if (new Set(reviewerIds).size !== reviewerIds.length) {
      response.status(400).json({ message: 'Each reviewer can be listed once.' }); return;
    }
    const course = (await courses.listCourses()).find(item => item.id === String(request.params.id));
    if (!course) { response.status(404).json({ message: 'Course not found' }); return; }
    const storedIds = new Set(courseReviewerIds(course));
    for (const id of reviewerIds) {
      if (courseTeacherIds(course).includes(id)) {
        response.status(400).json({ message: `${id} teaches this course and cannot also review it.` }); return;
      }
      const user = await auth.findById(id);
      if (!storedIds.has(id) && (!user || !['teacher', 'admin'].includes(user.role) || user.status !== 'active')) {
        response.status(400).json({ message: `${id} is not an active teacher or admin account.` }); return;
      }
    }
    const updated = await courses.updateCourseReviewers(String(request.params.id), reviewerIds);
    if (!updated) { response.status(404).json({ message: 'Course not found' }); return; }
    const assigned = await reviewers(courseReviewerIds(updated));
    const sent = await Promise.all(assigned.filter(reviewer => reviewer.active && !storedIds.has(reviewer.id))
      .map(reviewer => sendReviewRequest(dependencies.sender, reviewer.email, updated, dependencies.appUrl)));
    response.json({ reviewers: assigned,
      ...(sent.includes(false) ? { mailWarning: 'Reviewers were saved, but some emails could not be sent.' } : {}) });
  }));
}
