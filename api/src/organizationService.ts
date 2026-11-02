import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AuthUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { MailSender } from './mailSender.js';
import type { CareerPathRepository } from './careerPathRepository.js';
import type { CourseRepository } from './courseRepository.js';
import type { OrganizationRepository } from './organizationRepository.js';
import { apiConfig } from './config.js';
import { KeyedSerialQueue } from './keyedSerialQueue.js';
import { assertBillingLineLimit, billingState, billingView, desiredBillingLines, emptyBilling,
  type BillingAddress, type OrganizationBilling } from './organizationBilling.js';
import type { BillingEvent, OrganizationBillingService } from './organizationBillingService.js';
import { safelyNotify, type NotificationService } from './notificationService.js';
import { resetTokenHash } from './passwordResetDelivery.js';
import { OrganizationError, organizationRequestInputSchema, declineSchema, priceSchema, inviteSchema,
  type OrgRequest, type MyOrganization, type StoredOrgRequest, type Organization, type StoredInvitation, type Invitation,
  type Member, type OrganizationMembership, type StoredCourseRequest, type CourseRequest, type Prices } from './organization.js';

type User = Pick<AuthUser, 'id' | 'email' | 'displayName'>;
export type OrganizationOptions = { now?: () => number; newToken?: () => string; appPublicUrl?: string };
export class OrganizationService {
  private readonly billingWrites = new KeyedSerialQueue();
  private readonly repository: OrganizationRepository;
  private readonly auth: AuthRepository;
  private readonly sender: MailSender;
  private readonly now: () => number;
  constructor(private readonly dependencies: { repository: OrganizationRepository; auth: AuthRepository;
    sender: MailSender; options?: OrganizationOptions; careers?: CareerPathRepository; courses?: CourseRepository;
    notifications?: NotificationService; billingService?: OrganizationBillingService | null;
    withUserMutation?: <T>(userId: string, operation: () => Promise<T>) => Promise<T> }) {
    this.repository = dependencies.repository; this.auth = dependencies.auth; this.sender = dependencies.sender;
    this.now = dependencies.options?.now ?? Date.now;
  }
  private parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new OrganizationError(400, 'Invalid organization details');
    return result.data;
  }
  private requestView({ userId: _userId, ...value }: StoredOrgRequest): OrgRequest { return value; }
  private async mail(to: string, subject: string, text: string): Promise<boolean> {
    try { if (!this.sender.available) return false; await this.sender.send({ to, subject, text }); return true; }
    catch { return false; }
  }
  private async account(id: string) {
    const user = await this.auth.findById(id, { fresh: true });
    if (!user || user.status !== 'active') throw new OrganizationError(403, 'Not allowed');
    return user;
  }
  private withTargetMutation<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const admitted = async () => { await this.account(userId); return operation(); };
    return this.dependencies.withUserMutation ? this.dependencies.withUserMutation(userId, admitted) : admitted();
  }
  async submitRequest(user: User, input: unknown): Promise<OrgRequest> {
    const fields = this.parse(organizationRequestInputSchema, input);
    if (await this.repository.getMembership(user.id)) throw new OrganizationError(409, 'Already in an organization');
    const value: StoredOrgRequest = { ...fields, id: randomUUID(), userId: user.id, state: 'pending',
      submittedAt: new Date(this.now()).toISOString(), decidedAt: null, declineReason: null, organizationId: null };
    await this.repository.createRequest(value);
    await this.notifyAdmins(value);
    return this.requestView(value);
  }
  private async notifyAdmins(value: StoredOrgRequest) {
    await safelyNotify(async () => this.dependencies.notifications?.notifyAdmins({ type: 'org-request-received',
      title: `Organization requested: ${value.displayName}`, link: '/admin' }));
    for (const user of (await this.auth.listUsers({ fresh: true })).filter(v => v.role === 'admin' && v.status === 'active')) {
      await this.mail(user.email, `New organization request: ${value.displayName}`, `${value.displayName} has requested an organization. ${value.message}`);
    }
  }
  async resubmitRequest(user: User, input: unknown): Promise<OrgRequest> {
    const fields = this.parse(organizationRequestInputSchema, input), current = await this.repository.findPendingOrLatestRequest(user.id);
    if (await this.repository.getMembership(user.id) || !current || current.state !== 'declined') throw new OrganizationError(409, 'Only a declined request can be resubmitted');
    const patch = { ...fields, state: 'pending' as const, submittedAt: new Date(this.now()).toISOString(), decidedAt: null, declineReason: null };
    if (!await this.repository.updateRequest(current.id, 'declined', patch)) throw new OrganizationError(409, 'Request is no longer declined');
    const next = { ...current, ...patch }; await this.notifyAdmins(next); return this.requestView(next);
  }
  async myOrganization(userId: string): Promise<MyOrganization | { organization: null; request: OrgRequest | null; pendingInvitation: boolean }> {
    const membership = await this.repository.getMembership(userId);
    if (!membership || membership.state !== 'active') {
      const request = await this.repository.findPendingOrLatestRequest(userId);
      const user = await this.account(userId);
      const invited = (await this.repository.listInvitations()).some(v => v.email === user.email &&
        ['sent', 'not-sent'].includes(v.state) && Date.parse(v.expiresAt) > this.now());
      return { organization: null, request: request ? this.requestView(request) : null,
        pendingInvitation: membership?.state === 'pending-email' || invited };
    }
    const organization = await this.organization(membership.orgId), prices = await this.prices();
    const openCourseIds = await this.openCourseIds(userId), started = new Set(membership.startedCourseIds);
    return { organization: this.publicOrganization(organization), billingState: billingState(organization.billing, this.now()), role: membership.role, isOriginalOwner: organization.originalOwnerId === userId,
      careerId: membership.careerId, seatPriceDkk: membership.careerId ? prices.careers[membership.careerId] ?? null : null,
      openCourseIds, startedCourseIds: openCourseIds.filter(id => started.has(id)),
      courseRequests: await Promise.all((await this.repository.listCourseRequests(organization.id))
        .filter(v => v.userId === userId).map(v => this.courseRequestView(v, prices))) };
  }
  async listRequests(state = 'pending') {
    return Promise.all((await this.repository.listRequests(state)).map(async value => {
      const user = await this.auth.findById(value.userId, { fresh: true });
      return { ...this.requestView(value), requesterName: user?.displayName ?? '', requesterEmail: user?.email ?? '' };
    }));
  }
  async decide(adminId: string, requestId: string, decision: { action: string; reason?: string; billing?: 'paid' | 'free' }): Promise<OrgRequest> {
    if ((await this.account(adminId)).role !== 'admin') throw new OrganizationError(403, 'Not allowed');
    if (!['approve', 'decline'].includes(decision.action)) throw new OrganizationError(400, 'Invalid decision');
    const reason = decision.action === 'decline' ? this.parse(declineSchema, decision).reason : null;
    const target = (await this.repository.listRequests()).find(value => value.id === requestId);
    if (!target) throw new OrganizationError(404, 'Request not found');
    return this.withTargetMutation(target.userId, () => this.repository.withOrganizationLock(`request:${requestId}`, async () => {
      const request = (await this.repository.listRequests()).find(v => v.id === requestId);
      if (!request) throw new OrganizationError(404, 'Request not found');
      if (request.state !== 'pending') throw new OrganizationError(409, 'Request is no longer pending');
      const membership = await this.repository.getMembership(request.userId);
      if (membership && !(decision.action === 'approve' && membership.orgId === request.id && membership.role === 'owner')) throw new OrganizationError(409, 'Requester already joined an organization');
      const user = await this.account(request.userId), time = new Date(this.now()).toISOString();
      let organizationId: string | null = null;
      if (decision.action === 'approve') {
        // Reconcile an interrupted approval using its stable organization identity.
        organizationId = request.id;
        const existing = await this.repository.getOrganization(organizationId);
        if (existing && existing.originalOwnerId !== user.id) throw new OrganizationError(409, 'Organization already exists');
        if (!existing) await this.repository.createOrganization({ id: organizationId, displayName: request.displayName,
          companyName: request.companyName, cvr: request.cvr, billingEmail: request.billingEmail,
          state: 'active', originalOwnerId: user.id, createdAt: time, billing: emptyBilling(decision.billing ?? 'paid') });
        if (!membership && !await this.repository.insertMembership({ userId: user.id, orgId: organizationId, role: 'owner', state: 'active',
          careerId: null, startedCourseIds: [], joinedAt: time, consentAt: time })) {
          await this.repository.deleteOrganization(organizationId);
          throw new OrganizationError(409, 'Requester already joined an organization');
        }
      }
      const patch = { state: decision.action === 'approve' ? 'approved' as const : 'declined' as const,
        decidedAt: time, declineReason: reason, organizationId };
      if (!await this.repository.updateRequest(requestId, 'pending', patch)) {
        throw new OrganizationError(409, 'Request is no longer pending');
      }
      await this.mail(user.email, `Organization request ${patch.state}`, reason ?? `Your organization ${request.displayName} is approved.`);
      await safelyNotify(async () => this.dependencies.notifications?.notify({ recipientUserId: user.id,
        type: patch.state === 'approved' ? 'org-request-approved' : 'org-request-declined',
        title: `Organization request ${patch.state}: ${request.displayName}`, link: '/organization' }));
      return this.requestView({ ...request, ...patch });
    }));
  }
  private async organization(id: string): Promise<Organization> {
    const organization = await this.repository.getOrganization(id);
    if (!organization) throw new OrganizationError(404, 'Organization not found');
    return organization;
  }
  async listOrganizations() {
    return Promise.all((await this.repository.listOrganizations()).map(async value => ({ ...this.publicOrganization(value), billingState: billingState(value.billing, this.now()),
      memberCount: (await this.repository.listMembers(value.id)).filter(v => v.state === 'active').length })));
  }
  private async state(id: string, state: Organization['state']) {
    await this.organization(id);
    if (!await this.repository.setOrganizationState(id, state)) throw new OrganizationError(404, 'Organization not found');
    return this.publicOrganization(await this.organization(id));
  }
  suspend(id: string) { return this.state(id, 'suspended'); }
  reactivate(id: string) { return this.state(id, 'active'); }
  prices() { return this.repository.getPrices(); }
  async setCareerPrice(id: string, priceDkk: unknown) { const value = this.parse(priceSchema, { priceDkk }); return this.changePrice(() => this.repository.setCareerPrice(id, value.priceDkk)); }
  async setCoursePrice(id: string, priceDkk: unknown) { const value = this.parse(priceSchema, { priceDkk }); return this.changePrice(() => this.repository.setCoursePrice(id, value.priceDkk)); }

  private publicOrganization({ billing: _billing, ...org }: Organization): Organization { return org; }
  private provider(): OrganizationBillingService {
    if (!this.dependencies.billingService) throw new OrganizationError(503, 'Billing is temporarily unavailable.');
    return this.dependencies.billingService;
  }
  private withBillingWrite<T>(orgId: string, operation: () => Promise<T>): Promise<T> {
    // Separate durable ownership serializes provider writes across API instances.
    // Membership/price commits continue using their short organization lock.
    return this.billingWrites.run(orgId, () => this.repository.withOrganizationLock(`billing:${orgId}`, operation));
  }
  private async billingCall<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) { if (error instanceof OrganizationError) throw error; throw new OrganizationError(503, 'Billing is temporarily unavailable.'); }
  }
  private async saveBilling(orgId: string, billing: OrganizationBilling) {
    if (!await this.repository.setBilling(orgId, billing)) throw new OrganizationError(404, 'Organization not found');
  }
  private async desiredLines(orgId: string, overrides?: { member?: OrganizationMembership; request?: StoredCourseRequest }) {
    const [members, requests, prices, paths, courses] = await Promise.all([this.repository.listMembers(orgId), this.repository.listCourseRequests(orgId),
      this.prices(), this.dependencies.careers?.listPaths() ?? [], this.dependencies.courses?.listCourses() ?? []]);
    const careers = paths.filter(path => path.published).map(path => ({ id: path._id, title: path.published!.title,
      courseIds: path.published!.steps.flatMap(step => [...step.courses.map(course => course.courseId), ...step.actions.filter(action => action.kind === 'course').map(action => action.courseId)]).filter((id): id is string => !!id) }));
    return desiredBillingLines(overrides?.member ? members.map(member => member.userId === overrides.member!.userId ? overrides.member! : member) : members,
      overrides?.request ? requests.map(request => request.id === overrides.request!.id ? overrides.request! : request) : requests,
      prices, careers, courses.filter(course => course.status === 'published'));
  }
  // Called inside the short local mutation lock, BEFORE changing the desired state.
  // If a process stops after the membership commit, the next read still knows to sync.
  private async markBillingPending(orgId: string, proration: 'create_prorations' | 'none' = 'create_prorations') {
    await this.finalizeBillingPending(orgId);
    const org = await this.organization(orgId);
    if (!org.billing || org.billing.mode === 'free' || !org.billing.method || billingState(org.billing, this.now()) === 'cancelled') return;
    await this.saveBilling(orgId, { ...org.billing, revision: (org.billing.revision ?? 0) + 1, syncPending: true, syncProration: proration });
  }
  // Capture desired states in order so an outage cannot mix an admin price change
  // (no proration) with a later owner quantity change (proration), or vice versa.
  // A missing capture after an interrupted local write is recovered from storage.
  private async finalizeBillingPending(orgId: string) {
    const billing = (await this.organization(orgId)).billing;
    if (!billing?.syncPending || billing.mode === 'free' || !billing.method) return;
    const revision = billing.revision ?? 0, pendingSyncs = billing.pendingSyncs ?? [];
    if (pendingSyncs.some(step => step.revision === revision)) return;
    await this.saveBilling(orgId, { ...billing, pendingSyncs: [...pendingSyncs,
      { revision, lines: await this.desiredLines(orgId), proration: billing.syncProration ?? 'create_prorations' }] });
  }
  private async changePrice(write: () => Promise<void>) {
    const ids = (await this.repository.listOrganizations()).filter(org => org.billing?.mode === 'paid').map(org => org.id).sort();
    const locked = async (index: number): Promise<void> => {
      if (index < ids.length) return this.repository.withOrganizationLock(ids[index], () => locked(index + 1));
      // A quantity snapshot must see either the old price or an already captured
      // non-prorated new price. Never expose a price write between those steps.
      for (const id of ids) await this.finalizeBillingPending(id);
      await write();
      for (const id of ids) { await this.markBillingPending(id, 'none'); await this.finalizeBillingPending(id); }
    };
    await locked(0);
    for (const id of ids) await this.syncBilling(id);
    return this.prices();
  }
  private async syncBilling(orgId: string) {
    try { await this.withBillingWrite(orgId, () => this.drainBilling(orgId)); }
    catch (error) {
      // Another instance may still be applying billing. The local owner change
      // has committed and remains pending; contention must not report it refused.
      if (!(error instanceof OrganizationError && error.status === 409)) throw error;
    }
  }
  private async drainBilling(orgId: string, throwOnFailure = false) {
    while (true) {
      await this.repository.withOrganizationLock(orgId, () => this.finalizeBillingPending(orgId));
      const org = await this.organization(orgId), billing = org.billing;
      if (!billing?.syncPending || billing.mode === 'free' || !billing.method || billingState(billing, this.now()) === 'cancelled' || !this.dependencies.billingService) return;
      const step = billing.pendingSyncs?.[0];
      if (!step) return;
      let snapshot;
      try {
        assertBillingLineLimit(step.lines);
        snapshot = await this.dependencies.billingService.sync(org, { ...billing, revision: step.revision }, step.lines, step.proration);
      } catch (error) { if (throwOnFailure) throw error; return; }
      await this.repository.withOrganizationLock(orgId, async () => {
        const current = (await this.organization(orgId)).billing!;
        if (current.mode !== 'paid') return;
        const pendingSyncs = (current.pendingSyncs ?? []).filter(item => item.revision !== step.revision);
        const complete = pendingSyncs.length === 0 && current.revision === step.revision;
        await this.saveBilling(orgId, { ...current, ...snapshot, pendingSyncs,
          ...(complete && current.confirmingCardSessionId ? {
            confirmedCardSessionIds: [...new Set([...(current.confirmedCardSessionIds ?? []), current.confirmingCardSessionId])], confirmingCardSessionId: null,
          } : {}),
          syncPending: pendingSyncs.length > 0 || current.revision !== step.revision });
      });
    }
  }
  async getBilling(ownerId: string, orgId: string) {
    await this.owner(ownerId, orgId); await this.syncBilling(orgId);
    const org = await this.organization(orgId);
    return billingView(org.billing, await this.desiredLines(orgId), this.now());
  }
  async setupBilling(ownerId: string, orgId: string, method: 'card' | 'invoice', address: BillingAddress, urls?: { success: string; cancel: string }) {
    await this.owner(ownerId, orgId); const provider = this.provider();
    return this.withBillingWrite(orgId, () => this.billingCall(async () => {
      let org = await this.owner(ownerId, orgId), billing = org.billing ?? emptyBilling('free');
      if (billing.mode === 'free') throw new OrganizationError(409, 'This organization is free of charge.');
      assertBillingLineLimit(await this.desiredLines(orgId));
      const customerId = await provider.ensureCustomer(org, billing, address);
      await this.repository.withOrganizationLock(orgId, async () => {
        org = await this.organization(orgId); billing = org.billing!;
        if (billing.mode === 'free') throw new OrganizationError(409, 'This organization is free of charge.');
        billing = { ...billing, customerId };
        await this.saveBilling(orgId, billing);
      });
      if (method === 'card') return provider.createCardSetup(org, billing, urls!.success, urls!.cancel);
      await this.activateBilling(orgId, 'invoice');
      const current = await this.organization(orgId);
      return billingView(current.billing, await this.desiredLines(orgId), this.now());
    }));
  }
  // Caller holds the provider queue, never an organization storage lock during I/O.
  private async activateBilling(orgId: string, method: 'card' | 'invoice', sessionId?: string) {
    await this.repository.withOrganizationLock(orgId, async () => {
      await this.finalizeBillingPending(orgId);
      const org = await this.organization(orgId), billing = org.billing!;
      if (billing.mode === 'free') throw new OrganizationError(409, 'This organization is free of charge.');
      await this.saveBilling(orgId, { ...billing, method, syncPending: true, syncProration: 'create_prorations',
        confirmingCardSessionId: sessionId ?? null,
        ...(billingState(billing, this.now()) === 'cancelled' ? { status: 'none', endsAt: null, pendingSyncs: [] } : {}), revision: (billing.revision ?? 0) + 1 });
      await this.finalizeBillingPending(orgId);
    });
    await this.drainBilling(orgId, true);
  }
  async confirmBillingCard(ownerId: string, orgId: string, sessionId: string) {
    await this.owner(ownerId, orgId); this.provider();
    return this.withBillingWrite(orgId, () => this.billingCall(async () => {
      const org = await this.owner(ownerId, orgId), billing = org.billing ?? emptyBilling('free');
      if (billing.mode === 'free') throw new OrganizationError(409, 'This organization is free of charge.');
      if (billing.confirmedCardSessionIds?.includes(sessionId)) return billingView(billing, await this.desiredLines(orgId), this.now());
      if (!await this.provider().confirmCard(org, billing, sessionId)) throw new OrganizationError(404, 'Card setup session not found');
      await this.activateBilling(orgId, 'card', sessionId);
      return billingView((await this.organization(orgId)).billing, await this.desiredLines(orgId), this.now());
    }));
  }
  async cancelBilling(ownerId: string, orgId: string, cancel: boolean) {
    await this.owner(ownerId, orgId); const provider = this.provider();
    return this.withBillingWrite(orgId, () => this.billingCall(async () => {
      const org = await this.owner(ownerId, orgId), state = billingState(org.billing, this.now());
      const canResume = org.billing?.status === 'cancelling' && state !== 'cancelled';
      if (cancel ? !['active', 'overdue'].includes(state) : !canResume) throw new OrganizationError(409, 'Billing cancellation cannot be changed in this state.');
      const snapshot = await provider.cancellation(org, org.billing!, cancel);
      await this.repository.withOrganizationLock(orgId, async () => {
        const current = (await this.organization(orgId)).billing!;
        await this.saveBilling(orgId, { ...current, ...snapshot, revision: (current.revision ?? 0) + 1 });
      });
      return billingView((await this.organization(orgId)).billing, await this.desiredLines(orgId), this.now());
    }));
  }
  async billingPortal(ownerId: string, orgId: string, returnUrl: string) {
    const org = await this.owner(ownerId, orgId), provider = this.provider();
    if (!org.billing?.subscriptionId || org.billing.mode === 'free') throw new OrganizationError(409, 'Set up billing first.');
    return this.billingCall(() => provider.portal(org.billing!.customerId!, returnUrl));
  }
  async setFreeBilling(orgId: string, free: boolean) {
    await this.organization(orgId);
    await this.withBillingWrite(orgId, () => this.billingCall(async () => {
      const org = await this.organization(orgId), current = org.billing ?? emptyBilling('free');
      if ((current.mode === 'free') === free) return;
      if (free && current.subscriptionId) await this.provider().cancelNow(current);
      await this.repository.withOrganizationLock(orgId, async () => {
        // Keep the organization customer for later setup and webhook attribution.
        await this.saveBilling(orgId, { ...emptyBilling(free ? 'free' : 'paid'), customerId: current.customerId,
          confirmedCardSessionIds: current.confirmedCardSessionIds, revision: (current.revision ?? 0) + 1 });
      });
    }));
    return (await this.listOrganizations()).find(org => org.id === orgId)!;
  }
  async billingWebhook(event: BillingEvent) {
    if (!event) return;
    const org = (await this.repository.listOrganizations()).find(org => org.billing?.customerId === event.customerId);
    if (!org) return;
    await this.withBillingWrite(org.id, async () => {
      const current = await this.organization(org.id);
      if (current.billing?.mode !== 'paid') return;
      if (event.sessionId && !current.billing.confirmedCardSessionIds?.includes(event.sessionId) &&
        await this.provider().confirmCard(current, current.billing, event.sessionId)) await this.activateBilling(org.id, 'card', event.sessionId);
      const latest = await this.organization(org.id), snapshot = await this.provider().refresh(latest, latest.billing!);
      await this.repository.withOrganizationLock(org.id, async () => {
        const billing = (await this.organization(org.id)).billing!;
        if (billing.mode === 'paid') await this.saveBilling(org.id, { ...billing, ...snapshot });
      });
    });
  }
  private async owner(userId: string, orgId: string, active = false) {
    await this.account(userId);
    const membership = await this.repository.getMembership(userId);
    if (!membership || membership.orgId !== orgId) throw new OrganizationError(404, 'Organization not found');
    if (membership.state !== 'active' || membership.role !== 'owner') throw new OrganizationError(403, 'Not allowed');
    const organization = await this.organization(orgId);
    if (active && organization.state !== 'active') throw new OrganizationError(409, 'Organization is suspended');
    return organization;
  }
  private invitationView({ orgId: _orgId, tokenHash: _hash, acceptedBy: _acceptedBy, joining: _joining, ...invitation }: StoredInvitation): Invitation { return invitation; }
  private async expireInvitations(orgId: string) {
    for (const v of await this.repository.listInvitations(orgId)) {
      if (['sent', 'not-sent'].includes(v.state) && Date.parse(v.expiresAt) <= this.now()) {
        await this.repository.updateInvitation(v.id, v.state, { state: 'expired' }, v.tokenHash);
      }
    }
  }
  private newInvitationToken() {
    const raw = (this.dependencies.options?.newToken ?? (() => randomBytes(32).toString('base64url')))();
    const tokenHash = resetTokenHash(raw);
    if (!tokenHash) throw new Error('Invalid generated invitation token');
    return { raw, tokenHash, expiresAt: new Date(this.now() + 14 * 86400000).toISOString() };
  }
  private async sendInvitation(organization: Organization, invitation: StoredInvitation, raw: string) {
    const url = (this.dependencies.options?.appPublicUrl ?? apiConfig.APP_PUBLIC_URL ?? 'http://localhost:4200').replace(/\/+$/, '');
    const sent = await this.mail(invitation.email, `Join ${organization.displayName}`,
      `Joining shares your career and course progress with ${organization.displayName}\n\n${url}/join-organization#token=${raw}`);
    if (sent) await this.repository.updateInvitation(invitation.id, 'not-sent', { state: 'sent' }, invitation.tokenHash);
    const saved = (await this.repository.listInvitations(organization.id)).find(v => v.id === invitation.id)!;
    return this.invitationView(saved);
  }
  async invite(ownerId: string, orgId: string, email: unknown): Promise<Invitation> {
    await this.owner(ownerId, orgId, true);
    const input = this.parse(inviteSchema, { email });
    const user = await this.auth.findByEmail(input.email, { fresh: true });
    const operation = () => this.repository.withOrganizationLock(orgId, async () => {
      const organization = await this.owner(ownerId, orgId, true);
      if (user && (await this.repository.getMembership(user.id))?.orgId === orgId) throw new OrganizationError(409, 'Already a member');
      await this.expireInvitations(orgId);
      const { raw, ...token } = this.newInvitationToken();
      const invitation: StoredInvitation = { ...token, id: randomUUID(), orgId, email: input.email, state: 'not-sent', createdAt: new Date(this.now()).toISOString() };
      await this.repository.createInvitation(invitation);
      if (user) await safelyNotify(async () => this.dependencies.notifications?.notify({ recipientUserId: user.id,
        type: 'org-invitation', title: `Invitation to ${organization.displayName}. Check your email to join.`, link: '/organization' }));
      return this.sendInvitation(organization, invitation, raw);
    });
    return user ? this.withTargetMutation(user.id, operation) : operation();
  }
  async listInvitations(ownerId: string, orgId: string) {
    await this.owner(ownerId, orgId); await this.expireInvitations(orgId);
    return (await this.repository.listInvitations(orgId)).filter(v => ['sent', 'not-sent'].includes(v.state) ||
      Date.parse(v.createdAt) >= this.now() - 30 * 86400000).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(v => this.invitationView(v));
  }
  private async scopedInvitation(orgId: string, id: string) {
    const value = (await this.repository.listInvitations(orgId)).find(v => v.id === id);
    if (!value) throw new OrganizationError(404, 'Invitation not found');
    return value;
  }
  async resend(ownerId: string, orgId: string, inviteId: string) {
    await this.owner(ownerId, orgId, true);
    const previous = await this.scopedInvitation(orgId, inviteId);
    const user = await this.auth.findByEmail(previous.email, { fresh: true });
    const operation = () => this.repository.withOrganizationLock(orgId, async () => {
      const organization = await this.owner(ownerId, orgId, true), current = await this.scopedInvitation(orgId, inviteId);
      if (['accepted', 'cancelled'].includes(current.state)) throw new OrganizationError(409, 'Invitation is no longer open');
      const { raw, ...token } = this.newInvitationToken(), patch = { ...token, state: 'not-sent' as const };
      if (!await this.repository.updateInvitation(inviteId, current.state, patch, current.tokenHash)) throw new OrganizationError(409, 'Invitation changed. Try again.');
      return this.sendInvitation(organization, { ...current, ...patch }, raw);
    });
    return user ? this.withTargetMutation(user.id, operation) : operation();
  }
  async cancel(ownerId: string, orgId: string, inviteId: string) {
    return this.repository.withOrganizationLock(orgId, async () => {
      await this.owner(ownerId, orgId); const current = await this.scopedInvitation(orgId, inviteId);
      if (['accepted', 'cancelled'].includes(current.state)) throw new OrganizationError(409, 'Invitation is no longer open');
      if (!await this.repository.updateInvitation(inviteId, current.state, { state: 'cancelled' }, current.tokenHash)) throw new OrganizationError(409, 'Invitation changed. Try again.');
    });
  }
  private invalidInvitation(): never { throw new OrganizationError(410, 'This invitation is no longer valid. Ask the owner for a new one.'); }
  private async validInvitation(token: unknown, joiningUserId?: string) {
    const hash = resetTokenHash(token), invitation = hash ? await this.repository.findInvitationByTokenHash(hash) : null;
    if (!invitation || !(['sent', 'not-sent'].includes(invitation.state) ||
      invitation.state === 'accepted' && invitation.joining && invitation.acceptedBy === joiningUserId)) return this.invalidInvitation();
    if (Date.parse(invitation.expiresAt) <= this.now()) {
      await this.repository.updateInvitation(invitation.id, invitation.state, { state: 'expired' }, invitation.tokenHash);
      return this.invalidInvitation();
    }
    const organization = await this.repository.getOrganization(invitation.orgId);
    if (!organization || organization.state !== 'active') return this.invalidInvitation();
    return { invitation, organization };
  }
  async checkInvitation(token: unknown) {
    const { invitation, organization } = await this.validInvitation(token);
    return { organizationName: organization.displayName, email: invitation.email,
      consentText: `Joining shares your career and course progress with ${organization.displayName}` };
  }
  async acceptInvitation(user: User, token: unknown) {
    return this.repository.withOrganizationLock(`join:${user.id}`, async () => {
      const { invitation, organization } = await this.validInvitation(token, user.id), account = await this.account(user.id);
      if (account.email !== invitation.email) throw new OrganizationError(403, `This invitation is for ${invitation.email}. Sign in with that address.`);
      let membership = await this.repository.getMembership(user.id);
      if (membership && !(invitation.joining && invitation.acceptedBy === user.id && membership.orgId === organization.id)) throw new OrganizationError(409, 'Already in an organization');
      if (invitation.state !== 'accepted' && !await this.repository.updateInvitation(invitation.id, invitation.state,
        { state: 'accepted', acceptedBy: user.id, joining: true }, invitation.tokenHash)) return this.invalidInvitation();
      const time = new Date(this.now()).toISOString();
      if (!membership) {
        membership = { userId: user.id, orgId: organization.id, role: 'member', state: account.emailConfirmed === false ? 'pending-email' : 'active',
          careerId: null, startedCourseIds: [], consentAt: time, joinedAt: time };
        if (!await this.repository.insertMembership(membership)) throw new OrganizationError(409, 'Already in an organization');
      }
      if (!await this.repository.updateInvitation(invitation.id, 'accepted', { joining: false }, invitation.tokenHash)) throw new OrganizationError(409, 'Invitation changed. Try again.');
      if (membership.state === 'pending-email') {
        if (account.emailConfirmed !== false && await this.activatePendingMembership(user.id)) return this.myOrganization(user.id);
        return { state: 'pending-email' as const };
      }
      await this.memberJoined(organization, account);
      return this.myOrganization(user.id);
    });
  }
  private async memberJoined(organization: Organization, user: User) {
    await safelyNotify(async () => this.dependencies.notifications?.notifyOrgOwners(organization.id, {
      type: 'org-member-joined', title: `${user.displayName} joined ${organization.displayName}`, link: '/organization' }));
    for (const member of (await this.repository.listMembers(organization.id)).filter(v => v.role === 'owner' && v.state === 'active')) {
      const owner = await this.auth.findById(member.userId, { fresh: true });
      if (owner?.status === 'active') await this.mail(owner.email, `Member joined ${organization.displayName}`, `${user.displayName} joined ${organization.displayName}.`);
    }
  }
  async activatePendingMembership(userId: string): Promise<boolean> {
    const membership = await this.repository.getMembership(userId);
    if (membership?.state !== 'pending-email') return false;
    const account = await this.account(userId);
    if (account.emailConfirmed === false) return false;
    const organization = await this.organization(membership.orgId);
    if (organization.state !== 'active') return false;
    if (!await this.repository.updateMembership(userId, membership.orgId, { state: 'active' }, 'pending-email')) return false;
    await this.memberJoined(organization, account); return true;
  }

  private async membership(userId: string, orgId: string) {
    await this.account(userId);
    const member = await this.repository.getMembership(userId);
    if (!member || member.orgId !== orgId) throw new OrganizationError(404, 'Organization not found');
    if (member.state !== 'active') throw new OrganizationError(403, 'Not allowed');
    return member;
  }
  private async memberView(member: OrganizationMembership): Promise<Member> {
    const user = await this.auth.findById(member.userId, { fresh: true });
    return { userId: member.userId, name: user?.displayName ?? '', email: user?.email ?? '', role: member.role,
      careerId: member.careerId, joinedAt: member.joinedAt };
  }
  async listMembers(ownerId: string, orgId: string) {
    await this.owner(ownerId, orgId);
    return Promise.all((await this.repository.listMembers(orgId)).filter(v => v.state === 'active').map(v => this.memberView(v)));
  }
  private async remove(userId: string, orgId: string) {
    const member = await this.repository.getMembership(userId);
    if (!member || member.orgId !== orgId) throw new OrganizationError(404, 'Member not found');
    if (member.role === 'owner' && (await this.repository.listMembers(orgId)).filter(v => v.role === 'owner' && v.state === 'active').length <= 1) {
      throw new OrganizationError(409, 'Make another member an owner first');
    }
    for (const request of (await this.repository.listCourseRequests(orgId)).filter(v => v.userId === userId && v.state === 'pending')) {
      await this.repository.decideCourseRequest(request.id, 'declined');
    }
    // DEF-060: close a half-finished join first, or replaying its invitation would recreate the removed membership.
    for (const invitation of (await this.repository.listInvitations(orgId)).filter(v => v.joining && v.acceptedBy === userId)) {
      await this.repository.updateInvitation(invitation.id, 'accepted', { joining: false }, invitation.tokenHash);
    }
    if (!await this.repository.deleteMembership(userId, orgId)) throw new OrganizationError(404, 'Member not found');
    await this.finalizeBillingPending(orgId);
  }
  async removeMember(ownerId: string, orgId: string, userId: string) {
    await this.repository.withOrganizationLock(orgId, async () => { await this.owner(ownerId, orgId); await this.markBillingPending(orgId); await this.remove(userId, orgId); });
    await this.syncBilling(orgId);
  }
  async leave(userId: string) {
    const member = await this.repository.getMembership(userId);
    if (!member) throw new OrganizationError(404, 'Organization not found');
    await this.repository.withOrganizationLock(member.orgId, async () => { await this.account(userId); await this.markBillingPending(member.orgId); await this.remove(userId, member.orgId); });
    await this.syncBilling(member.orgId);
  }
  async promote(ownerId: string, orgId: string, userId: string) {
    return this.withTargetMutation(userId, () => this.repository.withOrganizationLock(orgId, async () => {
      const org = await this.owner(ownerId, orgId);
      if (org.originalOwnerId !== ownerId) throw new OrganizationError(403, 'Only the original owner can promote members');
      await this.membership(userId, orgId);
      if (!await this.repository.updateMembership(userId, orgId, { role: 'owner' })) throw new OrganizationError(404, 'Member not found');
      return this.memberView((await this.repository.getMembership(userId))!);
    }));
  }
  async setCareer(ownerId: string, orgId: string, userId: string, careerId: string | null) {
    const result = await this.withTargetMutation(userId, () => this.repository.withOrganizationLock(orgId, async () => {
      await this.owner(ownerId, orgId); const member = await this.membership(userId, orgId);
      if (careerId !== null && !(await this.dependencies.careers?.listPaths())?.some(v => v._id === careerId && v.published)) {
        throw new OrganizationError(400, 'Choose a published career');
      }
      assertBillingLineLimit(await this.desiredLines(orgId, { member: { ...member, careerId } }));
      await this.markBillingPending(orgId);
      if (!await this.repository.updateMembership(userId, orgId, { careerId })) throw new OrganizationError(404, 'Member not found');
      await this.finalizeBillingPending(orgId);
      return this.memberView((await this.repository.getMembership(userId))!);
    }));
    await this.syncBilling(orgId); return result;
  }
  async openCourseIds(userId: string): Promise<string[]> { return this.orgCourseIds(userId, ['published']); }
  private async orgCourseIds(userId: string, statuses: string[]): Promise<string[]> {
    const member = await this.repository.getMembership(userId);
    if (member?.state !== 'active') return [];
    const org = await this.repository.getOrganization(member.orgId);
    if (org?.state !== 'active' || ['setup-needed', 'blocked', 'cancelled'].includes(billingState(org.billing, this.now()))) return [];
    const user = await this.auth.findById(userId, { fresh: true }); if (user?.status !== 'active') return [];
    const ids = new Set<string>();
    const career = member.careerId ? (await this.dependencies.careers?.listPaths())?.find(v => v._id === member.careerId)?.published : null;
    for (const step of career?.steps ?? []) {
      for (const course of step.courses) if (course.courseId) ids.add(course.courseId);
      for (const action of step.actions) if (action.kind === 'course' && action.courseId) ids.add(action.courseId);
    }
    for (const request of await this.repository.listCourseRequests(member.orgId)) if (request.userId === userId && request.state === 'approved') ids.add(request.courseId);
    const allowed = new Set((await this.dependencies.courses?.listCourses() ?? []).filter(v => statuses.includes(v.status)).map(v => v.id));
    return [...ids].filter(id => allowed.has(id));
  }
  async startCourse(userId: string, courseId: string): Promise<boolean> {
    const member = await this.repository.getMembership(userId); if (!member) return false;
    return this.repository.withOrganizationLock(member.orgId, async () => {
      const current = await this.repository.getMembership(userId);
      if (current?.orgId !== member.orgId || !(await this.openCourseIds(userId)).includes(courseId)) return false;
      return this.repository.updateMembership(userId, member.orgId, { startedCourseIds: [...new Set([...current.startedCourseIds, courseId])] });
    });
  }
  async learnableOrgCourseIds(userId: string) {
    const started = new Set((await this.repository.getMembership(userId))?.startedCourseIds ?? []);
    // A member keeps a course they started after it is archived (F3); nobody can start it then.
    return (await this.orgCourseIds(userId, ['published', 'archived'])).filter(id => started.has(id));
  }
  // X8 F6: prices are read once per answer, not once per request in a list.
  private courseRequestView({ orgId: _orgId, ...value }: StoredCourseRequest, prices: Prices): CourseRequest {
    return { ...value, addOnPriceDkk: prices.courses[value.courseId] ?? null };
  }
  async requestCourse(userId: string, orgId: string, courseId: string) {
    return this.repository.withOrganizationLock(orgId, async () => {
    const member = await this.membership(userId, orgId);
    if ((await this.organization(orgId)).state !== 'active') throw new OrganizationError(409, 'Organization is suspended');
    if (!(await this.dependencies.courses?.listCourses())?.some(v => v.id === courseId && v.status === 'published')) throw new OrganizationError(400, 'Choose a published course');
    if ((await this.openCourseIds(userId)).includes(courseId)) throw new OrganizationError(409, 'This course is already included');
    const account = await this.account(member.userId), value: StoredCourseRequest = { id: randomUUID(), orgId, userId,
      userName: account.displayName, courseId, state: 'pending', addOnPriceDkk: (await this.prices()).courses[courseId] ?? null,
      createdAt: new Date(this.now()).toISOString() };
    if (!await this.repository.createCourseRequest(value)) throw new OrganizationError(409, 'A course request is already pending');
    return this.courseRequestView(value, await this.prices());
    });
  }
  async listCourseRequests(ownerId: string, orgId: string) {
    await this.owner(ownerId, orgId);
    const prices = await this.prices();
    return (await this.repository.listCourseRequests(orgId)).map(v => this.courseRequestView(v, prices));
  }
  async decideCourseRequest(ownerId: string, orgId: string, id: string, action: string) {
    const result = await this.repository.withOrganizationLock(orgId, async () => {
    await this.owner(ownerId, orgId);
    if (!['approve', 'decline'].includes(action)) throw new OrganizationError(400, 'Invalid decision');
    const request = (await this.repository.listCourseRequests(orgId)).find(v => v.id === id);
    if (!request) throw new OrganizationError(404, 'Course request not found');
    if (action === 'approve') {
      assertBillingLineLimit(await this.desiredLines(orgId, { request: { ...request, state: 'approved' } }));
      await this.markBillingPending(orgId);
    }
    if (!await this.repository.decideCourseRequest(id, action === 'approve' ? 'approved' : 'declined')) throw new OrganizationError(409, 'Course request is no longer pending');
    await this.finalizeBillingPending(orgId);
    return this.courseRequestView((await this.repository.listCourseRequests(orgId)).find(v => v.id === id)!, await this.prices());
    });
    await this.syncBilling(orgId); return result;
  }
}
