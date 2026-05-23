import cors from 'cors';
import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import {
  createSessionToken,
  getRolePermissions,
  hashPassword,
  loginSchema,
  roleCanCreateCourses,
  signupSchema,
  toAuthenticatedUser,
  verifyPassword,
  verifySessionToken,
  type AuthUser,
  type AuthenticatedUser,
} from './auth.js';
import { createAuthRepository, type AuthRepository } from './authRepository.js';
import { apiConfig, getCorsOrigins, hasGoogleSheetsConfig, hasMongoConfig, hasMuxConfig } from './config.js';
import { createCourseSchema, updateCoursePriceSchema, updateCourseSchema } from './course.js';
import {
  createMuxUploadSchema,
  updateCourseContentSchema,
  type CourseContentSection,
} from './courseContent.js';
import { createCourseRepository, type CourseRepository } from './courseRepository.js';
import { createFeedbackSchema, updateFeedbackTriageSchema } from './feedback.js';
import { createFeedbackRepository, type FeedbackRepository } from './feedbackRepository.js';
import {
  ConfiguredGitHubFeedbackService,
  GitHubFeedbackError,
  type GitHubFeedbackService,
} from './githubFeedback.js';
import {
  createCourseContentRepository,
  type CourseContentRepository,
} from './courseContentRepository.js';
import {
  createMuxVideoService,
  createMuxWebhookService,
  type MuxVideoService,
  type MuxWebhookEvent,
  type MuxWebhookService,
} from './muxService.js';

type ServerDependencies = {
  authRepository?: AuthRepository;
  courseRepository?: CourseRepository;
  feedbackRepository?: FeedbackRepository;
  courseContentRepository?: CourseContentRepository;
  gitHubFeedbackService?: GitHubFeedbackService;
  muxVideoService?: MuxVideoService | null;
  muxWebhookService?: MuxWebhookService | null;
};

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export function createServer(dependencies: ServerDependencies = {}) {
  const app = express();
  const auth = dependencies.authRepository ?? createAuthRepository();
  const courses = dependencies.courseRepository ?? createCourseRepository();
  const feedback = dependencies.feedbackRepository ?? createFeedbackRepository();
  const courseContent = dependencies.courseContentRepository ?? createCourseContentRepository();
  const gitHubFeedback = dependencies.gitHubFeedbackService ?? new ConfiguredGitHubFeedbackService();
  const muxVideo = dependencies.muxVideoService ?? createMuxVideoService();
  const muxWebhook = dependencies.muxWebhookService ?? createMuxWebhookService();

  app.use(cors({ origin: getCorsOrigins() }));
  app.post(
    ['/webhooks/mux', '/api/webhooks/mux'],
    express.raw({ type: 'application/json' }),
    async (request, response, next) => {
      try {
        if (!muxWebhook) {
          response.status(503).json({ message: 'Mux webhooks are not configured.' });
          return;
        }

        const body = Buffer.isBuffer(request.body)
          ? request.body.toString('utf8')
          : typeof request.body === 'string'
            ? request.body
            : '';
        const event = await muxWebhook.unwrapWebhook(body, request.headers);
        await handleMuxWebhookEvent(event, courseContent);

        response.json({ received: true });
      } catch (error) {
        if (error instanceof Error && isMuxSignatureError(error)) {
          response.status(401).json({ message: 'Invalid Mux webhook signature.' });
          return;
        }

        next(error);
      }
    },
  );
  app.use(express.json());
  app.use((_request, response, next) => {
    response.setHeader('X-QI-Education-Auth-Storage', hasGoogleSheetsConfig() ? 'google-sheets' : 'memory');
    response.setHeader('X-QI-Education-Content-Storage', courseContent.storageType);
    next();
  });
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

  app.get('/health/config', (_request, response) => {
    response.json({
      status: 'ok',
      auth: {
        configured: Boolean(apiConfig.AUTH_TOKEN_SECRET),
        storage: hasGoogleSheetsConfig() ? 'google-sheets' : 'memory',
      },
      content: {
        storage: courseContent.storageType,
        configured: hasMongoConfig(),
      },
      mux: {
        configured: hasMuxConfig() || Boolean(muxVideo),
        playbackPolicy: apiConfig.MUX_DEFAULT_PLAYBACK_POLICY,
      },
      corsOrigins: getCorsOrigins(),
      ranges: {
        courses: apiConfig.GOOGLE_SHEETS_COURSES_RANGE,
        users: apiConfig.GOOGLE_SHEETS_USERS_RANGE,
        feedback: apiConfig.GOOGLE_SHEETS_FEEDBACK_RANGE,
      },
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

  app.get('/health/content', async (_request, response) => {
    const body = courseContentHealthBody(courseContent.storageType);

    try {
      await courseContent.checkHealth();
      response.json({
        ...body,
        status: 'ok',
      });
    } catch (error) {
      console.error('Course content storage health check failed.', error);
      response.status(503).json({
        ...body,
        status: 'unavailable',
        message: 'Course content storage is unavailable.',
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    }
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

      response.json(createAuthResponse(user, authTokenSecret));
    } catch (error) {
      next(error);
    }
  });

  app.post(['/auth/signup', '/signup'], async (request, response, next) => {
    try {
      const authTokenSecret = apiConfig.AUTH_TOKEN_SECRET;

      if (!authTokenSecret) {
        response.status(503).json({ message: 'Authentication is temporarily unavailable.' });
        return;
      }

      const input = signupSchema.parse(request.body);
      const existingUser = await auth.findByEmail(input.email);

      if (existingUser) {
        response.status(409).json({ message: 'An account with this email already exists' });
        return;
      }

      const user = await auth.createUser({
        id: randomUUID(),
        email: input.email,
        displayName: input.displayName,
        passwordHash: hashPassword(input.password),
        role: 'student',
        status: 'active',
        createdAt: new Date().toISOString(),
        enrolledCourseIds: [],
      });

      response.status(201).json(createAuthResponse(user, authTokenSecret));
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

  app.post('/users/me/courses/:id', authenticateRequest(auth), async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;
      const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

      if (!matchingCourse) {
        response.status(404).json({ message: 'Course not found' });
        return;
      }

      const updatedUser = await auth.enrollUserInCourse(authenticatedRequest.user.id, courseId);

      if (!updatedUser) {
        response.status(404).json({ message: 'User not found' });
        return;
      }

      response.json({
        user: toAuthenticatedUser(updatedUser),
        permissions: getRolePermissions(updatedUser.role),
      });
    } catch (error) {
      next(error);
    }
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
        const seed = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
        };

        await courseContent.createEmptyCourseContent(seed.id, seed.createdAt);

        try {
          response.status(201).json(await courses.createCourse(input, seed));
        } catch (error) {
          await courseContent.deleteCourseContent(seed.id);
          throw error;
        }
      } catch (error) {
        next(error);
      }
    },
  );

  app.get('/courses/:id/content', async (request, response, next) => {
    const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;

    try {
      const content = await courseContent.getCourseContent(courseId);

      if (!content) {
        response.status(404).json({ message: 'Course content not found' });
        return;
      }

      response.json(content);
    } catch (error) {
      console.error(`Unable to load stored content for course ${courseId}.`, error);
      response.status(503).json({ message: 'Course content storage is unavailable.' });
    }
  });

  app.patch(
    '/courses/:id/content',
    authenticateRequest(auth),
    requireCourseCreator,
    async (request, response, next) => {
      try {
        const input = updateCourseContentSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        response.json(await courseContent.updateCourseContent(courseId, input.sections));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    '/courses/:id/content/components/:componentId/mux-upload',
    authenticateRequest(auth),
    requireCourseCreator,
    async (request, response, next) => {
      try {
        if (!muxVideo) {
          response.status(503).json({ message: 'Mux video uploads are not configured.' });
          return;
        }

        const input = createMuxUploadSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const componentId = Array.isArray(request.params.componentId)
          ? request.params.componentId[0]
          : request.params.componentId;
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        const content = await courseContent.getCourseContent(courseId);

        if (!content) {
          response.status(404).json({ message: 'Course content not found' });
          return;
        }

        const videoComponent = findCourseVideoComponent(content.sections, input.sectionId, componentId);

        if (!videoComponent) {
          response.status(404).json({ message: 'Video component not found' });
          return;
        }

        if (videoComponent.mux) {
          response.status(409).json({ message: 'Remove the existing video before uploading a new one.' });
          return;
        }

        const upload = await muxVideo.createDirectUpload({
          courseId,
          sectionId: input.sectionId,
          componentId,
          corsOrigin: request.header('origin') ?? getCorsOrigins()[0] ?? 'http://localhost:4200',
        });
        const updatedSections = content.sections.map((section) =>
          section.id === input.sectionId
            ? {
                ...section,
                components: section.components.map((component) =>
                  component.id === componentId && component.type === 'video'
                    ? {
                        ...component,
                        mux: {
                          provider: 'mux' as const,
                          uploadId: upload.uploadId,
                          assetId: '',
                          playbackId: '',
                          playbackPolicy: upload.playbackPolicy,
                          status: 'waiting' as const,
                          durationSeconds: null,
                          thumbnailUrl: '',
                          errorMessage: '',
                          captions: [],
                        },
                      }
                    : component,
                ),
              }
            : section,
        );
        const updatedContent = await courseContent.updateCourseContent(courseId, updatedSections);

        response.status(201).json({
          uploadId: upload.uploadId,
          uploadUrl: upload.uploadUrl,
          playbackPolicy: upload.playbackPolicy,
          content: updatedContent,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  app.delete(
    '/courses/:id/content/components/:componentId/mux-video',
    authenticateRequest(auth),
    requireCourseCreator,
    async (request, response, next) => {
      try {
        const input = createMuxUploadSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const componentId = Array.isArray(request.params.componentId)
          ? request.params.componentId[0]
          : request.params.componentId;
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        const content = await courseContent.getCourseContent(courseId);

        if (!content) {
          response.status(404).json({ message: 'Course content not found' });
          return;
        }

        const videoComponent = findCourseVideoComponent(content.sections, input.sectionId, componentId);

        if (!videoComponent) {
          response.status(404).json({ message: 'Video component not found' });
          return;
        }

        if (!videoComponent.mux) {
          response.status(409).json({ message: 'This component does not have a Mux video.' });
          return;
        }

        const updatedSections = content.sections.map((section) =>
          section.id === input.sectionId
            ? {
                ...section,
                components: section.components.map((component) => {
                  if (component.id !== componentId || component.type !== 'video') {
                    return component;
                  }

                  const { mux: _removedMux, ...componentWithoutMux } = component;

                  return componentWithoutMux;
                }),
              }
            : section,
        );
        const updatedContent = await courseContent.updateCourseContent(courseId, updatedSections);

        response.json({ content: updatedContent });
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

  app.patch(
    '/courses/:id/price',
    authenticateRequest(auth),
    requireAdmin,
    async (request, response, next) => {
      try {
        const input = updateCoursePriceSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const updatedCourse = await courses.updateCoursePrice(courseId, input);

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
        const existingFeedback = await feedback.findFeedbackById(feedbackId);

        if (!existingFeedback) {
          response.status(404).json({ message: 'Feedback not found' });
          return;
        }

        const githubIssue =
          input.workStatus === 'work' && !existingFeedback.githubIssueUrl
            ? await gitHubFeedback.createIssueFromFeedback({
                ...existingFeedback,
                workStatus: input.workStatus,
                priority: input.priority ?? undefined,
              })
            : null;
        const updatedFeedback = await feedback.updateFeedbackTriage(feedbackId, {
          ...input,
          githubIssueNumber: githubIssue?.number ?? existingFeedback.githubIssueNumber,
          githubIssueUrl: githubIssue?.url ?? existingFeedback.githubIssueUrl,
        });

        if (!updatedFeedback) {
          response.status(404).json({ message: 'Feedback not found' });
          return;
        }

        response.json(updatedFeedback);
      } catch (error) {
        if (error instanceof GitHubFeedbackError) {
          response.status(503).json({ message: 'GitHub feedback integration is unavailable.' });
          return;
        }

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

function createAuthResponse(user: AuthUser, secret: string) {
  return {
    token: createSessionToken(user, secret),
    user: toAuthenticatedUser(user),
    permissions: getRolePermissions(user.role),
  };
}

function courseContentHealthBody(storage: CourseContentRepository['storageType']) {
  return {
    storage,
    configured: hasMongoConfig(),
    database: apiConfig.MONGODB_DB_NAME || null,
    collection: apiConfig.MONGODB_COURSE_CONTENT_COLLECTION || null,
  };
}

async function handleMuxWebhookEvent(
  event: MuxWebhookEvent,
  courseContent: CourseContentRepository,
) {
  switch (event.type) {
    case 'video.upload.asset_created': {
      const data = event.data as Extract<MuxWebhookEvent, { type: 'video.upload.asset_created' }>['data'];
      const passthrough = parseMuxPassthrough(data.new_asset_settings?.passthrough);

      if (!passthrough || !data.asset_id) {
        return;
      }

      await updateMuxVideoComponent(courseContent, passthrough, {
        uploadId: data.id,
        assetId: data.asset_id,
        status: 'processing',
      });
      return;
    }
    case 'video.asset.ready': {
      const data = event.data as Extract<MuxWebhookEvent, { type: 'video.asset.ready' }>['data'];
      const passthrough = parseMuxPassthrough(data.passthrough);
      const playback = data.playback_ids?.find((item) => item.policy === 'public' || item.policy === 'signed')
        ?? data.playback_ids?.[0];

      if (!passthrough || !playback?.id) {
        return;
      }

      await updateMuxVideoComponent(courseContent, passthrough, {
        uploadId: data.upload_id,
        assetId: data.id,
        playbackId: playback.id,
        playbackPolicy: playback.policy === 'signed' ? 'signed' : 'public',
        status: 'ready',
        durationSeconds: data.duration ?? null,
        thumbnailUrl: `https://image.mux.com/${playback.id}/thumbnail.jpg`,
        errorMessage: '',
      });
      return;
    }
    case 'video.asset.errored': {
      const data = event.data as Extract<MuxWebhookEvent, { type: 'video.asset.errored' }>['data'];
      const passthrough = parseMuxPassthrough(data.passthrough);

      if (!passthrough) {
        return;
      }

      await updateMuxVideoComponent(courseContent, passthrough, {
        uploadId: data.upload_id,
        assetId: data.id,
        status: 'errored',
        errorMessage: muxErrorMessage(data.errors),
      });
      return;
    }
    default:
      return;
  }
}

type MuxPassthrough = {
  courseId: string;
  sectionId: string;
  componentId: string;
};

type MuxVideoUpdate = {
  uploadId?: string;
  assetId?: string;
  playbackId?: string;
  playbackPolicy?: 'public' | 'signed';
  status?: 'waiting' | 'uploading' | 'processing' | 'ready' | 'errored';
  durationSeconds?: number | null;
  thumbnailUrl?: string;
  errorMessage?: string;
};

async function updateMuxVideoComponent(
  courseContent: CourseContentRepository,
  passthrough: MuxPassthrough,
  update: MuxVideoUpdate,
) {
  const content = await courseContent.getCourseContent(passthrough.courseId);

  if (!content) {
    return;
  }

  const updatedSections = content.sections.map((section) =>
    section.id === passthrough.sectionId
      ? {
          ...section,
          components: section.components.map((component) => {
            if (component.id !== passthrough.componentId || component.type !== 'video' || !component.mux) {
              return component;
            }

            if (update.uploadId && component.mux.uploadId !== update.uploadId) {
              return component;
            }

            return {
              ...component,
              mux: {
                provider: 'mux' as const,
                uploadId: component.mux.uploadId,
                assetId: update.assetId ?? component.mux.assetId,
                playbackId: update.playbackId ?? component.mux.playbackId,
                playbackPolicy: update.playbackPolicy ?? component.mux.playbackPolicy,
                status: update.status ?? component.mux.status,
                durationSeconds: update.durationSeconds ?? component.mux.durationSeconds,
                thumbnailUrl: update.thumbnailUrl ?? component.mux.thumbnailUrl,
                errorMessage: update.errorMessage ?? component.mux.errorMessage,
                captions: component.mux.captions,
              },
            };
          }),
        }
      : section,
  );

  await courseContent.updateCourseContent(passthrough.courseId, updatedSections);
}

function parseMuxPassthrough(value: string | undefined): MuxPassthrough | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<Record<'c' | 's' | 'm' | 'courseId' | 'sectionId' | 'componentId', unknown>>;
    const courseId = typeof parsed.c === 'string' ? parsed.c : parsed.courseId;
    const sectionId = typeof parsed.s === 'string' ? parsed.s : parsed.sectionId;
    const componentId = typeof parsed.m === 'string' ? parsed.m : parsed.componentId;

    if (
      typeof courseId !== 'string' ||
      typeof sectionId !== 'string' ||
      typeof componentId !== 'string'
    ) {
      return null;
    }

    return { courseId, sectionId, componentId };
  } catch {
    return null;
  }
}

function muxErrorMessage(errors: { messages?: string[]; type?: string } | undefined) {
  return errors?.messages?.[0] ?? errors?.type ?? 'Mux could not process this video.';
}

function isMuxSignatureError(error: Error) {
  return (
    error.message.includes('mux-signature') ||
    error.message.includes('signature') ||
    error.message.includes('webhook secret') ||
    error.message.includes('Webhook body') ||
    error.message.includes('timestamp')
  );
}

function findCourseVideoComponent(
  sections: CourseContentSection[],
  sectionId: string,
  componentId: string,
) {
  const section = sections.find((item) => item.id === sectionId);
  const component = section?.components.find((item) => item.id === componentId);

  return component?.type === 'video' ? component : null;
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
