import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AuthUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { MailSender } from './mailSender.js';
import type { OrganizationRepository } from './organizationRepository.js';
import { KeyedSerialQueue } from './keyedSerialQueue.js';
import { OrganizationError, organizationRequestInputSchema, declineSchema, priceSchema,
  type OrgRequest, type MyOrganization, type StoredOrgRequest, type Organization } from './organization.js';

type User = Pick<AuthUser, 'id' | 'email' | 'displayName'>;
export type OrganizationOptions = { now?: () => number; newToken?: () => string; appPublicUrl?: string };
export class OrganizationService {
  private readonly repository: OrganizationRepository;
  private readonly auth: AuthRepository;
  private readonly sender: MailSender;
  private readonly now: () => number;
  private readonly writes = new KeyedSerialQueue();
  constructor(private readonly dependencies: { repository: OrganizationRepository; auth: AuthRepository;
    sender: MailSender; options?: OrganizationOptions }) {
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
      return { organization: null, request: request ? this.requestView(request) : null, pendingInvitation: membership?.state === 'pending-email' };
    }
    const organization = await this.organization(membership.orgId), prices = await this.prices();
    return { organization, role: membership.role, isOriginalOwner: organization.originalOwnerId === userId,
      careerId: membership.careerId, seatPriceDkk: membership.careerId ? prices.careers[membership.careerId] ?? null : null,
      openCourseIds: [], courseRequests: (await this.repository.listCourseRequests(organization.id)).filter(v => v.userId === userId).map(({ orgId: _orgId, ...v }) => v) };
  }
  async listRequests(state = 'pending') {
    return Promise.all((await this.repository.listRequests(state)).map(async value => {
      const user = await this.auth.findById(value.userId, { fresh: true });
      return { ...this.requestView(value), requesterName: user?.displayName ?? '', requesterEmail: user?.email ?? '' };
    }));
  }
  async decide(adminId: string, requestId: string, decision: { action: string; reason?: string }): Promise<OrgRequest> {
    if ((await this.account(adminId)).role !== 'admin') throw new OrganizationError(403, 'Not allowed');
    if (!['approve', 'decline'].includes(decision.action)) throw new OrganizationError(400, 'Invalid decision');
    const reason = decision.action === 'decline' ? this.parse(declineSchema, decision).reason : null;
    return this.writes.run(`request:${requestId}`, async () => {
      const request = (await this.repository.listRequests()).find(v => v.id === requestId);
      if (!request) throw new OrganizationError(404, 'Request not found');
      if (request.state !== 'pending') throw new OrganizationError(409, 'Request is no longer pending');
      if (await this.repository.getMembership(request.userId)) throw new OrganizationError(409, 'Requester already joined an organization');
      const user = await this.account(request.userId), time = new Date(this.now()).toISOString();
      let organizationId: string | null = null;
      if (decision.action === 'approve') {
        // Deterministic ID makes simultaneous approvals collide before either can create a second organization.
        organizationId = request.id;
        await this.repository.createOrganization({ id: organizationId, displayName: request.displayName,
          companyName: request.companyName, cvr: request.cvr, billingEmail: request.billingEmail,
          state: 'active', originalOwnerId: user.id, createdAt: time });
        if (!await this.repository.insertMembership({ userId: user.id, orgId: organizationId, role: 'owner', state: 'active',
          careerId: null, startedCourseIds: [], joinedAt: time, consentAt: time })) {
          await this.repository.deleteOrganization(organizationId);
          throw new OrganizationError(409, 'Requester already joined an organization');
        }
      }
      const patch = { state: decision.action === 'approve' ? 'approved' as const : 'declined' as const,
        decidedAt: time, declineReason: reason, organizationId };
      if (!await this.repository.updateRequest(requestId, 'pending', patch)) {
        if (organizationId) { await this.repository.deleteMembership(user.id, organizationId); await this.repository.deleteOrganization(organizationId); }
        throw new OrganizationError(409, 'Request is no longer pending');
      }
      await this.mail(user.email, `Organization request ${patch.state}`, reason ?? `Your organization ${request.displayName} is approved.`);
      return this.requestView({ ...request, ...patch });
    });
  }
  private async organization(id: string): Promise<Organization> {
    const organization = await this.repository.getOrganization(id);
    if (!organization) throw new OrganizationError(404, 'Organization not found');
    return organization;
  }
  async listOrganizations() {
    return Promise.all((await this.repository.listOrganizations()).map(async value => ({ ...value,
      memberCount: (await this.repository.listMembers(value.id)).filter(v => v.state === 'active').length })));
  }
  private async state(id: string, state: Organization['state']) {
    await this.organization(id);
    if (!await this.repository.setOrganizationState(id, state)) throw new OrganizationError(404, 'Organization not found');
    return this.organization(id);
  }
  suspend(id: string) { return this.state(id, 'suspended'); }
  reactivate(id: string) { return this.state(id, 'active'); }
  prices() { return this.repository.getPrices(); }
  async setCareerPrice(id: string, priceDkk: unknown) { const value = this.parse(priceSchema, { priceDkk }); await this.repository.setCareerPrice(id, value.priceDkk); return this.prices(); }
  async setCoursePrice(id: string, priceDkk: unknown) { const value = this.parse(priceSchema, { priceDkk }); await this.repository.setCoursePrice(id, value.priceDkk); return this.prices(); }
}
