import { TestBed } from '@angular/core/testing';
import { ApiClientService } from './api-client.service';
import { LessonExtrasService, type LessonNote } from './lesson-extras.service';

const note: LessonNote = { id: 'note /1', courseId: 'course /1', componentId: 'video', text: 'My note', videoSeconds: 95,
  createdAt: '2026-10-17T10:00:00.000Z', updatedAt: '2026-10-17T10:00:00.000Z' };

describe('US-L015 AC08 lesson extras service contract', () => {
  let service: LessonExtrasService;
  let calls: { path: string; init: RequestInit }[];
  let response: () => Response;
  beforeEach(() => {
    calls = [];
    response = () => new Response(JSON.stringify({ notes: [note] }), { status: 200 });
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: {
      fetch: async (path: string, init: RequestInit) => { calls.push({ path, init }); return response(); },
    } }] });
    service = TestBed.inject(LessonExtrasService);
  });
  function expectCall(path: string, method: string, body?: unknown, token = 'session') {
    const call = calls.at(-1)!;
    expect(call.path).toBe(`/courses/course%20%2F1${path}`);
    expect(call.init.method ?? 'GET').toBe(method);
    const headers = new Headers(call.init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${token}`);
    if (body !== undefined) {
      expect(headers.get('content-type')).toBe('application/json');
      expect(JSON.parse(call.init.body as string)).toEqual(body);
    } else expect(call.init.body).toBeUndefined();
  }
  it('lists current notes with the caller token and no retained result across accounts or mutations', async () => {
    expect(await service.listNotes(note.courseId, 'session')).toEqual([note]);
    expectCall('/notes', 'GET');
    response = () => new Response(JSON.stringify({ notes: [] }));
    expect(await service.listNotes(note.courseId, 'other')).toEqual([]);
    expectCall('/notes', 'GET', undefined, 'other');
    expect(await service.listNotes(note.courseId, 'session')).toEqual([]);
    expect(calls).toHaveLength(3);
  });
  it('adds a timed note with the exact body and unwraps the note', async () => {
    response = () => new Response(JSON.stringify({ note }), { status: 201 });
    const input = { componentId: 'video', text: 'My note', videoSeconds: 95 };
    expect(await service.addNote(note.courseId, input, 'session')).toEqual(note);
    expectCall('/notes', 'POST', input);
    const untimed = { componentId: 'exercise', text: 'Steps', videoSeconds: null };
    await service.addNote(note.courseId, untimed, 'session');
    expectCall('/notes', 'POST', untimed);
  });
  it('updates text only and encodes the note ID', async () => {
    response = () => new Response(JSON.stringify({ note: { ...note, text: 'Revised' } }));
    expect(await service.updateNote(note.courseId, note.id, 'Revised', 'session')).toEqual({ ...note, text: 'Revised' });
    expectCall('/notes/note%20%2F1', 'PATCH', { text: 'Revised' });
  });
  it('deletes with no body and handles the empty 204 response', async () => {
    response = () => new Response(null, { status: 204 });
    expect(await service.deleteNote(note.courseId, note.id, 'session')).toBeUndefined();
    expectCall('/notes/note%20%2F1', 'DELETE');
  });
  it('sends all feedback kinds, optional problem fields and returns void', async () => {
    response = () => new Response(JSON.stringify({ id: 'feedback' }), { status: 201 });
    for (const kind of ['helpful', 'not-helpful'] as const) {
      expect(await service.sendLessonFeedback(note.courseId, { componentId: 'video', kind }, 'session')).toBeUndefined();
      expectCall('/lesson-feedback', 'POST', { componentId: 'video', kind });
    }
    const problem = { componentId: 'video', kind: 'problem' as const, category: 'video' as const, message: 'Stuck' };
    await service.sendLessonFeedback(note.courseId, problem, 'session');
    expectCall('/lesson-feedback', 'POST', problem);
  });
  it('unwraps the learner count including zero', async () => {
    for (const enrolledLearners of [0, 3]) {
      response = () => new Response(JSON.stringify({ enrolledLearners }));
      expect(await service.enrolledLearners(note.courseId, 'session')).toBe(enrolledLearners);
      expectCall('/learners/count', 'GET');
    }
  });

  const operations = [
    (service: LessonExtrasService) => service.listNotes(note.courseId, 'session'),
    (service: LessonExtrasService) => service.addNote(note.courseId, { componentId: 'video', text: 'Note', videoSeconds: null }, 'session'),
    (service: LessonExtrasService) => service.updateNote(note.courseId, note.id, 'Revised', 'session'),
    (service: LessonExtrasService) => service.deleteNote(note.courseId, note.id, 'session'),
    (service: LessonExtrasService) => service.sendLessonFeedback(note.courseId, { componentId: 'video', kind: 'helpful' }, 'session'),
    (service: LessonExtrasService) => service.enrolledLearners(note.courseId, 'session'),
  ];
  it('rejects every failed method with the API message as an Error', async () => {
    for (const operation of operations) {
      response = () => new Response(JSON.stringify({ message: 'Course access denied.' }), { status: 403 });
      await expect(operation(service)).rejects.toThrow(new Error('Course access denied.'));
    }
  });
  it('gives plain fallback Errors for non-JSON, missing-message and network failures', async () => {
    for (const operation of operations) {
      for (const makeResponse of [
        () => new Response('Unavailable', { status: 503 }),
        () => new Response('{}', { status: 500 }),
        () => { throw 'network failure'; },
      ]) {
        response = makeResponse;
        const failure = await operation(service).catch(error => error);
        expect(failure).toBeInstanceOf(Error);
        expect(failure.message).toMatch(/^Unable to .+\.$/);
      }
    }
  });
});
