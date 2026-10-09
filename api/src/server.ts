import { CourseReviewError, type CourseReviewService, reviewActionSchema, reviewedRepositories, reviewScope } from './courseReview.js';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
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
import {
  apiConfig,
  getCorsOrigins,
  hasGoogleSheetsConfig,
  hasMongoAssetConfig,
  hasMongoConfig,
  hasMuxConfig,
} from './config.js';
import {
  createCourseSchema,
  updateCourseCatalogMetadataSchema,
  updateCoursePriceSchema,
  updateCourseSchema,
} from './course.js';
import {
  createMuxUploadSchema,
  updateCourseContentSchema,
  type CourseContentSection,
} from './courseContent.js';
import {
  createCourseAssetRepository,
  type CourseAssetRepository,
} from './courseAssetRepository.js';
import { createCourseRepository, type CourseRepository } from './courseRepository.js';
import { canAuthorCourse, canLearnCourse, canSeeCourse, courseOutline, learnerCourseContent } from './courseAccess.js';
import { assessmentIssues, quizAttemptSchema, scoreQuiz } from './quizAssessment.js';
import { AmbiguousCourseWriteError, CourseBusyError, protectCourseWrite } from './courseMutationLock.js';
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
  courseAssetRepository?: CourseAssetRepository;
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
  const storedCourses = dependencies.courseRepository ?? createCourseRepository();
  const storedAssets = dependencies.courseAssetRepository ?? createCourseAssetRepository();
  const feedback = dependencies.feedbackRepository ?? createFeedbackRepository();
  const storedContent = dependencies.courseContentRepository ?? createCourseContentRepository();
  const { courses, courseAssets, courseContent, review } = reviewedRepositories(storedCourses, storedContent, storedAssets);
  const gitHubFeedback = dependencies.gitHubFeedbackService ?? new ConfiguredGitHubFeedbackService();
  const muxVideo = dependencies.muxVideoService ?? createMuxVideoService();
  const muxWebhook = dependencies.muxWebhookService ?? createMuxWebhookService();

  const withCourseLock = (handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) =>
    async (request: Request, response: Response, next: NextFunction) => {
      const author = request.query.view === 'author' || request.path.endsWith('/review') ||
        (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && /^\/(?:api\/)?courses\//.test(request.path) &&
          !/\/(price|catalog-metadata|quiz-attempts)$/.test(request.path));
      return reviewScope.run({ author, user: (request as Partial<AuthenticatedRequest>).user }, async () => {
      try {
        if (courses.storageType === 'google-sheets' && courseContent.storageType !== 'mongodb') {
          response.status(503).json({ message: 'Shared course operations require MongoDB content and coordination storage.' });
          return;
        }
        const courseId = String(request.params.id);
        // Missing IDs must not create durable lock records; the handler supplies its 404.
        if (!(await storedCourses.listCourses()).some((course) => course.id === courseId)) {
          await handler(request, response, next);
          return;
        }
        await courseContent.withCourseMutationLock(courseId, async () => {
          if (author && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && !request.path.endsWith('/review')) {
            if (request.header('X-Course-Revision')) await review.assertRevision(courseId, request.header('X-Course-Revision'));
            await review.assertEditable(courseId);
          }
          let failure: unknown;
          await handler(request, response, (error?: unknown) => {
            if (error) failure = error;
          });
          if (failure) throw failure;
        });
      } catch (error) {
        if (response.headersSent) { console.error('Unable to finish course operation coordination.', error); return; }
        next(error);
      }
      });
    };

  app.use(cors({ origin: getCorsOrigins() }));
  app.post(
    ['/webhooks/mux', '/api/webhooks/mux'],
    withRequestBodyErrors(express.raw({ type: 'application/json' })),
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
        await handleMuxWebhookEvent(event, storedContent, review);

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
  app.put(
    ['/courses/:id/thumbnail', '/api/courses/:id/thumbnail'],
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withRequestBodyErrors(express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' })),
    withCourseLock(async (request, response, next) => {
      try {
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        if (hasUnsafeThumbnailStorage(courses, courseAssets)) {
          response.status(503).json({
            message:
              'Thumbnail uploads require shared asset storage when courses are stored in Google Sheets. Configure MongoDB course asset storage before uploading thumbnails.',
          });
          return;
        }

        const contentType = normalizeThumbnailContentType(request.header('content-type'));

        if (!contentType) {
          response.status(415).json({ message: 'Only JPEG, PNG, and WebP thumbnails are supported.' });
          return;
        }

        if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
          response.status(400).json({ message: 'Thumbnail image data is required.' });
          return;
        }

        const uploadedAsset = await courseAssets.saveThumbnail({
          courseId,
          contentType,
          fileName: sanitizeFileName(request.header('x-file-name'), contentType),
          binary: request.body,
        });

        let updatedCourse;
        try {
          updatedCourse = await courses.updateCourseThumbnail(courseId, {
            thumbnailAssetId: uploadedAsset._id,
          });
        } catch (error) {
          if (error instanceof AmbiguousCourseWriteError) throw error;
          await courseAssets.deleteAsset(uploadedAsset._id, courseId);
          throw error;
        }

        if (!updatedCourse) {
          await courseAssets.deleteAsset(uploadedAsset._id, courseId);
          response.status(404).json({ message: 'Course not found' });
          return;
        }
        // Metadata already references the new asset; old-asset cleanup cannot roll it back.
        if (matchingCourse.thumbnailAssetId && matchingCourse.thumbnailAssetId !== uploadedAsset._id) {
          await courseAssets.deleteAsset(matchingCourse.thumbnailAssetId, courseId);
        }
        response.json({ ...updatedCourse, review: await review.state(courseId) });
      } catch (error) {
        next(error);
      }
    }),
  );
  app.put(
    [
      '/courses/:id/content/components/:componentId/attachments',
      '/api/courses/:id/content/components/:componentId/attachments',
    ],
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withRequestBodyErrors(express.raw({ type: () => true, limit: '25mb' })),
    withCourseLock(async (request, response, next) => {
      try {
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const componentId = Array.isArray(request.params.componentId)
          ? request.params.componentId[0]
          : request.params.componentId;
        const sectionId = request.header('x-section-id')?.trim() ?? '';
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        if (hasUnsafeAttachmentStorage(courseContent, courseAssets)) {
          response.status(503).json({
            message:
              'Attachment uploads require shared asset storage when course content is stored in MongoDB. Configure MongoDB course asset storage before uploading attachments.',
          });
          return;
        }

        if (!sectionId) {
          response.status(400).json({ message: 'Section id is required.' });
          return;
        }

        if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
          response.status(400).json({ message: 'Attachment data is required.' });
          return;
        }

        const content = await courseContent.getCourseContent(courseId);

        if (!content) {
          response.status(404).json({ message: 'Course content not found' });
          return;
        }

        const component = findCourseComponent(content.sections, sectionId, componentId);

        if (!component || (component.type !== 'text' && component.type !== 'resources')) {
          response.status(404).json({ message: 'Attachment uploads are only available for text and resources components.' });
          return;
        }

        const contentType = normalizeAttachmentContentType(request.header('content-type'));
        const allowed = component.type === 'text'
          ? isAllowedTextAttachmentContentType(contentType)
          : isAllowedResourcesAttachmentContentType(contentType);

        if (!allowed) {
          response.status(415).json({
            message:
              component.type === 'text'
                ? 'Text documentation supports documents, PDFs, images, and PowerPoint files.'
                : 'Resources supports ZIP files, PowerPoint files, and images.',
          });
          return;
        }

        const uploadedAsset = await courseAssets.saveComponentAttachment({
          courseId,
          componentId,
          contentType,
          fileName: sanitizeFileName(request.header('x-file-name'), contentType),
          binary: request.body,
        });
        const attachment = {
          id: randomUUID(),
          assetId: uploadedAsset._id,
          fileName: uploadedAsset.fileName,
          contentType: uploadedAsset.contentType,
          sizeBytes: uploadedAsset.sizeBytes,
          createdAt: uploadedAsset.createdAt,
        };
        const markerId = request.header('x-attachment-marker')?.trim() ?? '';

        try {
          const updatedSections = content.sections.map((section) =>
            section.id === sectionId
              ? {
                  ...section,
                  components: section.components.map((item) =>
                    item.id === componentId
                      ? {
                          ...item,
                          content:
                            markerId && item.type === 'text'
                              ? replacePendingAttachmentMarker(item.content, markerId, attachment)
                              : item.content,
                          attachments: [...(item.attachments ?? []), attachment],
                        }
                      : item,
                  ),
                }
              : section,
          );
          const updatedContent = await courseContent.updateCourseContent(courseId, updatedSections);

          response.status(201).json({ attachment, content: { ...updatedContent, review: await review.state(courseId) } });
        } catch (error) {
          if (error instanceof AmbiguousCourseWriteError) throw error;
          await courseAssets.deleteAsset(uploadedAsset._id, courseId);
          throw error;
        }
      } catch (error) {
        next(error);
      }
    }),
  );
  app.use(withRequestBodyErrors(express.json()));
  app.use((_request, response, next) => {
    response.setHeader('X-QI-Education-Auth-Storage', hasGoogleSheetsConfig() ? 'google-sheets' : 'memory');
    response.setHeader('X-QI-Education-Content-Storage', courseContent.storageType);
    response.setHeader('X-QI-Education-Asset-Storage', courseAssets.storageType);
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
      assets: {
        storage: courseAssets.storageType,
        configured: hasMongoAssetConfig(),
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

  app.post('/users/me/courses/:id', authenticateRequest(auth), withCourseLock(async (request, response, next) => {
    try {
      const authenticatedRequest = request as AuthenticatedRequest;
      const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

      if (!matchingCourse) {
        response.status(404).json({ message: 'Course not found' });
        return;
      }

      if (matchingCourse.status !== 'published') {
        response.status(403).json({ message: 'Only published courses accept enrollment.' });
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
  }));

  app.use('/courses', (_request, response, next) => {
    response.setHeader('Cache-Control', 'private, no-store');
    response.vary('Authorization');
    next();
  });

  app.get('/courses', optionalAuthentication(auth), async (request, response, next) => {
    try {
      response.json((await courses.listCourses()).filter((course) => canSeeCourse(course, (request as Partial<AuthenticatedRequest>).user)));
    } catch (error) {
      next(error);
    }
  });

  app.get('/courses/:id/thumbnail', optionalAuthentication(auth), withCourseLock(async (request, response, next) => {
    try {
      const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      let matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

      const selectedId = typeof request.query.v === 'string' ? request.query.v : '';
      if (matchingCourse && selectedId && selectedId !== matchingCourse.thumbnailAssetId) {
        if (canAuthorCourse(matchingCourse, (request as Partial<AuthenticatedRequest>).user)) {
          const state = await review.state(courseId);
          if (state.course.thumbnailAssetId === selectedId) matchingCourse = state.course;
          else matchingCourse = undefined;
        } else matchingCourse = undefined;
      }
      if (!matchingCourse || !matchingCourse.thumbnailAssetId || !canSeeCourse(matchingCourse, (request as Partial<AuthenticatedRequest>).user)) {
        response.status(404).json({ message: 'Course thumbnail not found' });
        return;
      }

      const asset = await courseAssets.getThumbnail(matchingCourse.thumbnailAssetId);

      if (!asset || asset.courseId !== courseId) {
        response.status(404).json({ message: 'Course thumbnail not found' });
        return;
      }

      response.setHeader('Content-Type', asset.contentType);
      response.setHeader('Content-Length', String(asset.sizeBytes));
      response.end(asset.binary);
    } catch (error) {
      next(error);
    }
  }));

  app.post(
    '/courses',
    authenticateRequest(auth),
    requireCourseCreator,
    async (request, response, next) => {
      try {
        const input = createCourseSchema.parse(request.body);

        if (input.status !== 'draft') { response.status(403).json({ message: 'Create a draft, then submit it for admin review.' }); return; }
        if ((request as AuthenticatedRequest).user.role !== 'admin' && (
          input.status !== 'draft' || input.priceDkk !== null || input.isPremium || input.isBestseller ||
          input.rating !== 0 || input.ratingCount !== 0 || input.category !== 'Uncategorized' || input.languages.length > 0
        )) {
          response.status(403).json({ message: 'Teachers create drafts; publication, pricing, and catalog settings require an admin.' });
          return;
        }

        // A new course has no uploaded assets yet. Upload after creation rather
        // than accepting a reference to another course's thumbnail.
        if (input.thumbnailAssetId) {
          response.status(403).json({ message: 'Upload a thumbnail after creating the course.' });
          return;
        }

        if (hasUnsafeCourseCreationStorage(courses, courseContent)) {
          response.status(503).json({
            message:
              'Course creation requires shared content storage when courses are stored in Google Sheets. Configure MongoDB course content storage before creating courses.',
          });
          return;
        }

        const seed = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          ownerUserId: (request as AuthenticatedRequest).user.id,
        };

        await courseContent.createEmptyCourseContent(seed.id, seed.createdAt);

        try {
          const created = await courses.createCourse(input, seed);
          response.status(201).json({ ...created, review: await review.state(seed.id) });
        } catch (error) {
          await courseContent.deleteCourseContent(seed.id);
          throw error;
        }
      } catch (error) {
        next(error);
      }
    },
  );

  app.get('/courses/:id/outline', optionalAuthentication(auth), withCourseLock(async (request, response, next) => {
    try {
      const courseId = String(request.params.id);
      const course = (await courses.listCourses()).find((item) => item.id === courseId);
      if (!course || !canSeeCourse(course, (request as Partial<AuthenticatedRequest>).user)) {
        response.status(404).json({ message: 'Course not found' });
        return;
      }
      const content = await courseContent.getCourseContent(courseId);
      response.json(courseOutline(content ?? { _id: courseId, sections: [], createdAt: course.createdAt, updatedAt: course.createdAt }));
    } catch (error) { next(error); }
  }));

  app.get('/courses/:id/content', authenticateRequest(auth), withCourseLock(async (request, response, next) => {
    const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;

    try {
      const course = (await courses.listCourses()).find((item) => item.id === courseId);
      const user = (request as AuthenticatedRequest).user;
      if (!course) {
        response.status(404).json({ message: 'Course not found' });
        return;
      }
      const authorView = request.query.view === 'author';
      if (!canLearnCourse(course, user) || (authorView && !canAuthorCourse(course, user))) {
        response.status(403).json({ message: 'You do not have access to this course content.' });
        return;
      }
      const content = await courseContent.getCourseContent(courseId);

      if (!content && authorView) {
        response.json({ _id: courseId, sections: [], createdAt: course.createdAt, updatedAt: course.createdAt,
          view: 'author', review: await review.state(courseId) }); return;
      }
      if (!content) {
        response.status(404).json({ message: 'Course content not found' });
        return;
      }

      response.json(authorView ? { ...content, view: 'author', review: await review.state(courseId) } : learnerCourseContent(content));
    } catch (error) {
      console.error(`Unable to load stored content for course ${courseId}.`, error);
      response.status(503).json({ message: 'Course content storage is unavailable.' });
    }
  }));

  app.get(
    '/courses/:id/content/attachments/:assetId',
    authenticateRequest(auth),
    withCourseLock(async (request, response, next) => {
      try {
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const assetId = Array.isArray(request.params.assetId)
          ? request.params.assetId[0]
          : request.params.assetId;
        const user = (request as AuthenticatedRequest).user;
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        if (!canLearnCourse(matchingCourse, user)) {
          response.status(403).json({ message: 'Enroll in this course before opening resources.' });
          return;
        }

        const content = await reviewScope.run({ author: canAuthorCourse(matchingCourse, user), user }, () => courseContent.getCourseContent(courseId));

        const liveContent = canAuthorCourse(matchingCourse, user) && (!content || !courseContentHasAttachment(content.sections, assetId))
          ? await reviewScope.run({ author: false }, () => courseContent.getCourseContent(courseId)) : null;
        if ((!content || !courseContentHasAttachment(content.sections, assetId)) && (!liveContent || !courseContentHasAttachment(liveContent.sections, assetId))) {
          response.status(404).json({ message: 'Attachment not found' });
          return;
        }

        const asset = await courseAssets.getComponentAttachment(assetId);

        if (!asset || asset.courseId !== courseId) {
          response.status(404).json({ message: 'Attachment not found' });
          return;
        }

        response.setHeader('Content-Type', asset.contentType);
        response.setHeader('Content-Length', String(asset.sizeBytes));
        response.setHeader('Content-Disposition', `attachment; filename="${asset.fileName}"`);
        response.end(asset.binary);
      } catch (error) {
        next(error);
      }
    }),
  );

  app.patch(
    '/courses/:id/content',
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withCourseLock(async (request, response, next) => {
      try {
        const input = updateCourseContentSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const matchingCourse = (await courses.listCourses()).find((course) => course.id === courseId);

        if (!matchingCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        const issues = assessmentIssues(input.sections, ['ready-for-review', 'published', 'archived'].includes(matchingCourse.status));
        if (issues.length) {
          response.status(400).json({ message: issues.map((issue) => issue.message).join(' '), issues });
          return;
        }

        const attachmentIds = new Set(input.sections.flatMap((section) =>
          section.components.flatMap((component) => component.attachments.map((attachment) => attachment.assetId)),
        ));
        const referencedAssets = await Promise.all([...attachmentIds].map((assetId) => courseAssets.getComponentAttachment(assetId)));
        if (referencedAssets.some((asset) => asset && asset.courseId !== courseId)) {
          response.status(403).json({ message: 'Attachments must belong to this course.' });
          return;
        }

        await review.assertRevision(courseId, request.header('X-Course-Revision'));
        const saved = await courseContent.updateCourseContent(courseId, input.sections);
        response.json({ ...saved, review: await review.state(courseId) });
      } catch (error) {
        next(error);
      }
    }),
  );

  app.post('/courses/:id/content/components/:componentId/quiz-attempts', authenticateRequest(auth), withCourseLock(async (request, response, next) => {
    try {
      const courseId = String(request.params.id);
      const course = (await courses.listCourses()).find((item) => item.id === courseId);
      if (!course) { response.status(404).json({ message: 'Course not found' }); return; }
      if (!canLearnCourse(course, (request as AuthenticatedRequest).user)) {
        response.status(403).json({ message: 'You do not have access to this assessment.' }); return;
      }
      const input = quizAttemptSchema.parse(request.body);
      const stored = await courseContent.getCourseContent(courseId);
      const parsed = updateCourseContentSchema.safeParse(stored);
      if (!parsed.success) { response.status(409).json({ message: 'This assessment needs correction by its author.' }); return; }
      const section = parsed.data.sections.find((item) => item.id === input.sectionId);
      const component = section?.components.find((item) => item.id === request.params.componentId);
      if (!component || component.type !== 'quiz') { response.status(404).json({ message: 'Quiz not found' }); return; }
      if (assessmentIssues([{ ...section!, components: [component] }], true).length) {
        response.status(409).json({ message: 'This assessment needs correction by its author.' }); return;
      }
      const result = scoreQuiz(component, input.answers);
      if (!result) { response.status(400).json({ message: 'Select valid answer IDs once per question.' }); return; }
      response.json(result);
    } catch (error) { next(error); }
  }));

  app.post(
    '/courses/:id/content/components/:componentId/mux-upload',
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withCourseLock(async (request, response, next) => {
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

        const upload = await protectCourseWrite(() => muxVideo!.createDirectUpload({
          courseId,
          sectionId: input.sectionId,
          componentId,
          corsOrigin: request.header('origin') ?? getCorsOrigins()[0] ?? 'http://localhost:4200',
        }));
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
          content: { ...updatedContent, review: await review.state(courseId) },
        });
      } catch (error) {
        next(error);
      }
    }),
  );

  app.delete(
    '/courses/:id/content/components/:componentId/mux-video',
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withCourseLock(async (request, response, next) => {
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

        response.json({ content: { ...updatedContent, review: await review.state(courseId) } });
      } catch (error) {
        next(error);
      }
    }),
  );

  app.post('/courses/:id/review', authenticateRequest(auth), requireCourseAuthor(storedCourses),
    withCourseLock(async (request, response, next) => {
      try {
        const courseId = String(request.params.id);
        await review.act(courseId, reviewActionSchema.parse(request.body), (request as AuthenticatedRequest).user);
        const content = await courseContent.getCourseContent(courseId);
        response.json({ ...content, view: 'author', review: await review.state(courseId) });
      } catch (error) { next(error); }
    }),
  );

  app.patch(
    '/courses/:id',
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withCourseLock(async (request, response, next) => {
      try {
        const input = updateCourseSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const current = (await courses.listCourses()).find((course) => course.id === courseId);
        if (!current) { response.status(404).json({ message: 'Course not found' }); return; }
        if (!Object.hasOwn(request.body, 'status')) input.status = current.status;
        if (!Object.hasOwn(request.body, 'priceDkk')) input.priceDkk = current.priceDkk;
        if ((request as AuthenticatedRequest).user.role !== 'admin' && (
          (['isPremium', 'isBestseller', 'rating', 'ratingCount', 'category', 'languages'] as const).some((key) =>
            Object.hasOwn(request.body, key) && JSON.stringify(request.body[key]) !== JSON.stringify(current[key])) ||
          input.priceDkk !== current.priceDkk || (input.status !== current.status && (
            !['draft', 'ready-for-review'].includes(current.status) || !['draft', 'ready-for-review'].includes(input.status)
          ))
        )) {
          response.status(403).json({ message: 'Publication, archival, and pricing require an admin.' });
          return;
        }
        if (['ready-for-review', 'published'].includes(input.status)) {
          const stored = await courseContent.getCourseContent(courseId);
          const parsed = updateCourseContentSchema.safeParse(stored);
          if (!parsed.success) {
            response.status(400).json({ message: 'Course assessment content needs correction before review or publication.' });
            return;
          }
          const issues = assessmentIssues(parsed.data.sections, true);
          if (issues.length) {
            response.status(400).json({ message: issues.map((issue) => issue.message).join(' '), issues });
            return;
          }
        }
        if (input.status !== current.status) throw new CourseReviewError(409, 'Use the explicit submission and review actions to change status.');
        await review.assertRevision(courseId, request.header('X-Course-Revision'));
        const updatedCourse = await courses.updateCourse(courseId, input);

        if (!updatedCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        response.json({ ...updatedCourse, review: await review.state(courseId) });
      } catch (error) {
        next(error);
      }
    }),
  );

  app.patch(
    '/courses/:id/price',
    authenticateRequest(auth),
    requireAdmin,
    withCourseLock(async (request, response, next) => {
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
    }),
  );

  app.delete(
    '/courses/:id/content/components/:componentId/attachments/:assetId',
    authenticateRequest(auth),
    requireCourseAuthor(storedCourses),
    withCourseLock(async (request, response, next) => {
      try {
        const input = createMuxUploadSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const componentId = Array.isArray(request.params.componentId)
          ? request.params.componentId[0]
          : request.params.componentId;
        const assetId = Array.isArray(request.params.assetId)
          ? request.params.assetId[0]
          : request.params.assetId;
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

        const component = findCourseComponent(content.sections, input.sectionId, componentId);

        if (!component) {
          response.status(404).json({ message: 'Component not found' });
          return;
        }

        if (!(component.attachments ?? []).some((attachment) => attachment.assetId === assetId)) {
          response.status(404).json({ message: 'Attachment not found' });
          return;
        }

        const storedAsset = await courseAssets.getComponentAttachment(assetId);
        if (storedAsset && storedAsset.courseId !== courseId) {
          response.status(403).json({ message: 'Attachments must belong to this course.' });
          return;
        }

        const updatedSections = content.sections.map((section) =>
          section.id === input.sectionId
            ? {
                ...section,
                components: section.components.map((item) =>
                  item.id === componentId
                    ? {
                        ...item,
                        attachments: (item.attachments ?? []).filter(
                          (attachment) => attachment.assetId !== assetId,
                        ),
                      }
                    : item,
                ),
              }
            : section,
        );
        const updatedContent = await courseContent.updateCourseContent(courseId, updatedSections);

        await courseAssets.deleteAsset(assetId, courseId);
        response.json({ content: { ...updatedContent, review: await review.state(courseId) } });
      } catch (error) {
        next(error);
      }
    }),
  );

  app.patch(
    '/courses/:id/catalog-metadata',
    authenticateRequest(auth),
    requireAdmin,
    withCourseLock(async (request, response, next) => {
      try {
        const input = updateCourseCatalogMetadataSchema.parse(request.body);
        const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
        const updatedCourse = await courses.updateCourseCatalogMetadata(courseId, input);

        if (!updatedCourse) {
          response.status(404).json({ message: 'Course not found' });
          return;
        }

        response.json(updatedCourse);
      } catch (error) {
        next(error);
      }
    }),
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
    if (error instanceof CourseReviewError) { response.status(error.status).json({ message: error.message, ...(error.code ? { code: error.code } : {}), ...(error.issues ? { issues: error.issues } : {}) }); return; }
    if (error instanceof CourseBusyError) {
      response.status(409).json({ message: error.message });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({ message: 'Invalid request body', issues: error.issues });
      return;
    }

    console.error(error);
    response.status(500).json({ message: 'Unexpected server error' });
  });

  return app;
}

// Only classify errors produced at the parser boundary. Application exceptions
// with similar status/type fields must still reach the safe generic 500 handler.
function withRequestBodyErrors(parser: RequestHandler): RequestHandler {
  return (request, response, next) => {
    parser(request, response, (error?: unknown) => {
      if (error && typeof error === 'object' && 'status' in error) {
        if (error.status === 400) {
          response.status(400).json({ message: 'type' in error && error.type === 'entity.parse.failed'
            ? 'Invalid JSON request body.' : 'Invalid request body.' });
          return;
        }
        if (error.status === 413) {
          response.status(413).json({ message: 'Request body exceeds the size limit.' });
          return;
        }
        if (error.status === 415) {
          response.status(415).json({ message: 'Unsupported request body encoding.' });
          return;
        }
      }
      next(error);
    });
  };
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

function hasUnsafeCourseCreationStorage(
  courses: CourseRepository,
  courseContent: CourseContentRepository,
) {
  return courses.storageType === 'google-sheets' && courseContent.storageType === 'memory';
}

function hasUnsafeThumbnailStorage(
  courses: CourseRepository,
  courseAssets: CourseAssetRepository,
) {
  return courses.storageType === 'google-sheets' && courseAssets.storageType === 'memory';
}

function hasUnsafeAttachmentStorage(
  courseContent: CourseContentRepository,
  courseAssets: CourseAssetRepository,
) {
  return courseContent.storageType === 'mongodb' && courseAssets.storageType === 'memory';
}

async function handleMuxWebhookEvent(
  event: MuxWebhookEvent,
  courseContent: CourseContentRepository,
  review: CourseReviewService,
) {
  switch (event.type) {
    case 'video.upload.asset_created': {
      const data = event.data as Extract<MuxWebhookEvent, { type: 'video.upload.asset_created' }>['data'];
      const passthrough = parseMuxPassthrough(data.new_asset_settings?.passthrough);

      if (!passthrough || !data.asset_id) {
        return;
      }

      await updateMuxVideoComponent(courseContent, review, passthrough, {
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

      await updateMuxVideoComponent(courseContent, review, passthrough, {
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

      await updateMuxVideoComponent(courseContent, review, passthrough, {
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
  review: CourseReviewService,
  passthrough: MuxPassthrough,
  update: MuxVideoUpdate,
) {
  await courseContent.withCourseMutationLock(passthrough.courseId, async () => {
  const content = await courseContent.getCourseContent(passthrough.courseId);

  if (!content) {
    return;
  }

  let changed = false;
  const updateSections = (sections: CourseContentSection[]) => sections.map((section) =>
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
            if (!update.uploadId && update.assetId && component.mux.assetId !== update.assetId) return component;
            // At-least-once provider events may arrive out of order.
            if (update.status === 'processing' && ['ready', 'errored'].includes(component.mux.status)) return component;
            const updated = {
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
            if (JSON.stringify(updated.mux) === JSON.stringify(component.mux)) return component;
            changed = true;
            return updated;
          }),
        }
      : section,
  );

  if (content.review) {
    const workflow = structuredClone(content.review);
    if (workflow.live) workflow.live.sections = updateSections(workflow.live.sections);
    if (workflow.working) workflow.working.sections = updateSections(workflow.working.sections);
    if (changed) { workflow.version++; await courseContent.saveCourseReview(passthrough.courseId, workflow); }
  } else {
    const sections = updateSections(content.sections);
    if (changed) {
      const { workflow } = await review.load(passthrough.courseId);
      if (workflow.live) workflow.live.sections = sections;
      if (workflow.working) workflow.working.sections = sections;
      workflow.version++;
      await courseContent.saveCourseReview(passthrough.courseId, workflow);
    }
  }
  });
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

function findCourseComponent(
  sections: CourseContentSection[],
  sectionId: string,
  componentId: string,
) {
  const section = sections.find((item) => item.id === sectionId);

  return section?.components.find((item) => item.id === componentId) ?? null;
}

function courseContentHasAttachment(sections: CourseContentSection[], assetId: string): boolean {
  return sections.some((section) =>
    section.components.some((component) =>
      (component.attachments ?? []).some((attachment) => attachment.assetId === assetId),
    ),
  );
}

function normalizeThumbnailContentType(
  value: string | undefined,
): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  const normalized = value?.split(';')[0]?.trim().toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }

  return null;
}

function normalizeAttachmentContentType(value: string | undefined): string {
  return value?.split(';')[0]?.trim().toLowerCase() ?? '';
}

function isAllowedTextAttachmentContentType(value: string): boolean {
  return (
    isAllowedImageContentType(value) ||
    value === 'application/pdf' ||
    value === 'text/plain' ||
    value === 'application/msword' ||
    value === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    isAllowedPowerPointContentType(value)
  );
}

function isAllowedResourcesAttachmentContentType(value: string): boolean {
  return (
    isAllowedImageContentType(value) ||
    isAllowedPowerPointContentType(value) ||
    value === 'application/zip' ||
    value === 'application/x-zip-compressed'
  );
}

function isAllowedImageContentType(value: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(value);
}

function isAllowedPowerPointContentType(value: string): boolean {
  return (
    value === 'application/vnd.ms-powerpoint' ||
    value === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
}

function sanitizeFileName(value: string | undefined, contentType: string): string {
  const fallbackExtension =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/webp'
        ? 'webp'
        : contentType === 'image/jpeg'
          ? 'jpg'
          : contentType === 'image/gif'
            ? 'gif'
            : contentType === 'application/pdf'
              ? 'pdf'
              : contentType === 'application/zip' || contentType === 'application/x-zip-compressed'
                ? 'zip'
                : contentType === 'application/vnd.ms-powerpoint'
                  ? 'ppt'
                  : contentType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    ? 'pptx'
                    : contentType === 'application/msword'
                      ? 'doc'
                      : contentType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                        ? 'docx'
                        : 'txt';
  const fallbackName = `course-attachment.${fallbackExtension}`;

  if (!value?.trim()) {
    return fallbackName;
  }

  return value.replace(/[^a-zA-Z0-9._ -]/g, '-').trim().slice(0, 160) || fallbackName;
}

function replacePendingAttachmentMarker(
  content: string,
  markerId: string,
  attachment: {
    assetId: string;
    fileName: string;
    sizeBytes: number;
  },
): string {
  const escapedMarker = escapeRegExp(markerId);
  const pendingCardPattern = new RegExp(
    `<div[^>]*class="[^"]*rich-attachment-card[^"]*"[^>]*data-attachment-id="${escapedMarker}"[\\s\\S]*?<\\/div>`,
    'g',
  );

  return content.replace(pendingCardPattern, buildAttachmentCardMarkup(attachment));
}

function buildAttachmentCardMarkup(attachment: {
  assetId: string;
  fileName: string;
  sizeBytes: number;
}): string {
  const escapedAssetId = escapeHtml(attachment.assetId);
  const escapedFileName = escapeHtml(attachment.fileName);

  return `<div class="rich-attachment-card rich-attachment-asset-${escapedAssetId}" id="rich-attachment-${escapedAssetId}" contenteditable="false" data-attachment-id="${escapedAssetId}" data-attachment-pending="false"><span class="rich-attachment-copy" contenteditable="false"><strong>${escapedFileName}</strong><small>${formatAttachmentSize(attachment.sizeBytes)}</small></span><span class="rich-attachment-actions" contenteditable="false"><span class="rich-attachment-action rich-attachment-download" role="button" aria-disabled="false" data-attachment-download="${escapedAssetId}" aria-label="Download ${escapedFileName}">${lucideDownloadSvg()}</span><span class="rich-attachment-action rich-attachment-remove rich-attachment-action-danger" role="button" data-attachment-remove="${escapedAssetId}" aria-label="Remove ${escapedFileName}">${lucideTrash2Svg()}</span></span></div>`;
}

function lucideDownloadSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';
}

function lucideTrash2Svg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
}

function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function optionalAuthentication(authRepository: AuthRepository) {
  const authenticate = authenticateRequest(authRepository);
  return (request: Request, response: Response, next: NextFunction) => {
    if (request.header('authorization') === undefined) { next(); return; }
    return authenticate(request, response, next);
  };
}

function requireCourseAuthor(courses: CourseRepository) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { user } = request as AuthenticatedRequest;
      if (!roleCanCreateCourses(user.role)) {
        response.status(403).json({ message: 'Teacher or admin access is required' });
        return;
      }

      const courseId = Array.isArray(request.params.id) ? request.params.id[0] : request.params.id;
      const course = (await courses.listCourses()).find((item) => item.id === courseId);
      if (!course) {
        response.status(404).json({ message: 'Course not found' });
        return;
      }
      if (!canAuthorCourse(course, user)) {
        response.status(403).json({ message: 'You do not have permission to edit this course.' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAdmin(request: Request, response: Response, next: NextFunction) {
  const { user } = request as AuthenticatedRequest;

  if (user.role !== 'admin') {
    response.status(403).json({ message: 'Admin access is required' });
    return;
  }

  next();
}
