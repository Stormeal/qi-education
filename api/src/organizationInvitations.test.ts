import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { OrganizationService } from './organizationService.js';
import type { MailMessage } from './mailSender.js';
import { resetTokenHash } from './passwordResetDelivery.js';

async function setup() {
  const auth = new InMemoryAuthRepository(), repository = new InMemoryOrganizationRepository(), mail: MailMessage[] = [];
  let now = Date.UTC(2026, 9, 23), counter = 0, failing = false;
  const service = new OrganizationService({ repository, auth, sender: { provider: 'local', available: true,
    send: async m => { if (failing) throw new Error('fake mail failure'); mail.push(m); } },
    options: { now: () => now, newToken: () => String(++counter).padStart(43, 'a'), appPublicUrl: 'https://example.test/' } });
  const owner = (await auth.findByEmail('student@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!;
  const request = await service.submitRequest(owner, { displayName: 'Team', companyName: 'Company', cvr: '12345678', billingEmail: 'b@example.test' });
  const orgId = (await service.decide(admin.id, request.id, { action: 'approve' })).organizationId!;
  mail.length = 0;
  const token = () => mail.findLast(m => m.text.includes('#token='))!.text.match(/#token=([A-Za-z0-9_-]+)/)![1];
  return { auth, repository, mail, service, owner, orgId, token, advance: (ms: number) => { now += ms; }, failMail: () => { failing = true; } };
}
describe('US-O001 invitations and joining', () => {
  it('AC04 sends only a fragment link and exact consent, stores only its hash', async () => {
    const f = await setup();
    expect(await f.service.invite(f.owner.id, f.orgId, ' NEW@example.test ')).toMatchObject({ email: 'new@example.test', state: 'sent' });
    expect(f.mail[0].text).toContain('https://example.test/join-organization#token=');
    expect(f.mail[0].text).toContain('Joining shares your career and course progress with Team');
    const raw = f.token(), stored = (await f.repository.listInvitations(f.orgId))[0];
    expect(stored.tokenHash).toBe(resetTokenHash(raw)); expect(JSON.stringify(stored)).not.toContain(raw);
    expect(await f.service.checkInvitation(raw)).toEqual({ organizationName: 'Team', email: 'new@example.test', consentText: 'Joining shares your career and course progress with Team' });
    expect(await f.service.listInvitations(f.owner.id, f.orgId)).not.toEqual(expect.arrayContaining([expect.objectContaining({ tokenHash: expect.anything() })]));
  });
  it('AC04 new unconfirmed account becomes active after confirmation and notifies owners once', async () => {
    const f = await setup(); await f.service.invite(f.owner.id, f.orgId, 'new@example.test'); const raw = f.token();
    const user = await f.auth.createUser({ ...f.owner, id: 'new', email: 'new@example.test', emailConfirmed: false });
    expect(await f.service.acceptInvitation(user, raw)).toEqual({ state: 'pending-email' });
    expect(await f.service.myOrganization(user.id)).toMatchObject({ organization: null, pendingInvitation: true });
    expect(await f.service.activatePendingMembership(user.id)).toBe(false);
    await f.auth.confirmEmail(user.id);
    expect(await f.service.activatePendingMembership(user.id)).toBe(true);
    expect(await f.service.activatePendingMembership(user.id)).toBe(false);
    expect(f.mail.filter(m => m.subject === 'Member joined Team')).toHaveLength(1);
    expect(await f.service.myOrganization(user.id)).toMatchObject({ role: 'member', organization: { id: f.orgId } });
  });
  it('DEF-060 a removed member cannot rejoin by replaying an interrupted invitation', async () => {
    const f = await setup(), user = (await f.auth.findByEmail('teacher@qi-education.local'))!;
    await f.service.invite(f.owner.id, f.orgId, user.email); const raw = f.token();
    const update = f.repository.updateInvitation.bind(f.repository);
    let interrupt = true;
    f.repository.updateInvitation = async (id, state, patch, hash) => {
      if (interrupt && patch.joining === false) { interrupt = false; throw new Error('store unavailable'); }
      return update(id, state, patch, hash);
    };
    await expect(f.service.acceptInvitation(user, raw)).rejects.toThrow('store unavailable');
    expect(await f.repository.getMembership(user.id)).toMatchObject({ orgId: f.orgId, state: 'active' });

    await f.service.removeMember(f.owner.id, f.orgId, user.id);

    await expect(f.service.acceptInvitation(user, raw)).rejects.toMatchObject({ status: 410 });
    expect(await f.repository.getMembership(user.id)).toBeNull();
  });

  it('DEF-060 an interrupted join that nobody removed still recovers on retry', async () => {
    const f = await setup(), user = (await f.auth.findByEmail('teacher@qi-education.local'))!;
    await f.service.invite(f.owner.id, f.orgId, user.email); const raw = f.token();
    const update = f.repository.updateInvitation.bind(f.repository);
    let interrupt = true;
    f.repository.updateInvitation = async (id, state, patch, hash) => {
      if (interrupt && patch.joining === false) { interrupt = false; throw new Error('store unavailable'); }
      return update(id, state, patch, hash);
    };
    await expect(f.service.acceptInvitation(user, raw)).rejects.toThrow('store unavailable');
    expect(await f.service.acceptInvitation(user, raw)).toMatchObject({ role: 'member', organization: { id: f.orgId } });
  });

  it('AC05 confirmed existing account joins immediately with owner mail and used token is invalid', async () => {
    const f = await setup(), user = (await f.auth.findByEmail('teacher@qi-education.local'))!;
    await f.service.invite(f.owner.id, f.orgId, user.email); const raw = f.token();
    expect(await f.service.myOrganization(user.id)).toMatchObject({ pendingInvitation: true });
    expect(await f.service.acceptInvitation(user, raw)).toMatchObject({ role: 'member', organization: { id: f.orgId } });
    expect(f.mail.at(-1)).toMatchObject({ to: f.owner.email, subject: 'Member joined Team' });
    await expect(f.service.checkInvitation(raw)).rejects.toMatchObject({ status: 410 });
    await expect(f.service.acceptInvitation(user, raw)).rejects.toMatchObject({ status: 410 });
  });
  it('AC06 / Review Focus 1 refuses wrong email with exact message and another organization with 409', async () => {
    const f = await setup(), user = (await f.auth.findByEmail('teacher@qi-education.local'))!;
    await f.service.invite(f.owner.id, f.orgId, 'target@example.test');
    await expect(f.service.acceptInvitation(user, f.token())).rejects.toMatchObject({ status: 403, message: 'This invitation is for target@example.test. Sign in with that address.' });
    await f.service.invite(f.owner.id, f.orgId, user.email); const raw = f.token();
    await f.repository.insertMembership({ userId: user.id, orgId: 'elsewhere', role: 'member', state: 'active', careerId: null, startedCourseIds: [], consentAt: '', joinedAt: '' });
    await expect(f.service.acceptInvitation(user, raw)).rejects.toMatchObject({ status: 409 });
  });
  it('AC06 cancels, expires and rotates tokens, and allows a new invite after expiry', async () => {
    const f = await setup(); const invitation = await f.service.invite(f.owner.id, f.orgId, 'new@example.test'), old = f.token();
    await expect(f.service.invite(f.owner.id, f.orgId, 'new@example.test')).rejects.toMatchObject({ status: 409 });
    f.advance(1000);
    const resent = await f.service.resend(f.owner.id, f.orgId, invitation.id), raw = f.token();
    expect(raw).not.toBe(old); expect(resent.expiresAt).not.toBe(invitation.expiresAt);
    await expect(f.service.checkInvitation(old)).rejects.toMatchObject({ status: 410 });
    await f.service.cancel(f.owner.id, f.orgId, invitation.id);
    await expect(f.service.checkInvitation(raw)).rejects.toMatchObject({ status: 410 });
    await f.service.invite(f.owner.id, f.orgId, 'new@example.test'); const expired = f.token();
    f.advance(14 * 86400000 + 1);
    await expect(f.service.checkInvitation(expired)).rejects.toMatchObject({ status: 410 });
    expect((await f.service.invite(f.owner.id, f.orgId, 'new@example.test')).state).toBe('sent');
  });
  it('Review Focus 2 refuses an existing member with Already a member and sends no mail', async () => {
    const f = await setup();
    await expect(f.service.invite(f.owner.id, f.orgId, f.owner.email)).rejects.toMatchObject({ status: 409, message: 'Already a member' });
    expect(f.mail).toEqual([]);
  });
  it('AC12 refuses invites and acceptance while suspended, and scopes owner resources', async () => {
    const f = await setup(); await f.service.invite(f.owner.id, f.orgId, 'new@example.test'); const raw = f.token();
    await f.service.suspend(f.orgId);
    await expect(f.service.invite(f.owner.id, f.orgId, 'other@example.test')).rejects.toMatchObject({ status: 409 });
    await expect(f.service.checkInvitation(raw)).rejects.toMatchObject({ status: 410 });
    await expect(f.service.listInvitations(f.owner.id, 'foreign')).rejects.toMatchObject({ status: 404 });
  });
  it('AC04 failed mail leaves a not-sent invitation that can be resent', async () => {
    const f = await setup(); f.failMail();
    expect((await f.service.invite(f.owner.id, f.orgId, 'new@example.test')).state).toBe('not-sent');
    expect((await f.service.listInvitations(f.owner.id, f.orgId))[0].state).toBe('not-sent');
  });
});
