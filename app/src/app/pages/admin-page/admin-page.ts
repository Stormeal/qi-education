import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import {
  FeedbackEntry,
  FeedbackOption,
  FeedbackTriageUpdate,
  StudentSummary,
} from '../../app.models';
import { AdminInstructorProfile, InstructorProfileService } from '../../services/instructor-profile.service';
import { CareerPathEditor } from '../../ui/career-path-editor/career-path-editor';
import { AppButton } from '../../ui/app-button/app-button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

type FeedbackPriority = 'low' | 'medium' | 'high';
type FeedbackWorkStatus = 'work' | 'completed' | 'wont-do';
type FeedbackTab = 'current' | 'archived';
type AdminSection = 'feedback' | 'career-paths' | 'instructors';
const SECTION_KEY = 'qi-education:admin-section';

function storedSection(): AdminSection {
  try {
    const stored = window.sessionStorage.getItem(SECTION_KEY);
    return stored === 'career-paths' || stored === 'instructors' ? stored : 'feedback';
  }
  catch { return 'feedback'; }
}

@Component({
  selector: 'app-admin-page',
  imports: [DatePipe, AppButton, CareerPathEditor, FeedbackDialog, LoadingSkeleton, PageHeader],
  templateUrl: './admin-page.html',
  styleUrls: ['../../app.scss', './admin-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly feedback = input.required<FeedbackEntry[]>();
  readonly feedbackLoading = input.required<boolean>();
  readonly feedbackError = input.required<string>();
  readonly isFeedbackOpen = input.required<boolean>();
  readonly feedbackSubmitted = input.required<boolean>();
  readonly feedbackPage = input.required<string>();
  readonly feedbackRating = input.required<string>();
  readonly feedbackText = input.required<string>();
  readonly feedbackSubmitting = input.required<boolean>();
  readonly feedbackSubmitError = input.required<string>();
  readonly feedbackOptions = input.required<FeedbackOption[]>();

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly libraryClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();
  readonly careerPathClicked = output<void>();
  readonly feedbackReloaded = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  readonly feedbackTriaged = output<FeedbackTriageUpdate>();

  protected readonly workStatusOptions: { value: FeedbackWorkStatus; label: string }[] = [
    { value: 'work', label: 'Mark for work' },
    { value: 'completed', label: 'Completed' },
    { value: 'wont-do', label: "Won't do" },
  ];
  protected readonly priorityOptions: { value: FeedbackPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ];
  // Remembered for the browser tab so a reload returns to the same section.
  protected readonly section = signal<AdminSection>(storedSection());
  private readonly instructorProfiles = inject(InstructorProfileService);
  protected readonly instructors = signal<AdminInstructorProfile[]>([]);
  protected readonly instructorsState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly instructorsMessage = signal('');
  private readonly instructorsLoader = effect(() => {
    if (this.section() === 'instructors' && this.instructorProfiles.token()) void this.loadInstructors();
  });
  protected readonly activeTab = signal<FeedbackTab>('current');
  protected readonly feedbackTotal = computed(() => this.feedback().length);
  protected readonly needsWorkTotal = computed(
    () => this.feedback().filter((item) => item.rating === 'needs-work').length,
  );
  protected readonly activePagesTotal = computed(
    () => new Set(this.feedback().map((item) => item.page)).size,
  );
  protected readonly currentFeedback = computed(() =>
    this.feedback().filter((item) => item.workStatus !== 'completed' && item.workStatus !== 'wont-do'),
  );
  protected readonly archivedFeedback = computed(() =>
    this.feedback().filter((item) => item.workStatus === 'completed' || item.workStatus === 'wont-do'),
  );
  protected readonly visibleFeedback = computed(() =>
    this.activeTab() === 'current' ? this.currentFeedback() : this.archivedFeedback(),
  );

  protected ratingLabel(rating: FeedbackEntry['rating']): string {
    switch (rating) {
      case 'great':
        return 'Great';
      case 'needs-work':
        return 'Bad';
      default:
        return 'Okay';
    }
  }

  protected isSelected(item: FeedbackEntry): boolean {
    return !!item.workStatus;
  }

  protected isCompleted(item: FeedbackEntry): boolean {
    return item.workStatus === 'completed';
  }

  protected isWontDo(item: FeedbackEntry): boolean {
    return item.workStatus === 'wont-do';
  }

  protected selectedStatus(item: FeedbackEntry): FeedbackWorkStatus | null {
    return item.workStatus ?? null;
  }

  protected selectedPriority(item: FeedbackEntry): FeedbackPriority {
    return item.priority ?? 'medium';
  }

  protected async loadInstructors(): Promise<void> {
    this.instructorsState.set('loading');
    const result = await this.instructorProfiles.adminList();
    if (result.ok) this.instructors.set(result.body);
    else this.instructorsMessage.set(result.message);
    this.instructorsState.set(result.ok ? 'ready' : 'error');
  }

  protected async clearInstructor(profile: AdminInstructorProfile): Promise<void> {
    if (!window.confirm(`Clear the public description of ${profile.displayName}? It disappears from their instructor card at once. They can write a new one.`)) return;
    const result = await this.instructorProfiles.adminClear(profile.userId);
    this.instructorsMessage.set(result.ok ? `Cleared the description of ${profile.displayName}.` : `Not cleared. ${result.message}`);
    if (result.ok) this.instructors.update((items) => items.filter((item) => item.userId !== profile.userId));
  }

  protected selectSection(section: AdminSection): void {
    this.section.set(section);
    try { window.sessionStorage.setItem(SECTION_KEY, section); } catch { /* The choice still applies until reload. */ }
  }

  protected selectTab(tab: FeedbackTab): void {
    this.activeTab.set(tab);
  }

  protected activeTabCount(tab: FeedbackTab): number {
    return tab === 'current' ? this.currentFeedback().length : this.archivedFeedback().length;
  }

  protected selectStatus(item: FeedbackEntry, workStatus: FeedbackWorkStatus): void {
    this.feedbackTriaged.emit({
      id: item.id,
      workStatus,
      priority: workStatus === 'work' ? item.priority ?? 'medium' : undefined,
    });
  }

  protected selectPriority(item: FeedbackEntry, priority: FeedbackPriority): void {
    this.feedbackTriaged.emit({
      id: item.id,
      workStatus: item.workStatus ?? 'work',
      priority,
    });
  }

  protected githubIssueLabel(item: FeedbackEntry): string {
    return item.githubIssueNumber ? `Issue #${item.githubIssueNumber}` : 'GitHub issue';
  }
}
