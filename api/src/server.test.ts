import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
      status: 'draft',
    });
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

  async function loginAs(email: string) {
    const response = await fetch(`${baseUrl}/auth/login`, {
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
    level: 'Intermediate',
    teacher: 'Teacher Demo',
    careerGoals: ['Automation', 'API testing'],
    status: 'draft',
  };
}
