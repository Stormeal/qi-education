import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FeedbackEntry, feedbackType } from '../../app.models';
import { AppStateService } from '../../services/app-state.service';
import { CourseService, ReviewQueueItem } from '../../services/course.service';
import { OrgRequest, OrganizationService } from '../../services/organization.service';
import { Button } from '../button/button';

const SHOWN = 5;
// The Admin page remembers its tab here (admin-page.ts); setting it first opens the right tab.
const ADMIN_SECTION_KEY = 'qi-education:admin-section';
const TYPE_LABEL = { feedback: 'Feedback', defect: 'Defect', 'change-request': 'Change request' };

/** Admin Home: what waits for an admin. Each source loads and fails on its own. */
@Component({
  selector: 'app-admin-attention',
  imports: [Button, DatePipe, RouterLink],
  templateUrl: './admin-attention.html',
  styleUrl: './admin-attention.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAttention {
  protected readonly state = inject(AppStateService);
  private readonly courses = inject(CourseService);
  private readonly organizations = inject(OrganizationService);
  private readonly router = inject(Router);
  protected readonly shown = SHOWN;
  protected feedbackLabel(item: FeedbackEntry): string { return TYPE_LABEL[feedbackType(item)]; }

  protected readonly queue = signal<ReviewQueueItem[] | null>(null);
  protected readonly queueError = signal('');
  protected readonly allCourses = signal(false);
  protected readonly requests = signal<OrgRequest[] | null>(null);
  protected readonly requestsError = signal('');
  protected readonly newFeedback = computed(() => this.state.adminFeedback()
    .filter((entry) => !entry.workStatus)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

  constructor() {
    void this.loadQueue();
    void this.loadRequests();
    this.state.loadAdminFeedbackOnce();
  }

  protected async loadQueue(): Promise<void> {
    const token = this.state.loginState()?.token;
    if (!token) return;
    this.queueError.set('');
    this.queue.set(null);
    try { this.queue.set((await this.courses.adminReviewQueue(token)).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))); }
    catch (error) { this.queueError.set(error instanceof Error ? error.message : 'Unable to load the review queue.'); }
  }

  protected async loadRequests(): Promise<void> {
    const token = this.state.loginState()?.token;
    if (!token) return;
    this.requestsError.set('');
    this.requests.set(null);
    const result = await this.organizations.adminRequests(token);
    if (result.ok) this.requests.set([...result.body].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
    else this.requestsError.set(result.message);
  }

  protected openAdmin(section: 'organizations' | 'feedback'): void {
    try { sessionStorage.setItem(ADMIN_SECTION_KEY, section); } catch { /* storage blocked: Admin opens on its default tab */ }
    void this.router.navigateByUrl('/admin');
  }
}
