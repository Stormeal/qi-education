import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AuthUser } from './auth.js';
import type { AuthRepository } from './authRepository.js';
import type { MailSender } from './mailSender.js';
import type { CareerPathRepository } from './careerPathRepository.js';
import type { CourseRepository } from './courseRepository.js';
import type { OrganizationRepository } from './organizationRepository.js';
import { KeyedSerialQueue } from './keyedSerialQueue.js';
import { apiConfig } from './config.js';
import { resetTokenHash } from './passwordResetDelivery.js';
import { OrganizationError, organizationRequestInputSchema, declineSchema, priceSchema, inviteSchema,
  type OrgRequest, type MyOrganization, type StoredOrgRequest, type Organization, type StoredInvitation, type Invitation,
  type Member, type OrganizationMembership, type StoredCourseRequest, type CourseRequest } from './organization.js';

type User = Pick<AuthUser, 'id' | 'email' | 'displayName'>;
export type OrganizationOptions = { now?: () => number; newToken?: () => string; appPublicUrl?: string };
export class OrganizationService {
  private readonly repository: OrganizationRepository;
  private readonly auth: AuthRepository;
  private readonly sender: MailSender;
  private readonly now: () => number;
  private readonly writes = new KeyedSerialQueue();
  constructor(private readonly dependencies: { repository: OrganizationRepository; auth: AuthRepository;
    sender: MailSender; options?: OrganizationOptions; careers?: CareerPathRepository; courses?: CourseRepository }) {
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
      const user = await this.account(userId);
      const invited = (await this.repository.listInvitations()).some(v => v.email === user.email &&
        ['sent', 'not-sent'].includes(v.state) && Date.parse(v.expiresAt) > this.now());
      return { organization: null, request: request ? this.requestView(request) : null,
        pendingInvitation: membership?.state === 'pending-email' || invited };
    }
    const organization = await this.organization(membership.orgId), prices = await this.prices();
    return { organization, role: membership.role, isOriginalOwner: organization.originalOwnerId === userId,
      careerId: membership.careerId, seatPriceDkk: membership.careerId ? prices.careers[membership.careerId] ?? null : null,
      openCourseIds: await this.openCourseIds(userId), courseRequests: await Promise.all((await this.repository.listCourseRequests(organization.id))
        .filter(v => v.userId === userId).map(v => this.courseRequestView(v))) };
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

  private async owner(userId: string, orgId: string, active = false) {
    await this.account(userId);
    const membership = await this.repository.getMembership(userId);
    if (!membership || membership.orgId !== orgId) throw new OrganizationError(404, 'Organization not found');
    if (membership.state !== 'active' || membership.role !== 'owner') throw new OrganizationError(403, 'Not allowed');
    const organization = await this.organization(orgId);
    if (active && organization.state !== 'active') throw new OrganizationError(409, 'Organization is suspended');
    return organization;
  }
  private invitationView({ orgId: _orgId, tokenHash: _hash, ...invitation }: StoredInvitation): Invitation { return invitation; }
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
    const organization = await this.owner(ownerId, orgId, true), input = this.parse(inviteSchema, { email });
    const user = await this.auth.findByEmail(input.email, { fresh: true });
    if (user && (await this.repository.getMembership(user.id))?.orgId === orgId) throw new OrganizationError(409, 'Already a member');
    await this.expireInvitations(orgId);
    const { raw, ...token } = this.newInvitationToken();
    const invitation: StoredInvitation = { ...token, id: randomUUID(), orgId, email: input.email, state: 'not-sent', createdAt: new Date(this.now()).toISOString() };
    await this.repository.createInvitation(invitation);
    return this.sendInvitation(organization, invitation, raw);
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
    const organization = await this.owner(ownerId, orgId, true), current = await this.scopedInvitation(orgId, inviteId);
    if (['accepted', 'cancelled'].includes(current.state)) throw new OrganizationError(409, 'Invitation is no longer open');
    const { raw, ...token } = this.newInvitationToken(), patch = { ...token, state: 'not-sent' as const };
    if (!await this.repository.updateInvitation(inviteId, current.state, patch, current.tokenHash)) throw new OrganizationError(409, 'Invitation changed. Try again.');
    return this.sendInvitation(organization, { ...current, ...patch }, raw);
  }
  async cancel(ownerId: string, orgId: string, inviteId: string) {
    await this.owner(ownerId, orgId); const current = await this.scopedInvitation(orgId, inviteId);
    if (['accepted', 'cancelled'].includes(current.state)) throw new OrganizationError(409, 'Invitation is no longer open');
    if (!await this.repository.updateInvitation(inviteId, current.state, { state: 'cancelled' }, current.tokenHash)) throw new OrganizationError(409, 'Invitation changed. Try again.');
  }
  private invalidInvitation(): never { throw new OrganizationError(410, 'This invitation is no longer valid. Ask the owner for a new one.'); }
  private async validInvitation(token: unknown) {
    const hash = resetTokenHash(token), invitation = hash ? await this.repository.findInvitationByTokenHash(hash) : null;
    if (!invitation || !['sent', 'not-sent'].includes(invitation.state)) return this.invalidInvitation();
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
    const { invitation, organization } = await this.validInvitation(token), account = await this.account(user.id);
    if (account.email !== invitation.email) throw new OrganizationError(403, `This invitation is for ${invitation.email}. Sign in with that address.`);
    if (await this.repository.getMembership(user.id)) throw new OrganizationError(409, 'Already in an organization');
    if (!await this.repository.updateInvitation(invitation.id, invitation.state, { state: 'accepted' }, invitation.tokenHash)) return this.invalidInvitation();
    const time = new Date(this.now()).toISOString(), state = account.emailConfirmed === false ? 'pending-email' as const : 'active' as const;
    if (!await this.repository.insertMembership({ userId: user.id, orgId: organization.id, role: 'member', state,
      careerId: null, startedCourseIds: [], consentAt: time, joinedAt: time })) throw new OrganizationError(409, 'Already in an organization');
    if (state === 'pending-email') return { state };
    await this.memberJoined(organization, account);
    return this.myOrganization(user.id);
  }
  private async memberJoined(organization: Organization, user: User) {
    for (const member of (await this.repository.listMembers(organization.id)).filter(v => v.role === 'owner' && v.state === 'active')) {
      const owner = await this.auth.findById(member.userId, { fresh: true });
      if (owner?.status === 'active') await this.mail(owner.email, `Member joined ${organization.displayName}`, `${user.displayName} joined ${organization.displayName}.`);
    }
  }
  async activatePendingMembership(userId: string): Promise<boolean> {
    const account = await this.account(userId), membership = await this.repository.getMembership(userId);
    if (account.emailConfirmed === false || membership?.state !== 'pending-email') return false;
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
    if (!await this.repository.deleteMembership(userId, orgId)) throw new OrganizationError(404, 'Member not found');
  }
  async removeMember(ownerId: string, orgId: string, userId: string) {
    return this.repository.withOrganizationLock(orgId, async () => { await this.owner(ownerId, orgId); await this.remove(userId, orgId); });
  }
  async leave(userId: string) {
    const member = await this.repository.getMembership(userId);
    if (!member) throw new OrganizationError(404, 'Organization not found');
    return this.repository.withOrganizationLock(member.orgId, async () => { await this.account(userId); await this.remove(userId, member.orgId); });
  }
  async promote(ownerId: string, orgId: string, userId: string) {
    return this.repository.withOrganizationLock(orgId, async () => {
      const org = await this.owner(ownerId, orgId);
      if (org.originalOwnerId !== ownerId) throw new OrganizationError(403, 'Only the original owner can promote members');
      await this.membership(userId, orgId);
      if (!await this.repository.updateMembership(userId, orgId, { role: 'owner' })) throw new OrganizationError(404, 'Member not found');
      return this.memberView((await this.repository.getMembership(userId))!);
    });
  }
  async setCareer(ownerId: string, orgId: string, userId: string, careerId: string | null) {
    return this.repository.withOrganizationLock(orgId, async () => {
      await this.owner(ownerId, orgId); await this.membership(userId, orgId);
      if (careerId !== null && !(await this.dependencies.careers?.listPaths())?.some(v => v._id === careerId && v.published)) {
        throw new OrganizationError(400, 'Choose a published career');
      }
      if (!await this.repository.updateMembership(userId, orgId, { careerId })) throw new OrganizationError(404, 'Member not found');
      return this.memberView((await this.repository.getMembership(userId))!);
    });
  }
  async openCourseIds(userId: string): Promise<string[]> {
    const member = await this.repository.getMembership(userId);
    if (member?.state !== 'active' || (await this.repository.getOrganization(member.orgId))?.state !== 'active') return [];
    const user = await this.auth.findById(userId, { fresh: true }); if (user?.status !== 'active') return [];
    const ids = new Set<string>();
    const career = member.careerId ? (await this.dependencies.careers?.listPaths())?.find(v => v._id === member.careerId)?.published : null;
    for (const step of career?.steps ?? []) {
      for (const course of step.courses) if (course.courseId) ids.add(course.courseId);
      for (const action of step.actions) if (action.kind === 'course' && action.courseId) ids.add(action.courseId);
    }
    for (const request of await this.repository.listCourseRequests(member.orgId)) if (request.userId === userId && request.state === 'approved') ids.add(request.courseId);
    const published = new Set((await this.dependencies.courses?.listCourses() ?? []).filter(v => v.status === 'published').map(v => v.id));
    return [...ids].filter(id => published.has(id));
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
    return (await this.openCourseIds(userId)).filter(id => started.has(id));
  }
  private async courseRequestView({ orgId: _orgId, ...value }: StoredCourseRequest): Promise<CourseRequest> {
    return { ...value, addOnPriceDkk: (await this.prices()).courses[value.courseId] ?? null };
  }
  async requestCourse(userId: string, orgId: string, courseId: string) {
    const member = await this.membership(userId, orgId);
    if ((await this.organization(orgId)).state !== 'active') throw new OrganizationError(409, 'Organization is suspended');
    if (!(await this.dependencies.courses?.listCourses())?.some(v => v.id === courseId && v.status === 'published')) throw new OrganizationError(400, 'Choose a published course');
    if ((await this.openCourseIds(userId)).includes(courseId)) throw new OrganizationError(409, 'This course is already included');
    const account = await this.account(member.userId), value: StoredCourseRequest = { id: randomUUID(), orgId, userId,
      userName: account.displayName, courseId, state: 'pending', addOnPriceDkk: (await this.prices()).courses[courseId] ?? null,
      createdAt: new Date(this.now()).toISOString() };
    if (!await this.repository.createCourseRequest(value)) throw new OrganizationError(409, 'A course request is already pending');
    return this.courseRequestView(value);
  }
  async listCourseRequests(ownerId: string, orgId: string) {
    await this.owner(ownerId, orgId);
    return Promise.all((await this.repository.listCourseRequests(orgId)).map(v => this.courseRequestView(v)));
  }
  async decideCourseRequest(ownerId: string, orgId: string, id: string, action: string) {
    await this.owner(ownerId, orgId);
    if (!['approve', 'decline'].includes(action)) throw new OrganizationError(400, 'Invalid decision');
    const request = (await this.repository.listCourseRequests(orgId)).find(v => v.id === id);
    if (!request) throw new OrganizationError(404, 'Course request not found');
    if (!await this.repository.decideCourseRequest(id, action === 'approve' ? 'approved' : 'declined')) throw new OrganizationError(409, 'Course request is no longer pending');
    return this.courseRequestView((await this.repository.listCourseRequests(orgId)).find(v => v.id === id)!);
  }
}
