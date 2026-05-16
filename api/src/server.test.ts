import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  InMemoryCourseContentRepository,
  type CourseContentRepository,
} from './courseContentRepository.js';
import { InMemoryCourseRepository, type CourseRepository } from './courseRepository.js';
import { createServer } from './server.js';

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
      corsOrigins: [
        'http://localhost:4200',
        'http://127.0.0.1:4200',
        'https://stormeal.github.io',
        'https://qi-education.vercel.app',
      ],
      ranges: {
        courses: 'Courses!A:M',
        users: 'Users!A:H',
        feedback: 'Feedback!A:I',
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

    const contentResponse = await fetch(`${baseUrl}/courses/${body.id}/content`);
    const content = await contentResponse.json();

    expect(contentResponse.status).toBe(200);
    expect(content).toMatchObject({
      _id: body.id,
      sections: [],
      createdAt: body.createdAt,
      updatedAt: body.createdAt,
    });
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
    const response = await fetch(`${baseUrl}/courses/missing-course/content`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe('Course content not found');
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
      const response = await fetch(`${isolatedBaseUrl}/courses/${course.id}/content`);
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
        status: 'published',
      }),
    });
    const updated = await updateResponse.json();

    expect(updateResponse.status).toBe(200);
    expect(updated).toMatchObject({
      id: created.id,
      title: 'API Automation Foundations, Revised',
      partOfCareer: 'Automation Engineering',
      status: 'published',
      priceDkk: null,
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

    const getResponse = await fetch(`${baseUrl}/courses/${created.id}/content`);
    const loaded = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(loaded.sections).toEqual(sections);
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
    const studentToken = await loginAs('student@qi-education.local');
    const createResponse = await fetch(`${baseUrl}/feedback`, {
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
    const adminToken = await loginAs('admin@qi-education.local');

    const updateResponse = await fetch(`${baseUrl}/feedback/${created.id}/triage`, {
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
    });

    const listResponse = await fetch(`${baseUrl}/feedback`, {
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });
    const feedback = await listResponse.json();

    expect(feedback[0]).toMatchObject({
      id: created.id,
      workStatus: 'work',
      priority: 'high',
    });
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

class FailingCourseContentRepository implements CourseContentRepository {
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
