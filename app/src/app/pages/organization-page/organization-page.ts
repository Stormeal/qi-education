import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { FeedbackOption } from '../../app.models';
import { CareerPathService } from '../../services/career-path.service';
import { ConfirmService } from '../../services/confirm.service';
import {
  OrganizationService, type CourseRequest, type Invitation, type Member, type MyOrganization, type OrgRequest,
  type OrgRequestInput, type Prices,
} from '../../services/organization.service';
import { Button } from '../../ui/button/button';
import { PageHeader } from '../../ui/page-header/page-header';

type CourseRef = { id: string; title: string };
const emptyForm = (): OrgRequestInput => ({ displayName: '', companyName: '', cvr: '', billingEmail: '', message: '' });

/** US-O001 release 1: request an organization, or work in one as a member or owner. */
@Component({
  selector: 'app-organization-page',
  imports: [Button, PageHeader],
  templateUrl: './organization-page.html',
  styleUrls: ['../../app.scss', './organization-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationPage {
  readonly appVersion = input.required<string>();
  readonly currentYear = input.required<number>();
  readonly displayName = input.required<string>();
  readonly userEmail = input.required<string>();
  readonly userRoleLabel = input.required<string>();
  readonly canAccessAdmin = input.required<boolean>();
  readonly authToken = input.required<string>();
  readonly userId = input.required<string>();
  readonly courses = input.required<CourseRef[]>();
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
  readonly feedbackClosed = output<void>();
  readonly feedbackRatingSelected = output<string>();
  readonly feedbackTextChanged = output<string>();
  readonly feedbackSubmittedClicked = output<void>();
  /** Fired after joining, leaving or a career change, so the app reloads course access. */
  readonly organizationChanged = output<void>();

  private readonly organizations = inject(OrganizationService);
  private readonly careerPaths = inject(CareerPathService);
  private readonly confirm = inject(ConfirmService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly membership = signal<MyOrganization | null>(null);
  protected readonly request = signal<OrgRequest | null>(null);
  protected readonly pendingInvitation = signal(false);
  protected readonly members = signal<Member[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly courseRequests = signal<CourseRequest[]>([]);
  protected readonly prices = signal<Prices>({ careers: {}, courses: {} });

  protected readonly form = signal<OrgRequestInput>(emptyForm());
  protected readonly editing = signal(false);
  protected readonly formErrors = signal<Partial<Record<keyof OrgRequestInput, string>>>({});
  protected readonly inviteEmail = signal('');
  protected readonly requestCourseId = signal('');
  protected readonly busy = signal(false);
  protected readonly actionError = signal('');
  protected readonly notice = signal('');

  protected readonly isOwner = computed(() => this.membership()?.role === 'owner');
  protected readonly careers = computed(() => this.careerPaths.paths());
  protected readonly courseTitle = (id: string) => this.courses().find((course) => course.id === id)?.title ?? 'Course no longer available';
  protected readonly careerTitle = (id: string | null) => this.careers().find((path) => path.id === id)?.title ?? '';
  protected readonly openCourses = computed(() => (this.membership()?.openCourseIds ?? []).map((id) => ({ id, title: this.courseTitle(id) })));
  protected readonly requestableCourses = computed(() => {
    const open = new Set(this.membership()?.openCourseIds ?? []);
    const asked = new Set((this.membership()?.courseRequests ?? []).filter((r) => r.state === 'pending').map((r) => r.courseId));
    return this.courses().filter((course) => !open.has(course.id) && !asked.has(course.id));
  });
  protected readonly pendingCourseRequests = computed(() => this.courseRequests().filter((r) => r.state === 'pending'));
  protected readonly showForm = computed(() => !this.membership() && (!this.request() || this.editing()));

  constructor() {
    effect(() => {
      const token = this.authToken();
      if (token) untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    const token = this.authToken();
    const result = await this.organizations.mine(token);
    if (!result.ok) { this.loadError.set(result.message); this.state.set('error'); return; }
    if (result.body.organization) {
      this.membership.set(result.body as MyOrganization);
      this.request.set(null);
      void this.careerPaths.load(token, this.userEmail());
      const prices = await this.organizations.prices(token);
      if (prices.ok) this.prices.set(prices.body);
      if (this.isOwner()) await this.loadOwnerData();
    } else {
      this.membership.set(null);
      this.request.set(result.body.request);
      this.pendingInvitation.set(result.body.pendingInvitation);
    }
    this.state.set('ready');
  }

  private async loadOwnerData(): Promise<void> {
    const token = this.authToken();
    const orgId = this.membership()!.organization.id;
    const [members, invitations, requests] = await Promise.all([
      this.organizations.members(token, orgId), this.organizations.invitations(token, orgId), this.organizations.courseRequests(token, orgId),
    ]);
    if (members.ok) this.members.set(members.body);
    if (invitations.ok) this.invitations.set(invitations.body);
    if (requests.ok) this.courseRequests.set(requests.body);
  }

  protected updateForm(field: keyof OrgRequestInput, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  protected startCorrection(): void {
    const request = this.request()!;
    this.form.set({ displayName: request.displayName, companyName: request.companyName, cvr: request.cvr,
      billingEmail: request.billingEmail, message: request.message });
    this.editing.set(true);
  }

  protected async submitRequest(event: Event): Promise<void> {
    event.preventDefault();
    const form = { ...this.form(), displayName: this.form().displayName.trim(), companyName: this.form().companyName.trim(),
      cvr: this.form().cvr.trim(), billingEmail: this.form().billingEmail.trim() };
    const errors: Partial<Record<keyof OrgRequestInput, string>> = {};
    if (!form.displayName) errors.displayName = 'Enter the organization name.';
    if (!form.companyName) errors.companyName = 'Enter the company name.';
    if (!/^\d{8}$/.test(form.cvr)) errors.cvr = 'Enter the 8-digit CVR number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.billingEmail)) errors.billingEmail = 'Enter an email address for billing.';
    this.formErrors.set(errors);
    if (Object.keys(errors).length) {
      queueMicrotask(() => document.getElementById(`org-${Object.keys(errors)[0]}`)?.focus());
      return;
    }
    await this.run(async () => {
      const result = this.request()?.state === 'declined'
        ? await this.organizations.resubmitRequest(this.authToken(), form)
        : await this.organizations.submitRequest(this.authToken(), form);
      if (!result.ok) return result.message;
      this.request.set(result.body);
      this.editing.set(false);
      this.form.set(emptyForm());
      return '';
    });
  }

  protected async leave(): Promise<void> {
    const name = this.membership()!.organization.displayName;
    if (!await this.confirm.ask({ title: `Leave ${name}?`, confirmLabel: 'Leave organization',
      message: 'You keep your account, your progress and courses you enrolled in yourself. Courses from the organization close.' })) return;
    await this.run(async () => {
      const result = await this.organizations.leave(this.authToken());
      if (!result.ok) return result.message;
      this.organizationChanged.emit();
      await this.load();
      return '';
    });
  }

  protected async invite(event: Event): Promise<void> {
    event.preventDefault();
    const email = this.inviteEmail().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { this.actionError.set('Enter an email address to invite.'); return; }
    await this.ownerAction(async (token, orgId) => {
      const result = await this.organizations.invite(token, orgId, email);
      if (result.ok) { this.inviteEmail.set(''); this.notice.set(result.body.state === 'sent' ? `Invitation sent to ${email}.` : ''); }
      return result;
    });
  }

  protected resend(invitation: Invitation): Promise<void> {
    return this.ownerAction((token, orgId) => this.organizations.resendInvitation(token, orgId, invitation.id));
  }

  protected cancel(invitation: Invitation): Promise<void> {
    return this.ownerAction((token, orgId) => this.organizations.cancelInvitation(token, orgId, invitation.id));
  }

  protected setCareer(member: Member, careerId: string): Promise<void> {
    return this.ownerAction((token, orgId) => this.organizations.setCareer(token, orgId, member.userId, careerId || null), true);
  }

  protected async remove(member: Member): Promise<void> {
    if (!await this.confirm.ask({ title: `Remove ${member.name}?`, confirmLabel: 'Remove member',
      message: 'They keep their account and own courses. Courses from the organization close for them.' })) return;
    await this.ownerAction((token, orgId) => this.organizations.removeMember(token, orgId, member.userId));
  }

  protected promote(member: Member): Promise<void> {
    return this.ownerAction((token, orgId) => this.organizations.promote(token, orgId, member.userId));
  }

  protected decide(request: CourseRequest, action: 'approve' | 'decline'): Promise<void> {
    return this.ownerAction((token, orgId) => this.organizations.decideCourseRequest(token, orgId, request.id, action));
  }

  protected async requestCourse(): Promise<void> {
    const courseId = this.requestCourseId();
    if (!courseId) { this.actionError.set('Choose a course to request.'); return; }
    await this.run(async () => {
      const result = await this.organizations.requestCourse(this.authToken(), this.membership()!.organization.id, courseId);
      if (!result.ok) return result.message;
      this.requestCourseId.set('');
      this.notice.set(`Requested ${this.courseTitle(courseId)}. An owner will approve or decline it.`);
      await this.load();
      return '';
    });
  }

  protected careerOptionLabel(pathId: string, title: string): string {
    const price = this.prices().careers[pathId];
    return price == null ? title : `${title} (${price} DKK per month)`;
  }

  protected priceLabel(price: number | null | undefined): string {
    return price == null ? 'No price set' : `${price} DKK per month`;
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  private async ownerAction(action: (token: string, orgId: string) => Promise<{ ok: boolean; message?: string }>, changesAccess = false): Promise<void> {
    await this.run(async () => {
      const result = await action(this.authToken(), this.membership()!.organization.id);
      if (!result.ok) return result.message ?? 'The change could not be saved.';
      if (changesAccess) this.organizationChanged.emit();
      await this.load();
      return '';
    });
  }

  private async run(action: () => Promise<string>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    this.notice.set('');
    try { this.actionError.set(await action()); }
    finally { this.busy.set(false); }
  }
}
