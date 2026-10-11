import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthenticatedUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { CourseRepository } from './courseRepository.js';
import { instructorProfileSchema } from './instructorProfile.js';
import { InstructorProfileUnavailableError, type InstructorProfileRepository } from './instructorProfileRepository.js';

type Handler = (request: Request, response: Response) => Promise<void>;
const owner = (request: Request) => (request as Request & { user: AuthenticatedUser }).user.id;

export function registerInstructorProfileRoutes(app: Express, dependencies: {
  authenticate: RequestHandler; requireCreator: RequestHandler; requireAdmin: RequestHandler;
  profiles: InstructorProfileRepository; auth: AuthRepository; courses: CourseRepository;
}): void {
  const { profiles, auth, courses, authenticate, requireCreator, requireAdmin } = dependencies;
  const ownPath = '/users/me/instructor-profile';
  const adminPath = '/admin/instructor-profiles';
  app.use([ownPath, adminPath, '/instructors'], (_request, response, next) => {
    response.set('Cache-Control', 'private, no-store'); response.vary('Authorization'); next();
  });
  const handle = (handler: Handler) => async (request: Request, response: Response, next: NextFunction) => {
    try { await handler(request, response); }
    catch (error) {
      if (error instanceof InstructorProfileUnavailableError) response.status(503).json({ message: error.message });
      else next(error);
    }
  };

  app.get(ownPath, authenticate, requireCreator, handle(async (request, response) => {
    response.json({ description: (await profiles.get(owner(request)))?.description ?? '' });
  }));
  app.put(ownPath, authenticate, requireCreator, handle(async (request, response) => {
    const parsed = instructorProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ message: 'Description must be a string of at most 280 characters after trimming.' });
      return;
    }
    await profiles.save(owner(request), parsed.data.description);
    response.json({ description: parsed.data.description });
  }));
  app.get('/instructors', handle(async (_request, response) => {
    // No authentication or author-view scope: only the reviewed live catalog.
    const [saved, catalog] = await Promise.all([profiles.list(), courses.listCourses()]);
    const publishedByOwner = new Map<string, string[]>();
    for (const course of catalog) {
      if (course.status !== 'published' || !course.ownerUserId) continue;
      const ids = publishedByOwner.get(course.ownerUserId) ?? [];
      ids.push(course.id); publishedByOwner.set(course.ownerUserId, ids);
    }
    response.json(saved.filter(profile => profile.description && publishedByOwner.has(profile._id))
      .map(profile => ({ description: profile.description, courseIds: publishedByOwner.get(profile._id)! })));
  }));
  app.get(adminPath, authenticate, requireAdmin, handle(async (_request, response) => {
    const saved = (await profiles.list()).filter(profile => profile.description);
    response.json(await Promise.all(saved.map(async profile => ({
      userId: profile._id, displayName: (await auth.findById(profile._id))?.displayName ?? '', description: profile.description,
    }))));
  }));
  app.delete(`${adminPath}/:userId`, authenticate, requireAdmin, handle(async (request, response) => {
    await profiles.clear(String(request.params.userId));
    response.status(204).end();
  }));
}
