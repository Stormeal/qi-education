import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  InMemoryCourseContentRepository,
  type CourseContentRepository,
} from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryCourseRepository, type CourseRepository } from './courseRepository.js';
import type { FeedbackEntry } from './feedback.js';
import {
  GitHubFeedbackError,
  type GitHubFeedbackIssue,
  type GitHubFeedbackService,
} from './githubFeedback.js';
import type { MuxVideoService, MuxWebhookEvent, MuxWebhookService } from './muxService.js';
import { createServer } from './server.js';
import { InMemoryAuthRepository } from './authRepository.js';

describe('QI-Education API', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    server = createServer().listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('reports health with the active storage mode', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'ok', storage: 'memory' });
  });

  it('authenticates a teacher and returns role permissions', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'teacher@qi-education.local',
        password: 'Password123!',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      email: 'teacher@qi-education.local',
      role: 'teacher',
    });
    expect(body.permissions).toEqual({
      canCreateCourses: true,
      hasAdminAccess: false,
    });
    expect(body.token).toEqual(expect.any(String));
  });

  it('authenticates through the Vercel-safe login route', async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'teacher@qi-education.local',
        password: 'Password123!',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      email: 'teacher@qi-education.local',
      role: 'teacher',
    });
    expect(body.token).toEqual(expect.any(String));
  });

  it('creates a student account through sign up and returns a working session', async () => {
    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Maja Lindholm',
        email: 'maja.lindholm@example.com',
        password: 'Testing42',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({
      email: 'maja.lindholm@example.com',
      displayName: 'Maja Lindholm',
      role: 'student',
      status: 'active',
      enrolledCourseIds: [],
    });
    expect(body.permissions).toEqual({
      canCreateCourses: false,
      hasAdminAccess: false,
    });
    expect(body.token).toEqual(expect.any(String));

    const meResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        authorization: `Bearer ${body.token}`,
      },
    });
    const me = await meResponse.json();

    expect(meResponse.status).toBe(200);
    expect(me.user.email).toBe('maja.lindholm@example.com');
  });

  it('creates a student account through the Vercel-safe sign up route', async () => {
    const response = await fetch(`${baseUrl}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Noah Falk',
        email: 'noah.falk@example.com',
        password: 'Coursework8',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user).toMatchObject({
      email: 'noah.falk@example.com',
      role: 'student',
    });
    expect(body.token).toEqual(expect.any(String));
  });

  it('rejects duplicate sign up emails', async () => {
    const payload = {
      displayName: 'Sofie Nygaard',
      email: 'sofie.nygaard@example.com',
      password: 'Learning7',
    };

    await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toBe('An account with this email already exists');
  });

  it('rejects sign up passwords that do not meet the password rules', async () => {
    const response = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Emil Vester',
        email: 'emil.vester@example.com',
        password: 'lowercase',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
  });

  it('serves API routes under the Vercel /api prefix', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('reports auth readiness under the Vercel /api prefix', async () => {
    const response = await fetch(`${baseUrl}/api/health/auth`);
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('reports non-secret runtime configuration for diagnostics', async () => {
    const response = await fetch(`${baseUrl}/api/health/config`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-qi-education-auth-storage')).toBe('memory');
    expect(response.headers.get('x-qi-education-asset-storage')).toBe('memory');
    expect(body).toEqual({
      status: 'ok',
      auth: {
        configured: true,
        storage: 'memory',
      },
      content: {
        storage: 'memory',
        configured: false,
      },
      assets: {
        storage: 'memory',
        configured: false,
      },
      mux: {
        configured: false,
        playbackPolicy: 'public',
      },
      corsOrigins: [
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'https://stormeal.github.io',
        'https://qi-education.vercel.app',
      ],
      ranges: {
        courses: 'Courses!A:R',
        users: 'Users!A:H',
        feedback: 'Feedback!A:M',
      },
    });
  });

  it('reports content storage health under the Vercel /api prefix', async () => {
    const response = await fetch(`${baseUrl}/api/health/content`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: 'ok',
      storage: 'memory',
      configured: false,
      database: null,
      collection: null,
    });
  });

  it('rejects invalid login credentials', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'teacher@qi-education.local',
        password: 'wrong-password',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Invalid email or password');
  });

  it('returns the current user for a valid bearer token', async () => {
    const token = await loginAs('admin@qi-education.local');
    const response = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toMatchObject({
      email: 'admin@qi-education.local',
      role: 'admin',
    });
    expect(body.permissions).toEqual({
      canCreateCourses: true,
      hasAdminAccess: true,
    });
  });

  it('lists courses from the configured repository', async () => {
    const response = await fetch(`${baseUrl}/courses`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0]).toMatchObject({
      title: 'Career Discovery Workshop',
      status: 'published',
    });
  });

  it('blocks a student from creating a course', async () => {
    const token = await loginAs('student@qi-education.local');
    const response = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe('Teacher or admin access is required');
  });

  it('allows a teacher to create a course', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const response = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      title: 'API Automation Foundations',
      requirements: ['Basic testing experience', 'Comfort reading API documentation'],
      whatYoullLearn: ['Write maintainable API tests', 'Understand modern API QA workflows'],
      audience: 'QA professionals moving into API automation.',
      partOfCareer: 'Automation Engineering',
      status: 'draft',
      priceDkk: null,
    });

    const contentResponse = await fetch(`${baseUrl}/courses/${body.id}/content?view=author`, { headers: { authorization: `Bearer ${token}` } });
    const content = await contentResponse.json();

    expect(contentResponse.status).toBe(200);
    expect(content).toMatchObject({
      _id: body.id,
      sections: [],
      createdAt: body.createdAt,
      updatedAt: body.createdAt,
    });
  });

  it('rejects course creation when shared course rows would point at local-only content', async () => {
    const courseRepository = new SharedCourseRepository();
    const isolatedServer = createServer({
      courseRepository,
      courseContentRepository: new InMemoryCourseContentRepository(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = await loginAs('teacher@qi-education.local', isolatedBaseUrl);
      const response = await fetch(`${isolatedBaseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validCourse()),
      });
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.message).toBe(
        'Course creation requires shared content storage when courses are stored in Google Sheets. Configure MongoDB course content storage before creating courses.',
      );
      expect(await courseRepository.listCourses()).toHaveLength(1);
    } finally {
      isolatedServer.close();
    }
  });

  it('enrolls the current user in an existing course', async () => {
    const token = await loginAs('student@qi-education.local');
    const courseResponse = await fetch(`${baseUrl}/courses`);
    const [course] = await courseResponse.json();

    const response = await fetch(`${baseUrl}/users/me/courses/${course.id}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.enrolledCourseIds).toContain(course.id);

    const meResponse = await fetch(`${baseUrl}/auth/me`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const me = await meResponse.json();

    expect(me.user.enrolledCourseIds).toContain(course.id);
  });

  it('returns 404 when enrolling in a missing course', async () => {
    const token = await loginAs('student@qi-education.local');
    const response = await fetch(`${baseUrl}/users/me/courses/missing-course`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe('Course not found');
  });

  it('returns 404 when course content does not exist', async () => {
    const response = await fetch(`${baseUrl}/courses/missing-course/content`, { headers: { authorization: `Bearer ${await loginAs('admin@qi-education.local')}` } });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe('Course not found');
  });

  it('reports content storage health failures', async () => {
    const courseRepository = new InMemoryCourseRepository();
    const isolatedServer = createServer({
      courseRepository,
      courseContentRepository: new FailingCourseContentRepository(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${isolatedBaseUrl}/health/content`);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        status: 'unavailable',
        storage: 'mongodb',
        message: 'Course content storage is unavailable.',
        error: 'Error',
      });
    } finally {
      isolatedServer.close();
    }
  });

  it('returns 503 when the content repository is unavailable', async () => {
    const courseRepository = new InMemoryCourseRepository();
    const isolatedServer = createServer({
      courseRepository,
      courseContentRepository: new FailingCourseContentRepository(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const [course] = await courseRepository.listCourses();
      const response = await fetch(`${isolatedBaseUrl}/courses/${course.id}/content`, { headers: { authorization: `Bearer ${await loginAs('admin@qi-education.local', isolatedBaseUrl)}` } });
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.message).toBe('Course content storage is unavailable.');
    } finally {
      isolatedServer.close();
    }
  });

  it('allows a teacher to update a course', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();

    const updateResponse = await fetch(`${baseUrl}/courses/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...validCourse(),
        title: 'API Automation Foundations, Revised',
        status: 'draft',
      }),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      id: created.id,
      title: 'API Automation Foundations, Revised',
      partOfCareer: 'Automation Engineering',
      status: 'draft',
      priceDkk: null,
    });
  });

  it('preserves thumbnail and catalog metadata when updating course details', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();
    const uploadResponse = await fetch(`${baseUrl}/courses/${created.id}/thumbnail`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'X-File-Name': 'catalog-thumbnail.png',
        authorization: `Bearer ${teacherToken}`,
      },
      body: Buffer.from('fake-image-binary'),
    });
    const withThumbnail = await uploadResponse.json();
    const adminToken = await loginAs('admin@qi-education.local');

    await fetch(`${baseUrl}/courses/${created.id}/catalog-metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        isPremium: true,
        isBestseller: true,
        rating: 4.8,
        ratingCount: 312,
        category: 'API Testing',
        languages: ['English', 'Danish'],
      }),
    });

    const updateResponse = await fetch(`${baseUrl}/courses/${created.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        ...validCourse(),
        title: 'API Automation Foundations, Revised',
      }),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      id: created.id,
      title: 'API Automation Foundations, Revised',
      thumbnailAssetId: withThumbnail.thumbnailAssetId,
      isPremium: true,
      isBestseller: true,
      rating: 4.8,
      ratingCount: 312,
      category: 'API Testing',
      languages: ['English', 'Danish'],
    });
  });

  it('allows an admin to update course price in DKK', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();
    const adminToken = await loginAs('admin@qi-education.local');

    const updateResponse = await fetch(`${baseUrl}/courses/${created.id}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        priceDkk: 1499,
      }),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      id: created.id,
      priceDkk: 1499,
    });
  });

  it('allows an admin to update catalog metadata', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();
    const adminToken = await loginAs('admin@qi-education.local');

    const updateResponse = await fetch(`${baseUrl}/courses/${created.id}/catalog-metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        isPremium: true,
        isBestseller: true,
        rating: 4.8,
        ratingCount: 312,
        category: 'Performance Testing',
        languages: ['English'],
      }),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      id: created.id,
      isPremium: true,
      isBestseller: true,
      rating: 4.8,
      ratingCount: 312,
      category: 'Performance Testing',
      languages: ['English'],
    });
  });

  it('blocks non-admin users from updating catalog metadata', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/courses/${created.id}/catalog-metadata`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        isPremium: true,
        isBestseller: false,
        rating: 4.4,
        ratingCount: 12,
        category: 'Mobile Testing',
        languages: [],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe('Admin access is required');
  });

  it('blocks non-admin users from updating course price', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/courses/${created.id}/price`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        priceDkk: 999,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe('Admin access is required');
  });

  it('allows a teacher to upload a course thumbnail', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();

    const uploadResponse = await fetch(`${baseUrl}/courses/${created.id}/thumbnail`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'X-File-Name': 'catalog-thumbnail.png',
        authorization: `Bearer ${token}`,
      },
      body: Buffer.from('fake-image-binary'),
    });
    const updated = await uploadResponse.json();

    expect(uploadResponse.status).toBe(200);
    expect(updated.thumbnailAssetId).toEqual(expect.any(String));

    const thumbnailResponse = await fetch(`${baseUrl}/courses/${created.id}/thumbnail`, { headers: { authorization: `Bearer ${token}` } });
    const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());

    expect(thumbnailResponse.status).toBe(200);
    expect(thumbnailResponse.headers.get('content-type')).toBe('image/png');
    expect(thumbnailBuffer.equals(Buffer.from('fake-image-binary'))).toBe(true);
  });

  it('rejects thumbnail uploads when shared course rows would point at local-only assets', async () => {
    const courseRepository = new SharedCourseRepository();
    const authRepository = new InMemoryAuthRepository();
    const teacher = (await authRepository.findByEmail('teacher@qi-education.local'))!;
    const created = await courseRepository.createCourse(validCourse(), {
      id: 'shared-thumbnail-course', createdAt: new Date().toISOString(), ownerUserId: teacher.id,
    });
    const isolatedServer = createServer({
      authRepository,
      courseRepository,
      courseAssetRepository: new InMemoryCourseAssetRepository(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = await loginAs('teacher@qi-education.local', isolatedBaseUrl);
      const response = await fetch(`${isolatedBaseUrl}/courses/${created.id}/thumbnail`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/png',
          'X-File-Name': 'catalog-thumbnail.png',
          authorization: `Bearer ${token}`,
        },
        body: Buffer.from('fake-image-binary'),
      });
      const body = await response.json();
      const [storedCourse] = (await courseRepository.listCourses()).filter(
        (course) => course.id === created.id,
      );

      expect(response.status).toBe(503);
      expect(body.message).toBe(
        'Shared course operations require MongoDB content and coordination storage.',
      );
      expect(storedCourse.thumbnailAssetId ?? '').toBe('');
    } finally {
      isolatedServer.close();
    }
  });

  it('allows a teacher to update course content', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();
    const sections = [
      {
        id: 'section-1',
        title: 'Chapter 1',
        components: [
          {
            id: 'component-1',
            title: 'Quick knowledge check',
            type: 'quiz',
            durationMinutes: 5,
            content: 'What belongs in a strong API test suite?',
            resourceUrl: '',
            attachments: [],
            quiz: {
              passPoints: 2,
              questions: [
                {
                  id: 'question-1',
                  question: 'What belongs in a strong API test suite?',
                  points: 2,
                  answers: [
                    {
                      id: 'answer-1',
                      text: 'Assertions against expected status codes',
                      description: 'Correct because responses need to be validated.',
                      isCorrect: true,
                    },
                    {
                      id: 'answer-2',
                      text: 'Ignoring error responses entirely',
                      description: 'Wrong because failure paths still need coverage.',
                      isCorrect: false,
                    },
                    {
                      id: 'answer-3',
                      text: 'Checks for response body structure',
                      description: 'Correct because payload shape matters to consumers.',
                      isCorrect: true,
                    },
                    {
                      id: 'answer-4',
                      text: 'Random delays without purpose',
                      description: 'Wrong because timing should be tied to a real need.',
                      isCorrect: false,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ];

    const updateResponse = await fetch(`${baseUrl}/courses/${created.id}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sections }),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      _id: created.id,
      sections,
      createdAt: created.createdAt,
    });
    expect(updated.updatedAt).toEqual(expect.any(String));

    const getResponse = await fetch(`${baseUrl}/courses/${created.id}/content?view=author`, { headers: { authorization: `Bearer ${token}` } });
    const loaded = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(loaded.sections).toEqual(sections);
  });

  it('stores component attachments and only lets enrolled learners download them', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();
    const sections = [
      {
        id: 'section-1',
        title: 'Chapter 1',
        components: [
          {
            id: 'component-1',
            title: 'Reading',
            type: 'text',
            durationMinutes: 5,
            content: '# Overview',
            resourceUrl: '',
            attachments: [],
          },
        ],
      },
    ];

    await fetch(`${baseUrl}/courses/${created.id}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ sections }),
    });

    const uploadResponse = await fetch(
      `${baseUrl}/courses/${created.id}/content/components/component-1/attachments`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
          'X-File-Name': 'reading.pdf',
          'X-Section-Id': 'section-1',
          authorization: `Bearer ${teacherToken}`,
        },
        body: Buffer.from('pdf-binary'),
      },
    );
    const uploaded = await uploadResponse.json();

    expect(uploadResponse.status).toBe(201);
    expect(uploaded.attachment).toMatchObject({
      fileName: 'reading.pdf',
      contentType: 'application/pdf',
      sizeBytes: Buffer.byteLength('pdf-binary'),
    });
    expect(uploaded.content.sections[0].components[0].attachments).toHaveLength(1);

    const signupResponse = await fetch(`${baseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'Attachment Student',
        email: `attachment.${created.id}@example.com`,
        password: 'Testing42',
      }),
    });
    const signup = await signupResponse.json();
    const blockedResponse = await fetch(
      `${baseUrl}/courses/${created.id}/content/attachments/${uploaded.attachment.assetId}`,
      {
        headers: {
          authorization: `Bearer ${signup.token}`,
        },
      },
    );

    expect(blockedResponse.status).toBe(403);

    const adminToken = await loginAs('admin@qi-education.local');
    const reviewHeaders = { 'Content-Type': 'application/json', authorization: `Bearer ${adminToken}` };
    const currentReview = (await (await fetch(`${baseUrl}/courses/${created.id}/content?view=author`, { headers: reviewHeaders })).json()).review;
    const submission = await fetch(`${baseUrl}/courses/${created.id}/review`, { method: 'POST', headers: reviewHeaders,
      body: JSON.stringify({ action: 'submit', revisionId: currentReview.revisionId, expectedVersion: currentReview.version }) });
    expect(submission.status).toBe(200);
    const submitted = (await submission.json()).review;
    const publishResponse = await fetch(`${baseUrl}/courses/${created.id}/review`, { method: 'POST', headers: reviewHeaders,
      body: JSON.stringify({ action: 'publish', revisionId: submitted.revisionId, expectedVersion: submitted.version }) });
    expect(publishResponse.status).toBe(200);

    await fetch(`${baseUrl}/users/me/courses/${created.id}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${signup.token}`,
      },
    });

    const downloadResponse = await fetch(
      `${baseUrl}/courses/${created.id}/content/attachments/${uploaded.attachment.assetId}`,
      {
        headers: {
          authorization: `Bearer ${signup.token}`,
        },
      },
    );
    const downloaded = Buffer.from(await downloadResponse.arrayBuffer());

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get('content-type')).toBe('application/pdf');
    expect(downloaded.equals(Buffer.from('pdf-binary'))).toBe(true);
  });

  it('creates a Mux direct upload for a video component', async () => {
    const muxVideoService = new FakeMuxVideoService();
    const isolatedServer = createServer({ muxVideoService }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = await loginAs('teacher@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validCourse()),
      });
      const created = await createResponse.json();
      const sections = [
        {
          id: 'section-1',
          title: 'Chapter 1',
          components: [
            {
              id: 'component-1',
              title: 'Intro video',
              type: 'video',
              durationMinutes: 5,
              content: 'Welcome notes',
              resourceUrl: '',
            },
          ],
        },
      ];

      await fetch(`${isolatedBaseUrl}/courses/${created.id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sections }),
      });

      const uploadResponse = await fetch(
        `${isolatedBaseUrl}/courses/${created.id}/content/components/component-1/mux-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${token}`,
            origin: 'http://localhost:4200',
          },
          body: JSON.stringify({ sectionId: 'section-1' }),
        },
      );
      const body = await uploadResponse.json();

      expect(uploadResponse.status).toBe(201);
      expect(muxVideoService.lastInput).toEqual({
        courseId: created.id,
        sectionId: 'section-1',
        componentId: 'component-1',
        corsOrigin: 'http://localhost:4200',
      });
      expect(body).toMatchObject({
        uploadId: 'upload-1',
        uploadUrl: 'https://uploads.mux.com/direct-upload',
        playbackPolicy: 'public',
        content: {
          _id: created.id,
          sections: [
            {
              id: 'section-1',
              components: [
                {
                  id: 'component-1',
                  type: 'video',
                  mux: {
                    provider: 'mux',
                    uploadId: 'upload-1',
                    assetId: '',
                    playbackId: '',
                    playbackPolicy: 'public',
                    status: 'waiting',
                  },
                },
              ],
            },
          ],
        },
      });
    } finally {
      isolatedServer.close();
    }
  });

  it('removes a Mux video from a video component', async () => {
    const isolatedServer = createServer().listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = await loginAs('teacher@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validCourse()),
      });
      const created = await createResponse.json();
      const sections = [
        {
          id: 'section-1',
          title: 'Chapter 1',
          components: [
            {
              id: 'component-1',
              title: 'Intro video',
              type: 'video',
              durationMinutes: 5,
              content: 'Welcome notes',
              resourceUrl: '',
              mux: {
                provider: 'mux',
                uploadId: 'upload-1',
                assetId: 'asset-1',
                playbackId: 'playback-1',
                playbackPolicy: 'public',
                status: 'ready',
                durationSeconds: 120,
                thumbnailUrl: 'https://image.mux.com/playback-1/thumbnail.jpg',
                errorMessage: '',
                captions: [],
              },
            },
          ],
        },
      ];

      await fetch(`${isolatedBaseUrl}/courses/${created.id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sections }),
      });

      const removeResponse = await fetch(
        `${isolatedBaseUrl}/courses/${created.id}/content/components/component-1/mux-video`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sectionId: 'section-1' }),
        },
      );
      const body = await removeResponse.json();

      expect(removeResponse.status).toBe(200);
      expect(body.content.sections[0].components[0]).toEqual({
        id: 'component-1',
        title: 'Intro video',
        type: 'video',
        durationMinutes: 5,
        content: 'Welcome notes',
        resourceUrl: '',
        attachments: [],
      });
    } finally {
      isolatedServer.close();
    }
  });

  it('blocks students from creating Mux uploads', async () => {
    const muxVideoService = new FakeMuxVideoService();
    const isolatedServer = createServer({ muxVideoService }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const studentToken = await loginAs('student@qi-education.local', isolatedBaseUrl);
      const response = await fetch(
        `${isolatedBaseUrl}/courses/missing-course/content/components/component-1/mux-upload`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({ sectionId: 'section-1' }),
        },
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.message).toBe('Teacher or admin access is required');
      expect(muxVideoService.lastInput).toBeNull();
    } finally {
      isolatedServer.close();
    }
  });

  it('updates video components from Mux asset webhooks', async () => {
    const muxWebhookService = new FakeMuxWebhookService();
    const isolatedServer = createServer({ muxWebhookService }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = await loginAs('teacher@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validCourse()),
      });
      const created = await createResponse.json();
      const passthrough = JSON.stringify({
        c: created.id,
        s: 'section-1',
        m: 'component-1',
      });
      const sections = [
        {
          id: 'section-1',
          title: 'Chapter 1',
          components: [
            {
              id: 'component-1',
              title: 'Intro video',
              type: 'video',
              durationMinutes: 5,
              content: 'Welcome notes',
              resourceUrl: '',
              mux: {
                provider: 'mux',
                uploadId: 'upload-1',
                assetId: '',
                playbackId: '',
                playbackPolicy: 'public',
                status: 'waiting',
                durationSeconds: null,
                thumbnailUrl: '',
                errorMessage: '',
                captions: [],
              },
            },
          ],
        },
      ];

      await fetch(`${isolatedBaseUrl}/courses/${created.id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sections }),
      });

      muxWebhookService.event = {
        type: 'video.upload.asset_created',
        data: {
          id: 'upload-1',
          asset_id: 'asset-1',
          new_asset_settings: {
            passthrough,
          },
        },
      };

      const assetCreatedResponse = await fetch(`${isolatedBaseUrl}/api/webhooks/mux`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mux-signature': 'test',
        },
        body: JSON.stringify({ type: 'video.upload.asset_created' }),
      });

      expect(assetCreatedResponse.status).toBe(200);

      muxWebhookService.event = {
        type: 'video.asset.ready',
        data: {
          id: 'asset-1',
          duration: 123.45,
          passthrough,
          playback_ids: [
            {
              id: 'playback-1',
              policy: 'public',
            },
          ],
          upload_id: 'upload-1',
        },
      };

      const readyResponse = await fetch(`${isolatedBaseUrl}/api/webhooks/mux`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mux-signature': 'test',
        },
        body: JSON.stringify({ type: 'video.asset.ready' }),
      });
      const contentResponse = await fetch(`${isolatedBaseUrl}/courses/${created.id}/content?view=author`, { headers: { authorization: `Bearer ${token}` } });
      const content = await contentResponse.json();

      expect(readyResponse.status).toBe(200);
      expect(content.sections[0].components[0].mux).toEqual({
        provider: 'mux',
        uploadId: 'upload-1',
        assetId: 'asset-1',
        playbackId: 'playback-1',
        playbackPolicy: 'public',
        status: 'ready',
        durationSeconds: 123.45,
        thumbnailUrl: 'https://image.mux.com/playback-1/thumbnail.jpg',
        errorMessage: '',
        captions: [],
      });
    } finally {
      isolatedServer.close();
    }
  });

  it('rejects invalid Mux webhook signatures', async () => {
    const isolatedServer = createServer({
      muxWebhookService: new FailingMuxWebhookService(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${isolatedBaseUrl}/api/webhooks/mux`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'mux-signature': 'invalid',
        },
        body: JSON.stringify({ type: 'video.asset.ready' }),
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.message).toBe('Invalid Mux webhook signature.');
    } finally {
      isolatedServer.close();
    }
  });

  it('blocks a student from updating course content', async () => {
    const teacherToken = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();
    const studentToken = await loginAs('student@qi-education.local');

    const response = await fetch(`${baseUrl}/courses/${created.id}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ sections: [] }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe('Teacher or admin access is required');
  });

  it('returns 404 when updating content for a missing course', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const response = await fetch(`${baseUrl}/courses/missing-course/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sections: [] }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe('Course not found');
  });

  it('rejects invalid course content input', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/courses/${created.id}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sections: [
          {
            id: 'section-1',
            title: 'Broken section',
            components: [
              {
                id: 'component-1',
                title: 'Broken item',
                type: 'html',
                durationMinutes: 5,
                content: 'invalid',
              },
            ],
          },
        ],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
  });

  it('rejects quiz content without four answers', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(validCourse()),
    });
    const created = await createResponse.json();

    const response = await fetch(`${baseUrl}/courses/${created.id}/content`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sections: [
          {
            id: 'section-1',
            title: 'Quiz section',
            components: [
              {
                id: 'component-1',
                title: 'Broken quiz',
                type: 'quiz',
                durationMinutes: 5,
                content: 'A broken quiz',
                resourceUrl: '',
                quiz: {
                  passPoints: 1,
                  questions: [
                    {
                      id: 'question-1',
                      question: 'Pick the correct answer',
                      points: 1,
                      answers: [
                        {
                          id: 'answer-1',
                          text: 'One',
                          description: 'Only one option exists.',
                          isCorrect: true,
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
  });

  it('captures authenticated feedback', async () => {
    const token = await loginAs('student@qi-education.local');
    const response = await fetch(`${baseUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        page: 'Home',
        rating: 'great',
        message: 'The dashboard is clear.',
        userAgent: 'vitest',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toEqual(expect.any(String));
    expect(body.createdAt).toEqual(expect.any(String));
  });

  it('allows an admin to list received feedback', async () => {
    const studentToken = await loginAs('student@qi-education.local');
    await fetch(`${baseUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        page: 'Courses',
        rating: 'okay',
        message: 'Course list needs filters.',
        userAgent: 'vitest',
      }),
    });

    const adminToken = await loginAs('admin@qi-education.local');
    const response = await fetch(`${baseUrl}/feedback`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0]).toMatchObject({
      page: 'Courses',
      rating: 'okay',
      message: 'Course list needs filters.',
      userEmail: 'student@qi-education.local',
    });
  });

  it('allows an admin to update feedback triage', async () => {
    const gitHubFeedbackService = new FakeGitHubFeedbackService();
    const isolatedServer = createServer({ gitHubFeedbackService }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const studentToken = await loginAs('student@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          page: 'Home',
          rating: 'needs-work',
          message: 'The overview needs clearer next steps.',
        }),
      });
      const created = await createResponse.json();
      const adminToken = await loginAs('admin@qi-education.local', isolatedBaseUrl);

      const updateResponse = await fetch(`${isolatedBaseUrl}/feedback/${created.id}/triage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          workStatus: 'work',
          priority: 'high',
        }),
      });
      const updated = await updateResponse.json();

      expect(updateResponse.status).toBe(200);
      expect(updated).toMatchObject({
        id: created.id,
        workStatus: 'work',
        priority: 'high',
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/Stormeal/qi-education/issues/42',
      });
      expect(gitHubFeedbackService.createdFeedback).toMatchObject({
        id: created.id,
        workStatus: 'work',
        priority: 'high',
      });

      const listResponse = await fetch(`${isolatedBaseUrl}/feedback`, {
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      const feedback = await listResponse.json();

      expect(feedback[0]).toMatchObject({
        id: created.id,
        workStatus: 'work',
        priority: 'high',
        githubIssueNumber: 42,
        githubIssueUrl: 'https://github.com/Stormeal/qi-education/issues/42',
      });
    } finally {
      isolatedServer.close();
    }
  });

  it('does not create a duplicate GitHub issue when a work item priority changes', async () => {
    const gitHubFeedbackService = new FakeGitHubFeedbackService();
    const isolatedServer = createServer({ gitHubFeedbackService }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const studentToken = await loginAs('student@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          page: 'Courses',
          rating: 'needs-work',
          message: 'Need stronger filters.',
        }),
      });
      const created = await createResponse.json();
      const adminToken = await loginAs('admin@qi-education.local', isolatedBaseUrl);

      await fetch(`${isolatedBaseUrl}/feedback/${created.id}/triage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          workStatus: 'work',
          priority: 'medium',
        }),
      });

      const secondUpdateResponse = await fetch(`${isolatedBaseUrl}/feedback/${created.id}/triage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          workStatus: 'work',
          priority: 'high',
        }),
      });
      const updated = await secondUpdateResponse.json();

      expect(secondUpdateResponse.status).toBe(200);
      expect(updated).toMatchObject({
        workStatus: 'work',
        priority: 'high',
        githubIssueNumber: 42,
      });
      expect(gitHubFeedbackService.createCalls).toBe(1);
    } finally {
      isolatedServer.close();
    }
  });

  it('returns 503 when GitHub issue creation fails for a work item', async () => {
    const isolatedServer = createServer({
      gitHubFeedbackService: new FailingGitHubFeedbackService(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const studentToken = await loginAs('student@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          page: 'Home',
          rating: 'needs-work',
          message: 'This should fail to create an issue.',
        }),
      });
      const created = await createResponse.json();
      const adminToken = await loginAs('admin@qi-education.local', isolatedBaseUrl);

      const updateResponse = await fetch(`${isolatedBaseUrl}/feedback/${created.id}/triage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          workStatus: 'work',
          priority: 'high',
        }),
      });
      const body = await updateResponse.json();

      expect(updateResponse.status).toBe(503);
      expect(body.message).toBe('GitHub feedback integration is unavailable.');

      const listResponse = await fetch(`${isolatedBaseUrl}/feedback`, {
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      const feedback = await listResponse.json();

      expect(feedback[0]).toMatchObject({
        id: created.id,
      });
      expect(feedback[0].workStatus).toBeUndefined();
      expect(feedback[0].githubIssueUrl).toBeUndefined();
    } finally {
      isolatedServer.close();
    }
  });

  it('still marks feedback for work when project assignment fails after issue creation', async () => {
    const isolatedServer = createServer({
      gitHubFeedbackService: new PartialFailureGitHubFeedbackService(),
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const studentToken = await loginAs('student@qi-education.local', isolatedBaseUrl);
      const createResponse = await fetch(`${isolatedBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          page: 'Home',
          rating: 'needs-work',
          message: 'Create the issue even if project assignment fails.',
        }),
      });
      const created = await createResponse.json();
      const adminToken = await loginAs('admin@qi-education.local', isolatedBaseUrl);

      const updateResponse = await fetch(`${isolatedBaseUrl}/feedback/${created.id}/triage`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          workStatus: 'work',
          priority: 'high',
        }),
      });
      const updated = await updateResponse.json();

      expect(updateResponse.status).toBe(200);
      expect(updated).toMatchObject({
        id: created.id,
        workStatus: 'work',
        priority: 'high',
        githubIssueNumber: 43,
        githubIssueUrl: 'https://github.com/Stormeal/qi-education/issues/43',
      });
    } finally {
      isolatedServer.close();
    }
  });

  it('blocks non-admin users from listing feedback', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const response = await fetch(`${baseUrl}/feedback`, {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.message).toBe('Admin access is required');
  });

  it('rejects unauthenticated feedback', async () => {
    const response = await fetch(`${baseUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: 'Home',
        rating: 'great',
        message: 'Anonymous feedback',
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe('Authentication required');
  });

  it('rejects invalid course input', async () => {
    const token = await loginAs('teacher@qi-education.local');
    const response = await fetch(`${baseUrl}/courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: 'No' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
  });

  it('removes created content if course persistence fails', async () => {
    const contentRepository = new InMemoryCourseContentRepository();
    const failingCourseRepository = new FailingCreateCourseRepository();
    const isolatedServer = createServer({
      courseRepository: failingCourseRepository,
      courseContentRepository: contentRepository,
    }).listen(0);
    const address = isolatedServer.address() as AddressInfo;
    const isolatedBaseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const token = await loginAs('teacher@qi-education.local', isolatedBaseUrl);
      const response = await fetch(`${isolatedBaseUrl}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validCourse()),
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.message).toBe('Unexpected server error');
      expect(failingCourseRepository.lastCreateId).toEqual(expect.any(String));
      expect(
        await contentRepository.getCourseContent(failingCourseRepository.lastCreateId!),
      ).toBeNull();
    } finally {
      isolatedServer.close();
    }
  });

  async function loginAs(email: string, origin = baseUrl) {
    const response = await fetch(`${origin}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'Password123!',
      }),
    });
    const body = await response.json();

    return body.token as string;
  }
});

function validCourse() {
  return {
    title: 'API Automation Foundations',
    description: 'Learn how API-based test automation fits into modern QA workflows.',
    requirements: ['Basic testing experience', 'Comfort reading API documentation'],
    whatYoullLearn: ['Write maintainable API tests', 'Understand modern API QA workflows'],
    audience: 'QA professionals moving into API automation.',
    level: 'Intermediate',
    partOfCareer: 'Automation Engineering',
    teacher: 'Teacher Demo',
    careerGoals: ['Automation', 'API testing'],
    status: 'draft',
    priceDkk: null,
  };
}

class FailingCreateCourseRepository extends InMemoryCourseRepository implements CourseRepository {
  lastCreateId: string | null = null;

  override async createCourse(...args: Parameters<CourseRepository['createCourse']>) {
    this.lastCreateId = args[1]?.id ?? null;
    throw new Error('Sheets write failed');
  }
}

class SharedCourseRepository extends InMemoryCourseRepository implements CourseRepository {
  override readonly storageType = 'google-sheets';
}

class FailingCourseContentRepository implements CourseContentRepository {
  async withCourseMutationLock<T>(_id: string, operation: () => Promise<T>): Promise<T> { return operation(); }
  readonly storageType = 'mongodb';

  async checkHealth(): Promise<void> {
    throw new Error('Content store unavailable');
  }

  async getCourseContent() {
    throw new Error('Content store unavailable');
  }

  async createEmptyCourseContent(): ReturnType<CourseContentRepository['createEmptyCourseContent']> {
    throw new Error('Content store unavailable');
  }

  async updateCourseContent(): ReturnType<CourseContentRepository['updateCourseContent']> {
    throw new Error('Content store unavailable');
  }

  async deleteCourseContent(): Promise<void> {
    throw new Error('Content store unavailable');
  }
}

class FakeMuxVideoService implements MuxVideoService {
  lastInput: Parameters<MuxVideoService['createDirectUpload']>[0] | null = null;

  async createDirectUpload(input: Parameters<MuxVideoService['createDirectUpload']>[0]) {
    this.lastInput = input;

    return {
      uploadId: 'upload-1',
      uploadUrl: 'https://uploads.mux.com/direct-upload',
      playbackPolicy: 'public' as const,
    };
  }
}

class FakeMuxWebhookService implements MuxWebhookService {
  event: MuxWebhookEvent = {
    type: 'video.asset.created',
    data: {},
  };

  async unwrapWebhook(): Promise<MuxWebhookEvent> {
    return this.event;
  }
}

class FailingMuxWebhookService implements MuxWebhookService {
  async unwrapWebhook(): Promise<MuxWebhookEvent> {
    throw new Error('No signatures found matching the expected signature for payload.');
  }
}

class FakeGitHubFeedbackService implements GitHubFeedbackService {
  createCalls = 0;
  createdFeedback: FeedbackEntry | null = null;

  async createIssueFromFeedback(feedback: FeedbackEntry): Promise<GitHubFeedbackIssue> {
    this.createCalls += 1;
    this.createdFeedback = feedback;

    return {
      number: 42,
      url: 'https://github.com/Stormeal/qi-education/issues/42',
    };
  }
}

class FailingGitHubFeedbackService implements GitHubFeedbackService {
  async createIssueFromFeedback(): Promise<GitHubFeedbackIssue> {
    throw new GitHubFeedbackError('GitHub API unavailable');
  }
}

class PartialFailureGitHubFeedbackService implements GitHubFeedbackService {
  async createIssueFromFeedback(): Promise<GitHubFeedbackIssue> {
    return {
      number: 43,
      url: 'https://github.com/Stormeal/qi-education/issues/43',
    };
  }
}
