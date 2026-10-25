import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { FeedbackEntry } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { CourseService, ReviewQueueItem } from '../../services/course.service';
import { OrgRequest, OrganizationService } from '../../services/organization.service';
import { AdminAttention } from './admin-attention';

const course = (n: number): ReviewQueueItem =>
  ({ id: `c${n}`, title: `Course ${n}`, teacher: `Teacher ${n}`, live: n === 1, submittedAt: `2026-10-${10 + n}T10:00:00Z` });
const request = (n: number): OrgRequest => ({ id: `r${n}`, state: 'pending', displayName: `Team ${n}`, companyName: `Company ${n}`,
  cvr: '12345678', billingEmail: 'b@example.test', message: '', declineReason: null, submittedAt: `2026-10-0${n}T10:00:00Z`,
  decidedAt: null, organizationId: null, requesterName: `Requester ${n}` });
const feedback = (n: number, workStatus?: FeedbackEntry['workStatus']): FeedbackEntry => ({ id: `f${n}`, createdAt: `2026-10-${10 + n}T10:00:00Z`,
  userId: 'u', userEmail: 'u@example.test', userRole: 'student', page: `Page ${n}`, rating: 'needs-work', message: `Message ${n}`, workStatus });

describe('AdminAttention (admin Home)', () => {
  let queue: () => Promise<ReviewQueueItem[]>;
  let requests: () => Promise<{ ok: true; body: OrgRequest[] } | { ok: false; status: number; message: string }>;
  let state: { loginState: ReturnType<typeof signal>; adminFeedback: ReturnType<typeof signal<FeedbackEntry[]>>;
    adminFeedbackLoading: ReturnType<typeof signal<boolean>>; adminFeedbackError: ReturnType<typeof signal<string>>;
    loadAdminFeedbackOnce: ReturnType<typeof vi.fn>; reloadAdminFeedback: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    queue = async () => [1, 2, 3, 4, 5, 6].map(course);
    requests = async () => ({ ok: true, body: [request(1), request(2)] });
    state = { loginState: signal({ token: 'token' }), adminFeedback: signal([feedback(1), feedback(2, 'completed'), feedback(3)]),
      adminFeedbackLoading: signal(false), adminFeedbackError: signal(''), loadAdminFeedbackOnce: vi.fn(), reloadAdminFeedback: vi.fn() };
    TestBed.configureTestingModule({ imports: [AdminAttention], providers: [provideRouter([]),
      { provide: AppStateService, useValue: state },
      { provide: CourseService, useValue: { adminReviewQueue: () => queue() } },
      { provide: OrganizationService, useValue: { adminRequests: () => requests() } }] });
  });
  afterEach(() => vi.restoreAllMocks());

  async function render() {
    const fixture = TestBed.createComponent(AdminAttention);
    fixture.detectChanges();
    for (let i = 0; i < 3; i++) { await new Promise((resolve) => setTimeout(resolve)); fixture.detectChanges(); }
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }
  const card = (page: HTMLElement, title: string) => [...page.querySelectorAll<HTMLElement>('.aa-card')].find((c) => c.querySelector('h2')?.textContent?.includes(title))!;
  const items = (element: HTMLElement) => [...element.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim());

  it('shows each source with its count and newest items first, five at most', async () => {
    const { page } = await render();
    const reviews = card(page, 'Courses waiting for review');
    expect(reviews.querySelector('.aa-count')?.textContent?.trim()).toBe('6');
    expect(items(reviews)).toHaveLength(5);
    expect(items(reviews)[0]).toContain('Course 6');
    expect(reviews.querySelector('a[href="/courses/c6/edit"]')).not.toBeNull();
    expect(items(card(page, 'Organization requests'))[0]).toContain('Team 2');
    expect(items(card(page, 'Organization requests'))[0]).toContain('Requester 2');
    const feedbackItems = items(card(page, 'New feedback'));
    expect(feedbackItems).toHaveLength(2);
    expect(feedbackItems[0]).toContain('Page 3');
    expect(state.loadAdminFeedbackOnce).toHaveBeenCalled();
  });

  it('shows every waiting course when asked', async () => {
    const { fixture, page } = await render();
    [...card(page, 'Courses waiting for review').querySelectorAll('button')].find((b) => b.textContent?.includes('Show all'))!.click();
    fixture.detectChanges();
    expect(items(card(page, 'Courses waiting for review'))).toHaveLength(6);
  });

  it('opens the matching Admin tab', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const { page } = await render();
    [...card(page, 'Organization requests').querySelectorAll('button')].find((b) => b.textContent?.includes('Open all'))!.click();
    expect(sessionStorage.getItem('qi-education:admin-section')).toBe('organizations');
    expect(navigate).toHaveBeenCalledWith('/admin');
    [...card(page, 'New feedback').querySelectorAll('button')].find((b) => b.textContent?.includes('Open all'))!.click();
    expect(sessionStorage.getItem('qi-education:admin-section')).toBe('feedback');
  });

  it('says when nothing is waiting', async () => {
    queue = async () => [];
    const { page } = await render();
    expect(card(page, 'Courses waiting for review').textContent).toContain('Nothing waiting');
  });

  it('keeps the other cards when one source fails, and retries it', async () => {
    requests = async () => ({ ok: false, status: 503, message: 'Store unavailable.' });
    state.adminFeedbackError.set('Feedback could not load.');
    const { fixture, page } = await render();
    expect(card(page, 'Organization requests').textContent).toContain('Store unavailable.');
    expect(items(card(page, 'Courses waiting for review'))).toHaveLength(5);
    requests = async () => ({ ok: true, body: [request(1)] });
    [...card(page, 'Organization requests').querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!.click();
    for (let i = 0; i < 3; i++) { await new Promise((resolve) => setTimeout(resolve)); fixture.detectChanges(); }
    expect(items(card(page, 'Organization requests'))[0]).toContain('Team 1');
    [...card(page, 'New feedback').querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!.click();
    expect(state.reloadAdminFeedback).toHaveBeenCalled();
  });
});
