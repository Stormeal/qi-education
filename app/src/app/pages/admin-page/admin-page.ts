import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import {
  FeedbackEntry,
  FeedbackOption,
  FeedbackTriageUpdate,
  StudentSummary,
} from '../../app.models';
import { AdminUser, AdminUserChange, AdminUserRole, AdminUsersService } from '../../services/admin-users.service';
import { ConfirmService } from '../../services/confirm.service';
import { AdminInstructorProfile, InstructorProfileService } from '../../services/instructor-profile.service';
import { CareerPathEditor } from '../../ui/career-path-editor/career-path-editor';
import { Button } from '../../ui/button/button';
import { FeedbackDialog } from '../../ui/feedback-dialog/feedback-dialog';
import { LoadingSkeleton } from '../../ui/loading-skeleton/loading-skeleton';
import { PageHeader } from '../../ui/page-header/page-header';

type FeedbackPriority = 'low' | 'medium' | 'high';
type FeedbackWorkStatus = 'work' | 'completed' | 'wont-do';
type FeedbackTab = 'current' | 'archived';
type AdminSection = 'feedback' | 'career-paths' | 'instructors' | 'users';
const SECTION_KEY = 'qi-education:admin-section';

function storedSection(): AdminSection {
  try {
    const stored = window.sessionStorage.getItem(SECTION_KEY);
    return stored === 'career-paths' || stored === 'instructors' || stored === 'users' ? stored : 'feedback';
  }
  catch { return 'feedback'; }
}

@Component({
  selector: 'app-admin-page',
  imports: [DatePipe, Button, CareerPathEditor, FeedbackDialog, LoadingSkeleton, PageHeader],
  templateUrl: './admin-page.html',
  styleUrls: ['../../app.scss', './admin-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly student = input.required<StudentSummary>();
  readonly userEmail = input.required<string>();
  readonly authToken = input('');
  readonly currentUserId = input('');
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

  // US-A001 user management.
  private readonly adminUsers = inject(AdminUsersService);
  private readonly confirm = inject(ConfirmService);
  protected readonly userRoles: { value: AdminUserRole; label: string }[] = [
    { value: 'student', label: 'Student' }, { value: 'teacher', label: 'Teacher' }, { value: 'admin', label: 'Admin' },
  ];
  protected readonly userSearch = signal('');
  protected readonly users = signal<AdminUser[]>([]);
  protected readonly usersTotal = signal(0);
  protected readonly usersState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly usersMessage = signal('');
  protected readonly usersError = signal('');
  // The one user a role change or reset is running for; its controls are disabled meanwhile.
  protected readonly userBusyId = signal('');
  private usersRequest = 0;
  // US-A001-AC08: who changed whose role or status. A failed load leaves the list as it was.
  protected readonly userChanges = signal<AdminUserChange[]>([]);
  private readonly usersLoader = effect(() => {
    if (this.section() === 'users' && this.authToken()) untracked(() => { void this.searchUsers(); void this.loadUserChanges(); });
  });

  protected async searchUsers(event?: Event): Promise<void> {
    event?.preventDefault();
    const request = ++this.usersRequest;
    this.usersState.set('loading');
    const result = await this.adminUsers.search(this.authToken(), this.userSearch());
    // A slower earlier search must not replace the result of a later one.
    if (request !== this.usersRequest) return;
    if (result.ok) { this.users.set(result.body.users); this.usersTotal.set(result.body.total); this.usersError.set(''); }
    else this.usersError.set(result.message);
    this.usersState.set(result.ok ? 'ready' : 'error');
  }

  private async loadUserChanges(): Promise<void> {
    const result = await this.adminUsers.listChanges(this.authToken());
    if (result.ok) this.userChanges.set(result.body.changes);
  }

  /** "Admin Demo changed the role of Ann from Student to Teacher" */
  protected userChangeText(change: AdminUserChange): string {
    const word = (value: string) => this.userRoles.find((item) => item.value === value)?.label
      ?? (value === 'active' ? 'Active' : value === 'disabled' ? 'Deactivated' : value);
    return `${change.actor.displayName} changed the ${change.field} of ${change.target.displayName} from ${word(change.from)} to ${word(change.to)}`;
  }

  protected async changeUserStatus(user: AdminUser): Promise<void> {
    const deactivate = user.status === 'active';
    const question = deactivate
      ? { title: `Deactivate ${user.displayName}?`, confirmLabel: 'Deactivate',
          message: 'They are logged out and cannot log in until the account is reactivated. Their courses and progress are kept.' }
      : { title: `Reactivate ${user.displayName}?`, confirmLabel: 'Reactivate',
          message: 'They can log in again with their existing password.' };
    if (!await this.confirm.ask(question)) return;
    this.userBusyId.set(user.id);
    const result = await this.adminUsers.changeStatus(this.authToken(), user.id, deactivate ? 'disabled' : 'active');
    this.userBusyId.set('');
    if (result.ok) {
      this.users.update((items) => items.map((item) => item.id === user.id ? result.body : item));
      this.usersError.set('');
      this.usersMessage.set(`${result.body.displayName} is now ${result.body.status === 'active' ? 'active' : 'deactivated'}.`);
      void this.loadUserChanges();
    } else {
      this.usersMessage.set('');
      this.usersError.set(`${user.displayName} was not ${deactivate ? 'deactivated' : 'reactivated'}. ${result.message}`);
    }
  }

  protected async changeUserRole(user: AdminUser, event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const role = select.value as AdminUserRole;
    const label = (value: string) => this.userRoles.find((item) => item.value === value)?.label ?? value;
    if (role === user.role) return;
    if (!await this.confirm.ask({ title: `Change ${user.displayName} from ${label(user.role)} to ${label(role)}?`,
      message: 'It applies the next time they do something on the site.', confirmLabel: 'Change role' })) {
      select.value = user.role;
      return;
    }
    this.userBusyId.set(user.id);
    const result = await this.adminUsers.changeRole(this.authToken(), user.id, role);
    this.userBusyId.set('');
    if (result.ok) {
      this.users.update((items) => items.map((item) => item.id === user.id ? result.body : item));
      this.usersError.set('');
      this.usersMessage.set(`${result.body.displayName} is now ${label(result.body.role)}.`);
      void this.loadUserChanges();
    } else {
      select.value = user.role;
      this.usersMessage.set('');
      this.usersError.set(`The role of ${user.displayName} was not changed. ${result.message}`);
    }
  }

  protected async sendUserPasswordReset(user: AdminUser): Promise<void> {
    if (!await this.confirm.ask({ title: `Send a password reset link to ${user.email}?`,
      message: 'Their current password keeps working until they use the link.', confirmLabel: 'Send link' })) return;
    this.userBusyId.set(user.id);
    const result = await this.adminUsers.sendPasswordReset(this.authToken(), user.id);
    this.userBusyId.set('');
    this.usersMessage.set(result.ok ? result.body.message : '');
    this.usersError.set(result.ok ? '' : `No reset link was sent to ${user.email}. ${result.message}`);
  }

  protected async loadInstructors(): Promise<void> {
    this.instructorsState.set('loading');
    const result = await this.instructorProfiles.adminList();
    if (result.ok) this.instructors.set(result.body);
    else this.instructorsMessage.set(result.message);
    this.instructorsState.set(result.ok ? 'ready' : 'error');
  }

  protected async clearInstructor(profile: AdminInstructorProfile): Promise<void> {
    if (!await this.confirm.ask({ title: `Clear the public description of ${profile.displayName}?`,
      message: 'It disappears from their instructor card at once. They can write a new one.', confirmLabel: 'Clear' })) return;
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
