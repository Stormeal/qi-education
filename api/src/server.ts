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
  type AuthenticatedUser
} from './auth.js';
import { createAuthRepository, type AuthRepository } from './authRepository.js';
import { apiConfig, getCorsOrigins, hasGoogleSheetsConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { createCourseRepository, type CourseRepository } from './courseRepository.js';

type ServerDependencies = {
  authRepository?: AuthRepository;
  courseRepository?: CourseRepository;
};

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export function createServer(dependencies: ServerDependencies = {}) {
  const app = express();
  const auth = dependencies.authRepository ?? createAuthRepository();
  const courses = dependencies.courseRepository ?? createCourseRepository();

  app.use(cors({ origin: getCorsOrigins() }));
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      storage: hasGoogleSheetsConfig() ? 'google-sheets' : 'memory'
    });
  });

  app.post('/auth/login', async (request, response, next) => {
    try {
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
        token: createSessionToken(user, apiConfig.AUTH_TOKEN_SECRET),
        user: toAuthenticatedUser(user),
        permissions: getRolePermissions(user.role)
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/auth/me', authenticateRequest(auth), (request, response) => {
    const authenticatedRequest = request as AuthenticatedRequest;

    response.json({
      user: authenticatedRequest.user,
      permissions: getRolePermissions(authenticatedRequest.user.role)
    });
  });

  app.get('/courses', async (_request, response, next) => {
    try {
      response.json(await courses.listCourses());
    } catch (error) {
      next(error);
    }
  });

  app.post('/courses', authenticateRequest(auth), requireCourseCreator, async (request, response, next) => {
    try {
      const input = createCourseSchema.parse(request.body);
      response.status(201).json(await courses.createCourse(input));
    } catch (error) {
      next(error);
    }
  });

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
      const authorization = request.header('authorization');

      if (!authorization?.startsWith('Bearer ')) {
        response.status(401).json({ message: 'Authentication required' });
        return;
      }

      const token = authorization.slice('Bearer '.length);
      const session = verifySessionToken(token, apiConfig.AUTH_TOKEN_SECRET);

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
