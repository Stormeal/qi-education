import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, toAuthenticatedUser, type AuthUser } from './auth.js';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';
import { InMemoryFeedbackRepository } from './feedbackRepository.js';
import { InMemoryCareerPathRepository } from './careerPathRepository.js';
import { InMemoryLearningProgressRepository } from './learningProgressRepository.js';
import { createCourseSchema } from './course.js';
import { updateCourseContentSchema, type CourseContentSection } from './courseContent.js';
import { assessmentIssues, quizAttemptSchema, scoreQuiz } from './quizAssessment.js';
import { learnerCourseContent } from './courseAccess.js';
import { apiConfig } from './config.js';
import { createServer } from './server.js';

const questions = (count = 4) => [{ id: 'q', question: 'Select the valid choices', points: 9,
  explanation: 'Reason for this question', answers: Array.from({ length: count }, (_, index) => ({
    id: String(index), text: `Option ${index}`, isCorrect: index < 2, description: `Legacy ${index}`,
  })) }];
const outline = (count = 4) => [{ id: 's', title: 'Assessment', components: [
  { id: 'quiz', title: 'Knowledge', type: 'quiz', quiz: { passPoints: 1, questions: questions(count) } },
] }];
const parsedSections = () => updateCourseContentSchema.parse({ sections: outline() }).sections;
const selected = (answerIds: string[]) => quizAttemptSchema.parse({ sectionId: 's', answers: [{ questionId: 'q', answerIds }] }).answers;

describe('US-T013 simple quiz rules', () => {
  it.each([2, 3, 4, 5, 6])('AC01 saves %i options with one point and retained legacy descriptions', count => {
    const question = updateCourseContentSchema.parse({ sections: outline(count) }).sections[0].components[0];
    expect(question).toMatchObject({ quiz: { questions: [{ points: 1, explanation: 'Reason for this question',
      answers: expect.arrayContaining([expect.objectContaining({ description: 'Legacy 0' })]) }] } });
  });
  it.each([0, 1, 7])('AC01 refuses %i options', count => {
    expect(updateCourseContentSchema.safeParse({ sections: outline(count) }).success).toBe(false);
  });
  it('AC01 defaults explanation and ignores any sent points value', () => {
    const sections = outline();
    const q = sections[0].components[0].quiz.questions[0];
    delete (q as Partial<typeof q>).explanation;
    Object.assign(q, { points: 'obsolete field' });
    expect(updateCourseContentSchema.parse({ sections }).sections[0].components[0]).toMatchObject({ quiz: { questions: [{ points: 1, explanation: '' }] } });
  });
  it('AC01 bounds explanation at 1500 characters (US-T015) without trimming its stored value', () => {
    const sections = outline();
    sections[0].components[0].quiz.questions[0].explanation = ' '.repeat(1500);
    expect(updateCourseContentSchema.safeParse({ sections }).success).toBe(true);
    sections[0].components[0].quiz.questions[0].explanation += 'x';
    expect(updateCourseContentSchema.safeParse({ sections }).success).toBe(false);
  });
  it('AC02 accepts multiple and all-correct sets for review but refuses unfinished questions', () => {
    const sections = parsedSections();
    expect(assessmentIssues(sections, true)).toEqual([]);
    const component = sections[0].components[0];
    if (component.type !== 'quiz') throw new Error('Fixture');
    component.quiz.questions[0].answers.forEach(answer => answer.isCorrect = true);
    expect(assessmentIssues(sections, true)).toEqual([]);
    component.quiz.questions[0].question = '';
    component.quiz.questions[0].answers.forEach(answer => { answer.text = ''; answer.isCorrect = false; });
    expect(assessmentIssues(sections, false)).toEqual([]);
    const issues = assessmentIssues(sections, true);
    expect(issues).toHaveLength(3);
    expect(issues.every(issue => issue.questionId === 'q' && issue.message.includes('Question 1:'))).toBe(true);
  });
  it('AC02 counts questions for the review pass mark and rejects malformed stored option counts', () => {
    const sections = parsedSections();
    const component = sections[0].components[0];
    if (component.type !== 'quiz') throw new Error('Fixture');
    component.quiz.passPoints = 2;
    expect(assessmentIssues(sections, true)).toEqual([expect.objectContaining({ message: expect.stringMatching(/Pass mark/) })]);
    component.quiz.passPoints = 0;
    expect(assessmentIssues(sections, true)).toEqual([expect.objectContaining({ message: expect.stringMatching(/Pass mark/) })]);
    component.quiz.passPoints = 1;
    component.quiz.questions[0].answers = [];
    expect(assessmentIssues(sections, true).some(issue => issue.message.includes('Question 1:'))).toBe(true);
  });
  it.each([
    { ids: ['1', '0', '1'], score: 1 }, { ids: ['0'], score: 0 },
    { ids: ['0', '1', '2'], score: 0 }, { ids: ['2'], score: 0 },
  ])('AC03 scores selected set $ids as $score with no partial credit or weighted points', ({ ids, score }) => {
    const component = parsedSections()[0].components[0];
    if (component.type !== 'quiz') throw new Error('Fixture');
    const result = scoreQuiz(component, selected(ids));
    expect(result).toMatchObject({ score, totalPoints: 1, passPoints: 1, passed: score === 1 });
    expect(result?.feedback[0]).toEqual({ questionId: 'q', answerIds: [...new Set(ids)], answerId: ids[0],
      correct: score === 1, explanation: 'Reason for this question', description: 'Reason for this question' });
  });
  it('AC03 refuses unknown IDs and duplicate questions, retaining skipped questions', () => {
    const component = parsedSections()[0].components[0];
    if (component.type !== 'quiz') throw new Error('Fixture');
    expect(scoreQuiz(component, selected(['unknown']))).toBeNull();
    const entries = selected(['0']);
    expect(scoreQuiz(component, [...entries, ...entries])).toBeNull();
    expect(scoreQuiz(component, [])).toMatchObject({ score: 0, passed: false, feedback: [] });
    expect(quizAttemptSchema.safeParse({ sectionId: 's', answers: [{ questionId: 'q', answerIds: [], answerId: '0' }] }).success).toBe(false);
  });
  it('AC03 uses answerIds when both request fields exist and grades all six correct options', () => {
    const sections = updateCourseContentSchema.parse({ sections: outline(6) }).sections;
    const quiz = sections[0].components[0];
    if (quiz.type !== 'quiz') throw new Error('Fixture');
    quiz.quiz.questions[0].answers.forEach(answer => answer.isCorrect = true);
    const input = quizAttemptSchema.parse({ sectionId: 's', answers: [{ questionId: 'q', answerId: 'unknown', answerIds: ['5', '4', '3', '2', '1', '0', '5'] }] });
    expect(scoreQuiz(quiz, input.answers)).toMatchObject({ score: 1, totalPoints: 1, passed: true });
    expect(scoreQuiz(quiz, selected(['0', '1', '2', '3', '4']))).toMatchObject({ score: 0, passed: false });
  });
  it('AC03 ignores malformed unused legacy answerId when answerIds takes precedence', () => {
    for (const answerId of ['', null, 9]) {
      const input = quizAttemptSchema.safeParse({ sectionId: 's', answers: [{ questionId: 'q', answerIds: ['0', '1'], answerId }] });
      expect(input.success).toBe(true);
      if (input.success) expect(input.data.answers).toEqual([{ questionId: 'q', answerIds: ['0', '1'] }]);
    }
    expect(quizAttemptSchema.safeParse({ sectionId: 's', answers: [{ questionId: 'q', answerId: '' }] }).success).toBe(false);
  });
  it('AC05 counts two raw weighted questions and clamps only the legacy passing threshold', () => {
    const quiz = parsedSections()[0].components[0];
    if (quiz.type !== 'quiz') throw new Error('Fixture');
    quiz.quiz.questions.push({ ...structuredClone(quiz.quiz.questions[0]), id: 'q2' });
    quiz.quiz.questions.forEach(question => question.points = 9);
    quiz.quiz.passPoints = 18;
    expect(scoreQuiz(quiz, selected(['0', '1']))).toMatchObject({ score: 1, totalPoints: 2, passPoints: 18, passed: false });
    const full = [...selected(['0', '1']), { questionId: 'q2', answerIds: ['1', '0'] }];
    expect(scoreQuiz(quiz, full)).toMatchObject({ score: 2, totalPoints: 2, passPoints: 18, passed: true });
  });
  it('AC04 learner projection is a whitelist that hides question explanation and answer keys', () => {
    const sections = parsedSections();
    const component = sections[0].components[0];
    if (component.type !== 'quiz') throw new Error('Fixture');
    Object.assign(component.quiz.questions[0], { correctAnswerIds: ['0', '1'], privateRubric: 'Secret' });
    const learner = learnerCourseContent({ _id: 'c', sections, createdAt: 'a', updatedAt: 'b' });
    const quiz = learner.sections[0].components[0];
    expect(quiz).toMatchObject({ quiz: { questions: [{ id: 'q', question: 'Select the valid choices', points: 1, multiple: true,
      answers: [0, 1, 2, 3].map(id => ({ id: String(id), text: `Option ${id}`, description: '' })) }] } });
    const serialized = JSON.stringify(learner);
    for (const secret of ['isCorrect', 'explanation', 'Legacy', 'correctAnswerIds', 'privateRubric']) expect(serialized).not.toContain(secret);
  });
});

describe.each(['', '/api'])('US-T013 isolated API (%s)', prefix => {
  let server: Server, base: string, auth: InMemoryAuthRepository, courses: InMemoryCourseRepository,
    content: InMemoryCourseContentRepository, owner: AuthUser, student: AuthUser, outsider: AuthUser;
  const paths = ['/courses/course/content/components/quiz/quiz-attempts', '/users/me/learning-progress/course/components/quiz/quiz-attempts'];
  async function request(path: string, method = 'GET', body?: unknown, user = student, extra: Record<string, string> = {}) {
    return fetch(base + prefix + path, { method, headers: { 'Content-Type': 'application/json',
      authorization: `Bearer ${createSessionToken(toAuthenticatedUser(user), apiConfig.AUTH_TOKEN_SECRET!)}`, ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  beforeEach(async () => {
    auth = new InMemoryAuthRepository(); courses = new InMemoryCourseRepository(); content = new InMemoryCourseContentRepository();
    owner = (await auth.findByEmail('teacher@qi-education.local'))!;
    student = (await auth.findByEmail('student@qi-education.local'))!;
    outsider = await auth.createUser({ ...student, id: 'outsider', email: 'outside@example.test' });
    await auth.enrollUserInCourse(student.id, 'course');
    await courses.createCourse(createCourseSchema.parse({ title: 'Simple quiz', description: 'Isolated quiz tests', teacher: 'Teacher', level: 'Beginner', status: 'published' }), { id: 'course', ownerUserId: owner.id });
    await content.createEmptyCourseContent('course');
    // Deliberately seed raw legacy data: no parser/migration may conceal old points.
    await content.updateCourseContent('course', outline() as CourseContentSection[]);
    server = createServer({ authRepository: auth, courseRepository: courses, courseContentRepository: content,
      courseAssetRepository: new InMemoryCourseAssetRepository(), feedbackRepository: new InMemoryFeedbackRepository(),
      careerPathRepository: new InMemoryCareerPathRepository(), learningProgressRepository: new InMemoryLearningProgressRepository(),
      gitHubFeedbackService: { createIssueFromFeedback: async () => { throw new Error('No GitHub'); } },
      muxVideoService: null, muxWebhookService: null }).listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

  it.each(paths)('AC03/04 grades exact sets on %s and returns only submitted IDs', async path => {
    for (const [ids, score] of [[['1', '0', '1'], 1], [['0'], 0], [['0', '1', '2'], 0]] as const) {
      const response = await request(path, 'POST', { sectionId: 's', answers: [{ questionId: 'q', answerIds: ids }] });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result).toEqual({ score, totalPoints: 1, passPoints: 1, passed: score === 1,
        feedback: [{ questionId: 'q', answerIds: [...new Set(ids)], answerId: ids[0], correct: score === 1,
          explanation: 'Reason for this question', description: 'Reason for this question' }] });
      expect(JSON.stringify(result)).not.toContain('isCorrect');
    }
    for (const selection of [{ answerIds: [] }, { answerIds: ['unknown'] }, { answerId: 'unknown' }, {}]) {
      expect((await request(path, 'POST', { sectionId: 's', answers: [{ questionId: 'q', ...selection }] })).status).toBe(400);
    }
    expect((await request(path, 'POST', { sectionId: 's', answers: [{ questionId: 'q', answerIds: ['0'] }] }, outsider)).status).toBe(403);
  });
  it.each(paths)('AC05 preserves raw legacy grading and description fallback on %s', async path => {
    const sections = outline();
    const quiz = sections[0].components[0].quiz;
    quiz.passPoints = 9;
    quiz.questions[0].answers[1].isCorrect = false;
    delete (quiz.questions[0] as Partial<typeof quiz.questions[0]>).explanation;
    await content.updateCourseContent('course', sections as CourseContentSection[]);
    const response = await request(path, 'POST', { sectionId: 's', answers: [{ questionId: 'q', answerId: '0' }] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ score: 1, totalPoints: 1, passPoints: 9, passed: true,
      feedback: [{ questionId: 'q', answerIds: ['0'], answerId: '0', correct: true, explanation: '', description: 'Legacy 0' }] });
    const read = await (await request('/courses/course/content')).json();
    expect(read.sections[0].components[0].quiz.questions[0]).toMatchObject({ points: 1, multiple: false });
    const author = await (await request('/courses/course/content?view=author', 'GET', undefined, owner)).json();
    expect(author.sections[0].components[0].quiz.questions[0]).toMatchObject({ points: 1, explanation: '', answers: [
      { id: '0', description: 'Legacy 0' }, { id: '1', description: 'Legacy 1' },
      { id: '2', description: 'Legacy 2' }, { id: '3', description: 'Legacy 3' },
    ] });
    if (path.includes('learning-progress')) expect((await request('/users/me/learning-progress/course/lessons/quiz', 'PUT')).status).toBe(200);
    expect((await content.getCourseContent('course'))!.sections[0].components[0]).toMatchObject({ quiz: { questions: [{ points: 9 }] } });
  });
  it('AC06 retains failed/changed/account guards and accepts Finish after raw legacy passing proof', async () => {
    const finish = '/users/me/learning-progress/course/lessons/quiz';
    const attempt = (answerIds: string[]) => request(paths[1], 'POST', { sectionId: 's', answers: [{ questionId: 'q', answerIds }] });
    expect((await request(finish, 'PUT')).status).toBe(409);
    expect((await attempt(['0'])).status).toBe(200);
    expect((await request(finish, 'PUT')).status).toBe(409);
    expect((await attempt(['0', '1'])).status).toBe(200);
    expect((await request(finish, 'PUT')).status).toBe(200);
    expect((await request(finish, 'PUT', undefined, outsider)).status).toBe(403);
    const changed = outline(); changed[0].components[0].quiz.questions[0].answers[2].isCorrect = true;
    await content.updateCourseContent('course', changed as CourseContentSection[]);
    expect((await request(finish, 'PUT')).status).toBe(409);
  });
  it('AC01/02 saves legacy fields and enforces new readiness without discarding rejected drafts', async () => {
    await courses.updateCourse('course', createCourseSchema.parse({ title: 'Simple quiz', description: 'Isolated quiz tests', teacher: 'Teacher', level: 'Beginner', status: 'draft' }));
    async function save(sections: unknown) {
      const author = await (await request('/courses/course/content?view=author', 'GET', undefined, owner)).json();
      return request('/courses/course/content', 'PATCH', { sections }, owner,
        { 'X-Course-Revision': JSON.stringify({ version: author.review.version, revisionId: author.review.revisionId }) });
    }
    expect((await save(outline(2))).status).toBe(200);
    const author = await (await request('/courses/course/content?view=author', 'GET', undefined, owner)).json();
    expect(author.sections[0].components[0].quiz.questions[0]).toMatchObject({ points: 1, explanation: 'Reason for this question' });
    for (const count of [1, 7]) {
      const refused = await save(outline(count));
      expect(refused.status).toBe(400); expect(await refused.json()).toHaveProperty('message');
    }
    const invalid = outline(2); invalid[0].components[0].quiz.passPoints = 2;
    expect((await save(invalid)).status).toBe(200);
    const latest = await (await request('/courses/course/content?view=author', 'GET', undefined, owner)).json();
    const refused = await request('/courses/course/review', 'POST', { action: 'submit', expectedVersion: latest.review.version, revisionId: latest.review.revisionId }, owner);
    expect(refused.status).toBe(400);
    expect((await save(outline(2))).status).toBe(200);
    const ready = await (await request('/courses/course/content?view=author', 'GET', undefined, owner)).json();
    expect((await request('/courses/course/review', 'POST', { action: 'submit', expectedVersion: ready.review.version, revisionId: ready.review.revisionId }, owner)).status).toBe(200);
  });
});
