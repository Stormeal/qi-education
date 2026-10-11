import { TestBed } from '@angular/core/testing';
import { ApiClientService } from './api-client.service';
import { InstructorProfileService } from './instructor-profile.service';

const reply = (value: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status });

describe('US-T007 instructor descriptions', () => {
  let service: InstructorProfileService;
  let calls: { url: string; method: string; authorization?: string; body?: string }[];
  let publicList: unknown;
  let saveStatus: number;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    calls = [];
    publicList = [{ description: 'Twenty years of test automation.', courseIds: ['c1', 'c2'] }];
    saveStatus = 200;
    const fetch = async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, method: init.method ?? 'GET', authorization: headers['authorization'], body: init.body as string | undefined });
      if (url === '/instructors') return reply(publicList);
      if (init.method === 'PUT') return saveStatus === 200 ? reply(JSON.parse(init.body as string)) : reply({ message: 'Too long.' }, saveStatus);
      if (init.method === 'DELETE') return reply(null, 204);
      return reply({ description: 'Mine' });
    };
    TestBed.configureTestingModule({ providers: [{ provide: ApiClientService, useValue: { fetch } }] });
    service = TestBed.inject(InstructorProfileService);
  });

  it('AC01 gives a card the description of whoever owns one of its courses', async () => {
    await service.loadPublic();
    expect(service.descriptionFor(['c2'])).toBe('Twenty years of test automation.');
    expect(calls[0].authorization).toBeUndefined();
  });

  it('AC02 gives no description for other courses or when the list cannot be loaded', async () => {
    await service.loadPublic();
    expect(service.descriptionFor(['other'])).toBe('');
    expect(service.descriptionFor([])).toBe('');
    publicList = { message: 'broken' };
    service.publicProfiles.set([]);
    await service.loadPublic(true);
    expect(service.descriptionFor(['c1'])).toBe('');
  });

  it('loads the public list once per visit and again after the teacher saves', async () => {
    await service.loadPublic();
    await service.loadPublic();
    expect(calls.filter((call) => call.url === '/instructors')).toHaveLength(1);
    service.token.set('teacher-token');
    const saved = await service.saveOwn('New text');
    expect(saved).toEqual({ ok: true, body: { description: 'New text' } });
    expect(calls.find((call) => call.method === 'PUT')?.authorization).toBe('Bearer teacher-token');
    await vi.waitFor(() => expect(calls.filter((call) => call.url === '/instructors')).toHaveLength(2));
  });

  it('reports the API message when a save is refused', async () => {
    saveStatus = 400;
    expect(await service.saveOwn('x')).toEqual({ ok: false, message: 'Too long.' });
  });

  it('clears a description as admin without expecting a body', async () => {
    service.token.set('admin-token');
    expect((await service.adminClear('user 1')).ok).toBe(true);
    expect(calls[0]).toMatchObject({ url: '/admin/instructor-profiles/user%201', method: 'DELETE', authorization: 'Bearer admin-token' });
  });
});
