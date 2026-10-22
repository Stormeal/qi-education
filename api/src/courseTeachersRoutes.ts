import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { AuthRepository } from './authRepository.js';
import { courseTeacherIds } from './course.js';
import type { CourseRepository } from './courseRepository.js';

export type CourseTeacher = { id: string; displayName: string; email: string; active: boolean };
const teacherListSchema = z.object({ teacherIds: z.array(z.string().trim().min(1).max(120)).max(20) });

export function registerCourseTeachersRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; requireAdmin: RequestHandler;
  withCourseLock: (handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) => RequestHandler;
  courses: CourseRepository; auth: Pick<AuthRepository, 'findById'>;
}): void {
  const { authenticate, requireAdmin, withCourseLock, courses, auth } = dependencies;
  const path = '/courses/:id/teachers';
  app.use(path, (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  async function teachers(ids: string[]): Promise<CourseTeacher[]> {
    return Promise.all(ids.map(async id => {
      const user = await auth.findById(id);
      return { id, displayName: user?.displayName ?? '', email: user?.email ?? '',
        active: user?.role === 'teacher' && user.status === 'active' };
    }));
  }
  app.get(path, authenticate, requireAdmin, async (request, response) => {
    const course = (await courses.listCourses()).find(item => item.id === String(request.params.id));
    if (!course) { response.status(404).json({ message: 'Course not found' }); return; }
    response.json({ teachers: await teachers(courseTeacherIds(course)) });
  });
  app.put(path, authenticate, requireAdmin, withCourseLock(async (request, response) => {
    const parsed = teacherListSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Teachers must be a list of at most 20 account ids.' }); return;
    }
    const { teacherIds } = parsed.data;
    if (new Set(teacherIds).size !== teacherIds.length) {
      response.status(400).json({ message: 'Each teacher can be listed once.' }); return;
    }
    for (const id of teacherIds) {
      if ((await auth.findById(id))?.role !== 'teacher') {
        response.status(400).json({ message: `${id} is not a teacher account.` }); return;
      }
    }
    const updated = await courses.updateCourseTeachers(String(request.params.id), teacherIds);
    if (!updated) { response.status(404).json({ message: 'Course not found' }); return; }
    response.json({ teachers: await teachers(courseTeacherIds(updated)) });
  }));
}
