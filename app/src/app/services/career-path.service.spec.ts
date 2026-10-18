import { TestBed } from '@angular/core/testing';
import { ApiClientService } from './api-client.service';
import { CareerPathService } from './career-path.service';
import { CourseService } from './course.service';
import { LearningProgressService } from './learning-progress.service';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const path = (id: string) => ({ id, revision: 1, title: id, summary: '', outcomes: [], estimatedHours: 0, steps: [] });

describe('career guidance across session changes (US-P004-AC02)', () => {
  let service: CareerPathService;
  // Replies for the first account are held back until the test releases them.
  let release: (() => void)[];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    release = [];
    const fetch = (url: string, init: RequestInit) => {
      const first = (init.headers as Record<string, string>)['authorization'] === 'Bearer token-a';
      const reply = () => json(init.method === 'PUT' ? { selection: { pathId: 'a-path', revision: 1, selectedAt: '' } }
        : url === '/career-paths' ? [path(first ? 'a-path' : 'b-path')] : { selection: null });
      return first ? new Promise<Response>((resolve) => release.push(() => resolve(reply()))) : Promise.resolve(reply());
    };
    TestBed.configureTestingModule({ providers: [
      { provide: ApiClientService, useValue: { fetch } },
      { provide: CourseService, useValue: { loadCourseOutline: async () => { throw new Error('not needed'); } } },
      { provide: LearningProgressService, useValue: { forContent: () => ({ percent: 0 }) } },
    ] });
    service = TestBed.inject(CareerPathService);
  });

  async function switchAccountThenRelease(pending: Promise<unknown>): Promise<void> {
    await service.load('token-b', 'b@example.test');
    release.forEach((send) => send());
    await pending;
  }

  it('a late list reply for the old account does not replace the new account\'s paths', async () => {
    await switchAccountThenRelease(service.load('token-a', 'a@example.test'));
    expect(service.paths().map((item) => item.id)).toEqual(['b-path']);
    expect(service.state()).toBe('ready');
  });

  it('a late save reply for the old account does not become the new account\'s selection', async () => {
    service.token.set('token-a');
    const pending = service.select('a-path');
    await switchAccountThenRelease(pending);
    expect(await pending).toMatchObject({ ok: false });
    expect(service.selection()).toBeNull();
  });
});

describe('milestone guidance shared by Home and the tree (US-L022)', () => {
  it('US-L022-AC01/AC03 counts achieved milestones and names the first ready one, never a percentage', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: ApiClientService, useValue: { fetch: async () => json({}) } },
      { provide: CourseService, useValue: {} },
      { provide: LearningProgressService, useValue: {} },
    ] });
    const service = TestBed.inject(CareerPathService);
    const step = (id: string) => ({ id, title: id, description: '', required: true, courses: [], prerequisiteStepIds: [] });
    service.paths.set([{ ...path('analyst'), schemaVersion: 2, steps: [step('foundation'), step('design'), step('risk')] }]);
    expect(service.milestoneProgress()).toBeNull();
    service.careers.set({ followedPathIds: ['analyst'], focusPathId: 'analyst', achievements: [], satisfiedActionIds: [],
      milestoneStates: { foundation: 'achieved', design: 'locked', risk: 'ready' } });
    expect(service.milestoneProgress()).toEqual({ achieved: 1, total: 3, next: expect.objectContaining({ id: 'risk' }) });
  });
});
