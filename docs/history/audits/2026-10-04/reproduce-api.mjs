// Historical audit probe, not a regression suite. Uses only isolated memory stores.
// From the repository root: npm run api:build
// Then: node docs/audits/2026-10-04/reproduce-api.mjs
process.env.NODE_ENV = 'test';
process.env.AUTH_TOKEN_SECRET = 'isolated-audit-secret-2026';

const { createServer } = await import('../../../api/dist/server.js');
const { InMemoryAuthRepository } = await import('../../../api/dist/authRepository.js');
const { InMemoryCourseRepository } = await import('../../../api/dist/courseRepository.js');
const { InMemoryCourseContentRepository } = await import('../../../api/dist/courseContentRepository.js');
const { InMemoryCourseAssetRepository } = await import('../../../api/dist/courseAssetRepository.js');
const { InMemoryFeedbackRepository } = await import('../../../api/dist/feedbackRepository.js');
const { createCourseSchema } = await import('../../../api/dist/course.js');
const { hashPassword } = await import('../../../api/dist/auth.js');

const authRepository = new InMemoryAuthRepository();
const courseRepository = new InMemoryCourseRepository();
const courseContentRepository = new InMemoryCourseContentRepository();
const courseAssetRepository = new InMemoryCourseAssetRepository();
await authRepository.createUser({
  id: 'audit-teacher-b', email: 'teacher-b@audit.local', displayName: 'Audit Teacher B',
  passwordHash: hashPassword('Password123!'), role: 'teacher', status: 'active',
  createdAt: new Date().toISOString(), enrolledCourseIds: [],
});
const app = createServer({
  authRepository, courseRepository, courseContentRepository, courseAssetRepository,
  feedbackRepository: new InMemoryFeedbackRepository(),
  gitHubFeedbackService: { async createIssueFromFeedback() { throw new Error('External writes disabled'); } },
});
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const observations = [];
async function request(path, { token, body, raw, method = 'GET', contentType = 'application/json' } = {}) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { 'content-type': contentType, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(raw !== undefined ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
async function login(email) {
  const result = await request('/auth/login', { method: 'POST', body: { email, password: 'Password123!' } });
  if (result.status !== 200 || !result.body.token) throw new Error(`Local login failed: ${email}`);
  return result.body.token;
}
function record(id, probe, result, details = {}) {
  observations.push({ id, probe, status: result.status, ...details });
}
try {
  const teacher = await login('teacher@qi-education.local');
  const otherTeacher = await login('teacher-b@audit.local');
  const student = await login('student@qi-education.local');
  const draft = createCourseSchema.parse({
    title: 'Isolated audit draft', description: 'This is private authoring content used only in a local audit.',
    level: 'Beginner', teacher: 'Teacher Demo', status: 'draft',
  });
  const created = await request('/courses', { method: 'POST', token: teacher, body: draft });
  if (created.status !== 201) throw new Error('Local draft creation failed');
  const id = created.body.id;
  const sections = [{ id: 'audit-section', title: 'Audit section', components: [{
    id: 'audit-text', title: 'Private lesson', type: 'text', durationMinutes: 1,
    content: 'Private draft lesson body', resourceUrl: '', attachments: [],
  }] }];
  await request(`/courses/${id}/content`, { method: 'PATCH', token: teacher, body: { sections } });

  const otherEdit = await request(`/courses/${id}`, {
    method: 'PATCH', token: otherTeacher, body: { ...draft, title: 'Changed by unrelated teacher' },
  });
  record('DEF-001', 'An unrelated teacher changes another teacher draft', otherEdit);
  record('CONTROL', 'A student cannot create a course', await request('/courses', {
    method: 'POST', token: student, body: draft,
  }));
  record('DEF-002', 'Teacher publishes a draft and sets its price through general PATCH', await request(`/courses/${id}`, {
    method: 'PATCH', token: teacher, body: { ...draft, status: 'published', priceDkk: 1200 },
  }));
  record('DEF-002', 'Dedicated price endpoint correctly rejects a teacher', await request(`/courses/${id}/price`, {
    method: 'PATCH', token: teacher, body: { priceDkk: 1200 },
  }));
  await request(`/courses/${id}`, { method: 'PATCH', token: teacher, body: draft });
  const catalog = await request('/courses');
  record('DEF-003', 'Anonymous catalog includes draft metadata', catalog, {
    draftIncluded: catalog.body.some((course) => course.id === id && course.status === 'draft'),
  });
  const content = await request(`/courses/${id}/content`);
  record('DEF-003', 'Anonymous request receives private draft lesson content', content, {
    privateBodyIncluded: content.body.sections?.[0]?.components?.[0]?.content === 'Private draft lesson body',
  });
  const enrollment = await request(`/users/me/courses/${id}`, { method: 'POST', token: student });
  record('DEF-004', 'Student enrolls in an unpublished draft', enrollment, {
    draftEnrolled: enrollment.body.user?.enrolledCourseIds?.includes(id),
  });
  await request(`/courses/${id}`, { method: 'PATCH', token: teacher, body: { ...draft, status: 'archived' } });
  record('DEF-004', 'Student enrollment endpoint also accepts an archived course', await request(`/users/me/courses/${id}`, {
    method: 'POST', token: student,
  }));

  // A published single-choice quiz with no correct answer and an impossible pass mark.
  const quizSections = [{ id: 'quiz-section', title: 'Quiz section', components: [{
    id: 'quiz', title: 'Impossible quiz', type: 'quiz', durationMinutes: 1,
    content: '', resourceUrl: '', attachments: [],
    quiz: { passPoints: 2, questions: [{ id: 'q1', question: 'Choose the correct option', points: 1,
      answers: ['a1', 'a2', 'a3', 'a4'].map((answerId) => ({
        id: answerId, text: answerId, description: '', isCorrect: false,
      })),
    }] },
  }] }];
  record('DEF-005', 'Save quiz with no correct answer and passPoints above total points', await request(`/courses/${id}/content`, {
    method: 'PATCH', token: teacher, body: { sections: quizSections },
  }));
  record('DEF-005', 'Publish the impossible quiz', await request(`/courses/${id}`, {
    method: 'PATCH', token: teacher, body: { ...draft, status: 'published' },
  }));
  const quizContent = await request(`/courses/${id}/content`);
  record('DEF-003', 'Anonymous content DTO contains quiz scoring flags', quizContent, {
    answerFlagsIncluded: typeof quizContent.body.sections?.[0]?.components?.[0]?.quiz?.questions?.[0]?.answers?.[0]?.isCorrect === 'boolean',
  });
  record('DEF-008', 'Malformed JSON is classified as a server error', await request('/auth/login', {
    method: 'POST', raw: '{',
  }));
  record('DEF-008', 'Thumbnail exceeding documented 2 MB limit is classified as a server error', await request(`/courses/${id}/thumbnail`, {
    method: 'PUT', token: teacher, raw: Buffer.alloc(2 * 1024 * 1024 + 1), contentType: 'image/png',
  }));
  console.log(JSON.stringify({ audit: '2026-10-04', observations }, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
