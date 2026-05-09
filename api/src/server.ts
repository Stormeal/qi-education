import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import {
  createSessionToken,
  getRolePermissions,
  loginSchema,
  roleCanCreateCourses,
  toAuthenticatedUser,
  verifyPassword,
  verifySessionToken,
  type AuthenticatedUser,
} from './auth.js';
import { createAuthRepository, type AuthRepository } from './authRepository.js';
import { apiConfig, getCorsOrigins, hasGoogleSheetsConfig } from './config.js';
import { createCourseSchema, updateCourseSchema } from './course.js';
import { createCourseRepository, type CourseRepository } from './courseRepository.js';
import { createFeedbackSchema, updateFeedbackTriageSchema } from './feedback.js';
import { createFeedbackRepository, type FeedbackRepository } from './feedbackRepository.js';

type ServerDependencies = {
  authRepository?: AuthRepository;
  courseRepository?: CourseRepository;
  feedbackRepository?: FeedbackRepository;
};

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export function createServer(dependencies: ServerDependencies = {}) {
  const app = express();
  const auth = dependencies.authRepository ?? createAuthRepository();
  const courses = dependencies.courseRepository ?? createCourseRepository();
  const feedback = dependencies.feedbackRepository ?? createFeedbackRepository();

  app.use(cors({ origin: getCorsOrigins() }));
  app.use(express.json());
  app.use((request, _response, next) => {
    if (request.url === '/api') {
      request.url = '/';
    } else if (request.url.startsWith('/api/')) {
      request.url = request.url.slice('/api'.length);
    }

    next();
  });

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      storage: hasGoogleSheetsConfig() ? 'google-sheets' : 'memory',
    });
  });

  app.get('/health/auth', (_request, response) => {
    if (!apiConfig.AUTH_TOKEN_SECRET) {
      response.status(503).json({
        status: 'unavailable',
        message: 'AUTH_TOKEN_SECRET is required for authentication.',
      });
      return;
    }

    response.json({ status: 'ok' });
  });

  app.post(['/auth/login', '/login'], async (request, response, next) => {
    try {
      const authTokenSecret = apiConfig.AUTH_TOKEN_SECRET;

      if (!authTokenSecret) {
        response.status(503).json({ message: 'Authentication is temporarily unavailable.' });
        return;
      }

      const input = loginSchema.parse(request.body);
      const user = await auth.findByEmail(input.email);

      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        response.status(401).json({ message: 'Invalid email or password' });
        return;
      }

      if (user.status !== 'active') {
        response.status(403).json({ message: 'User account is disabled' });
        return;
      }

      response.json({
        token: createSessionToken(user, authTokenSecret),
        user: toAuthenticatedUser(user),
        permissions: getRolePermissions(user.role),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get(['/auth/me', '/me'], authenticateRequest(auth), (request, response) => {
    const authenticatedRequest = request as AuthenticatedRequest;

    response.json({
      user: authenticatedRequest.user,
      permissions: getRolePermissions(authenticatedRequest.user.role),
    });
  });

  app.get('/courses', async (_request, response, next) => {
    try {
      response.json(await courses.listCourses());
    } catch (error) {
      next(error);
    }
  });

  app.post(
    '/courses',
    authenticateRequest(auth),
    requireCourseCreator,
    async (request, response, next) => {
      try {
        const input = createCourseSchema.parse(request.body);
        response.status(201).json(await courses.createCourse(input));
      } catch (error) {
        next(error);
      }
    },
  );

  app.patch(
    '/courses/:id',
    authenticateRequest(auth),
    requireCourseCreator,
    async (request, response, next) => {
      try {
        const input = updateCourseSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const updatedCourse = await courses.updateCourse(courseId, input);

        if (!updatedCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        response.json(updatedCourse);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post('/feedback', authenticateRequest(auth), async (request, response, next) => {
    try {
      const input = createFeedbackSchema.parse(request.body);
      const authenticatedRequest = request as AuthenticatedRequest;
      const createdFeedback = await feedback.createFeedback(input, authenticatedRequest.user);

      response.status(201).json({
        id: createdFeedback.id,
        createdAt: createdFeedback.createdAt,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/feedback', authenticateRequest(auth), requireAdmin, async (_request, response, next) => {
    try {
      response.json(await feedback.listFeedback());
    } catch (error) {
      next(error);
    }
  });

  app.patch(
    '/feedback/:id/triage',
    authenticateRequest(auth),
    requireAdmin,
    async (request, response, next) => {
      try {
        const input = updateFeedbackTriageSchema.parse(request.body);
        const feedbackId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const updatedFeedback = await feedback.updateFeedbackTriage(feedbackId, input);

        if (!updatedFeedback) {
          response.status(404).json({ message: 'Feedback not found' });
          return;
        }

        response.json(updatedFeedback);
      } catch (error) {
        next(error);
      }
    },
  );

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({ message: 'Invalid request body', issues: error.issues });
      return;
    }

    console.error(error);
    response.status(500).json({ message: 'Unexpected server error' });
  });

  return app;
}

function authenticateRequest(authRepository: AuthRepository) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const authTokenSecret = apiConfig.AUTH_TOKEN_SECRET;

      if (!authTokenSecret) {
        response.status(503).json({ message: 'Authentication is temporarily unavailable.' });
        return;
      }

      const authorization = request.header('authorization');

      if (!authorization?.startsWith('Bearer ')) {
        response.status(401).json({ message: 'Authentication required' });
        return;
      }

      const token = authorization.slice('Bearer '.length);
      const session = verifySessionToken(token, authTokenSecret);

      if (!session) {
        response.status(401).json({ message: 'Invalid or expired session token' });
        return;
      }

      const user = await authRepository.findById(session.sub);

      if (!user || user.status !== 'active') {
        response.status(401).json({ message: 'Authentication required' });
        return;
      }

      (request as AuthenticatedRequest).user = toAuthenticatedUser(user);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireCourseCreator(request: Request, response: Response, next: NextFunction) {
  const { user } = request as AuthenticatedRequest;

  if (!roleCanCreateCourses(user.role)) {
    response.status(403).json({ message: 'Teacher or admin access is required' });
    return;
  }

  next();
}

function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const { user } = request as AuthenticatedRequest;

  if (user.role !== 'admin') {
    response.status(403).json({ message: 'Admin access is required' });
    return;
  }

  next();
}
