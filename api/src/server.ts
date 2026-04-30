import cors from 'cors';
import express from 'express';
import { ZodError } from 'zod';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
import { createCourseSchema } from './course.js';
import { createCourseRepository } from './courseRepository.js';

export function createServer() {
  const app = express();
  const courses = createCourseRepository();

  app.use(cors({ origin: apiConfig.CORS_ORIGIN }));
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      storage: hasGoogleSheetsConfig() ? 'google-sheets' : 'memory'
    });
  });

  app.get('/courses', async (_request, response, next) => {
    try {
      response.json(await courses.listCourses());
    } catch (error) {
      next(error);
    }
  });

  app.post('/courses', async (request, response, next) => {
    try {
      const input = createCourseSchema.parse(request.body);
      response.status(201).json(await courses.createCourse(input));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({ message: 'Invalid request body', issues: error.issues });
      return;
    }

    console.error(error);
    response.status(500).json({ message: 'Unexpected server error' });
  });

  return app;
}
