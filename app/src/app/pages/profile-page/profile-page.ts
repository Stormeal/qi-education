import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PrivacyService, type PrivacyBlockingOrganization, type PrivacyExport } from '../../services/privacy.service';
import { CoursePurchase, ProfileService } from '../../services/profile.service';
import { FeedbackOption, type NotificationPreferences } from '../../app.models';
import { Button } from '../../ui/button/button';
import { Chip } from '../../ui/chip/chip';
import { PageHeader } from '../../ui/page-header/page-header';
import { TabItem, Tabs, tabId, tabPanelId } from '../../ui/tabs/tabs';
import { CookieLink } from '../../ui/cookie-consent/cookie-consent';

const BIO_MAX_LENGTH = 280;
const GOALS_MAX_LENGTH = 280;

@Component({
  selector: 'app-profile-page',
  imports: [Button, Chip, DatePipe, PageHeader, RouterLink, Tabs, CookieLink],
  templateUrl: './profile-page.html',
  styleUrls: ['../../app.scss', './profile-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly displayName = input.required<string>();
  readonly email = input.required<string>();
  readonly roleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly memberSince = input.required<string>();
  readonly enrolledCount = input.required<number>();
  readonly avatarColor = input.required<string>();
  readonly avatarColorOptions = input.required<readonly string[]>();
  readonly bio = input.required<string>();
  readonly jobTitle = input.required<string>();
  readonly company = input.required<string>();
  readonly learningGoals = input.required<string>();
  readonly profileSaving = input.required<boolean>();
  readonly profileSaved = input.required<boolean>();
  readonly bioPublic = input(false);
  readonly authToken = input('');
  readonly initialTab = input('details');
  readonly notificationPrefs = input<NotificationPreferences>({ reviewActivity: true, organization: true, adminInbox: true });
  readonly notificationPrefsChanged = output<NotificationPreferences>();
  protected readonly notificationGroups = computed(() => [
    { key: 'organization' as const, label: 'Organization', description: 'Invitations, request decisions and people joining your team.' },
    ...(this.roleLabel() !== 'Student' ? [{ key: 'reviewActivity' as const, label: 'Review activity', description: 'Review requests, submissions, requested changes and publication.' }] : []),
    ...(this.canAccessAdmin() ? [{ key: 'adminInbox' as const, label: 'Admin inbox', description: 'New and resubmitted organization requests.' }] : []),
  ]);
  readonly saveError = input('');
  readonly profileDirty = input.required<boolean>();
  readonly isFeedbackOpen = input.required<boolean>();
  readonly feedbackSubmitted = input.required<boolean>();
  readonly feedbackPage = input.required<string>();
  readonly feedbackRating = input.required<string>();
  readonly feedbackText = input.required<string>();
  readonly feedbackSubmitting = input.required<boolean>();
  readonly feedbackError = input.required<string>();
  readonly feedbackOptions = input.required<FeedbackOption[]>();

  readonly homeClicked = output<void>();
  readonly coursesClicked = output<void>();
  readonly libraryClicked = output<void>();
  readonly feedbackOpened = output<void>();
  readonly loggedOut = output<void>();
  readonly adminClicked = output<void>();
  readonly careerPathClicked = output<void>();
  readonly bioChanged = output<string>();
  readonly jobTitleChanged = output<string>();
  readonly companyChanged = output<string>();
  readonly learningGoalsChanged = output<string>();
  readonly avatarColorSelected = output<string>();
  readonly profileSaveClicked = output<void>();
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();

  protected readonly bioMaxLength = BIO_MAX_LENGTH;

  protected readonly tabId = tabId;
  protected readonly tabPanelId = tabPanelId;
  protected readonly tabs: TabItem[] = [
    { id: 'details', label: 'Profile' },
    { id: 'password', label: 'Password' },
    { id: 'purchases', label: 'Purchases' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy & data' },
  ];
  protected readonly activeTab = signal('details');
  constructor() { effect(() => this.activeTab.set(this.initialTab())); }
  protected changePreference(key: keyof NotificationPreferences, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.notificationPrefsChanged.emit({ ...this.notificationPrefs(), [key]: checked });
  }

  protected selectTab(id: string): void {
    this.activeTab.set(id);
    if (id === 'purchases' && this.purchases() === null) void this.loadPurchases();
  }

  // US-L013: the password form is separate from the profile form and keeps its own state.
  private readonly auth = inject(AuthService);
  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly newPasswordRepeat = signal('');
  protected readonly passwordsVisible = signal(false);
  protected readonly passwordBusy = signal(false);
  protected readonly passwordError = signal('');
  protected readonly passwordChanged = signal(false);

  protected async changePassword(event: Event): Promise<void> {
    event.preventDefault();
    if (this.passwordBusy()) return;
    this.passwordChanged.set(false);
    if (this.newPassword() !== this.newPasswordRepeat()) { this.passwordError.set('The two new passwords are not the same.'); return; }
    this.passwordBusy.set(true);
    this.passwordError.set('');
    const result = await this.auth.changePassword(this.authToken(), this.currentPassword(), this.newPassword());
    this.passwordBusy.set(false);
    if (!result.ok) { this.passwordError.set(result.message); return; }
    this.currentPassword.set(''); this.newPassword.set(''); this.newPasswordRepeat.set('');
    this.passwordChanged.set(true);
  }
  // US-L024: purchases are listed here; each receipt and the saved card open on a Stripe page.
  private readonly profiles = inject(ProfileService);
  private assignLocation = (url: string) => window.location.assign(url);
  protected readonly billingBusy = signal(false);
  protected readonly billingMessage = signal('');
  /** Null until the Purchases tab has loaded them. */
  protected readonly purchases = signal<CoursePurchase[] | null>(null);
  protected readonly purchasesError = signal('');
  protected readonly receiptBusy = signal('');

  private async loadPurchases(): Promise<void> {
    this.purchasesError.set('');
    const result = await this.profiles.listPurchases(this.authToken());
    if (result.ok) this.purchases.set(result.purchases);
    else { this.purchases.set([]); this.purchasesError.set(result.message); }
  }

  protected async openReceipt(purchase: CoursePurchase): Promise<void> {
    if (this.receiptBusy()) return;
    this.receiptBusy.set(purchase.id);
    this.billingMessage.set('');
    const result = await this.profiles.receiptUrl(this.authToken(), purchase.id);
    this.receiptBusy.set('');
    if (result.ok) this.assignLocation(result.url);
    else this.billingMessage.set(result.message);
  }

  protected async openBillingPortal(): Promise<void> {
    if (this.billingBusy()) return;
    this.billingBusy.set(true);
    this.billingMessage.set('');
    const result = await this.profiles.openBillingPortal(this.authToken(), `${window.location.origin}${window.location.pathname}`);
    this.billingBusy.set(false);
    if (result.ok) this.assignLocation(result.url);
    else this.billingMessage.set(result.message);
  }
  // US-P021: export (JSON + printable summary) and self-service account deletion.
  private readonly privacy = inject(PrivacyService);
  private saveFile = (name: string, json: string) => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    link.click(); URL.revokeObjectURL(url);
  };
  private print = () => window.print();
  protected readonly exportBusy = signal(false);
  protected readonly exportMessage = signal('');
  protected readonly exportData = signal<PrivacyExport | null>(null);
  protected readonly exportSummary = computed(() => {
    const data = this.exportData() as unknown as Record<string, unknown> | null;
    if (!data) return [];
    const count = (value: unknown, noun: string) => {
      const n = Array.isArray(value) ? value.length : value ? 1 : 0;
      return n === 0 ? 'None' : `${n} ${noun}${n === 1 ? '' : 's'}`;
    };
    const account = (data['account'] ?? {}) as Record<string, string>;
    const careers = (data['careers'] ?? {}) as Record<string, unknown>;
    return [
      { label: 'Name', value: account['displayName'] ?? '' },
      { label: 'Email', value: account['email'] ?? '' },
      { label: 'Role', value: account['role'] ?? '' },
      { label: 'Profile', value: data['profile'] ? 'Saved' : 'None' },
      { label: 'Instructor description', value: data['instructorProfile'] ? 'Saved' : 'None' },
      { label: 'Enrolled courses', value: count(data['enrolments'], 'course') },
      { label: 'Course progress', value: count(data['progress'], 'course') },
      { label: 'Notes', value: count(data['notes'], 'note') },
      { label: 'Lesson feedback', value: count(data['lessonFeedback'], 'item') },
      { label: 'Careers', value: careers['current'] || careers['legacySelection'] ? 'Saved' : 'None' },
      { label: 'Purchases', value: count(data['payments'], 'purchase') },
      { label: 'Organization', value: (data['organizations'] as Record<string, unknown> | null)?.['membership'] ? 'Member' : 'None' },
      { label: 'Feedback sent', value: count(data['feedback'], 'item') },
      { label: 'Notifications', value: count(data['notifications'], 'notification') },
      { label: 'Courses you teach or review', value: count(data['authoring'], 'course') },
    ];
  });

  protected async downloadExport(): Promise<void> {
    if (this.exportBusy()) return;
    this.exportBusy.set(true); this.exportMessage.set('');
    const result = await this.privacy.exportMyData(this.authToken());
    this.exportBusy.set(false);
    if (!result.ok) { this.exportMessage.set(result.message); return; }
    this.exportData.set(result.body);
    this.saveFile(`qi-academy-data-${result.body.exportedAt.slice(0, 10)}.json`, JSON.stringify(result.body, null, 2));
    this.exportMessage.set('Your data was downloaded. A summary is shown below.');
  }
  protected printSummary(): void { this.print(); }

  protected readonly deletePassword = signal('');
  protected readonly deleteConfirmation = signal('');
  protected readonly deleteBusy = signal(false);
  protected readonly deleteError = signal('');
  protected readonly blockingOrganizations = signal<PrivacyBlockingOrganization[]>([]);
  protected readonly accountDeleted = signal(false);
  protected readonly canDelete = computed(() =>
    !this.deleteBusy() && this.deletePassword().length > 0 && this.deleteConfirmation() === 'DELETE');

  protected async deleteAccount(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canDelete()) return;
    this.deleteBusy.set(true); this.deleteError.set(''); this.blockingOrganizations.set([]);
    const result = await this.privacy.eraseMyAccount(this.authToken(), this.deletePassword(), this.deleteConfirmation());
    this.deleteBusy.set(false);
    if (result.ok) { this.deletePassword.set(''); this.accountDeleted.set(true); return; }
    if (result.status === 409 && result.organizations?.length) { this.blockingOrganizations.set(result.organizations); return; }
    this.deleteError.set(result.message);
  }
  protected readonly goalsMaxLength = GOALS_MAX_LENGTH;

  protected readonly initials = computed(() =>
    this.displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.profileSaveClicked.emit();
  }

  protected controlValue(event: Event): string {
    const control = event.target;

    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      return control.value;
    }

    return '';
  }
}
