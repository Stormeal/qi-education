import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { OrganizationService } from './organizationService.js';
import type { MailMessage } from './mailSender.js';

const input = { displayName: 'Academy', companyName: 'Company', cvr: '12345678', billingEmail: 'billing@example.test', message: 'Hello' };
async function setup() {
  const auth = new InMemoryAuthRepository(), repository = new InMemoryOrganizationRepository(), mail: MailMessage[] = [];
  let failing = false;
  const service = new OrganizationService({ repository, auth, sender: { provider: 'local', available: true,
    send: async message => { if (failing) throw new Error('fake mail failure'); mail.push(message); } } });
  const user = (await auth.findByEmail('student@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!;
  return { auth, repository, mail, service, user, admin, failMail: () => { failing = true; } };
}
describe('US-O001 organization requests and prices', () => {
  it('AC01 submits once and notifies each active admin', async () => {
    const f = await setup();
    await f.auth.createUser({ ...f.admin, id: 'admin2', email: 'admin2@example.test' });
    await f.auth.createUser({ ...f.admin, id: 'disabled', email: 'disabled@example.test', status: 'disabled' });
    const result = await f.service.submitRequest(f.user, input);
    expect(result.state).toBe('pending'); expect(result).not.toHaveProperty('userId');
    expect(f.mail.map(v => v.subject)).toEqual(['New organization request: Academy', 'New organization request: Academy']);
    await expect(f.service.submitRequest(f.user, input)).rejects.toMatchObject({ status: 409 });
    expect(await f.service.myOrganization(f.user.id)).toMatchObject({ organization: null, request: result, pendingInvitation: false });
  });
  it('AC02 approves once with the original owner and sends approved mail', async () => {
    const f = await setup(), request = await f.service.submitRequest(f.user, input);
    const approved = await f.service.decide(f.admin.id, request.id, { action: 'approve' });
    expect(approved.state).toBe('approved');
    expect(await f.service.myOrganization(f.user.id)).toMatchObject({ role: 'owner', isOriginalOwner: true,
      organization: { state: 'active', originalOwnerId: f.user.id }, openCourseIds: [] });
    await expect(f.service.decide(f.admin.id, request.id, { action: 'approve' })).rejects.toMatchObject({ status: 409 });
    expect(f.mail.at(-1)).toMatchObject({ to: f.user.email, subject: 'Organization request approved' });
  });
  it('AC02 refuses approval after the requester joined elsewhere, leaving the request pending', async () => {
    const f = await setup(), request = await f.service.submitRequest(f.user, input);
    await f.repository.insertMembership({ userId: f.user.id, orgId: 'elsewhere', role: 'member', state: 'active', careerId: null, startedCourseIds: [], joinedAt: '', consentAt: '' });
    await expect(f.service.decide(f.admin.id, request.id, { action: 'approve' })).rejects.toMatchObject({ status: 409 });
    expect((await f.repository.findPendingOrLatestRequest(f.user.id))?.state).toBe('pending');
    expect(await f.repository.listOrganizations()).toEqual([]);
  });
  it('AC03 requires a decline reason, sends it, and permits correction only after decline', async () => {
    const f = await setup(), request = await f.service.submitRequest(f.user, input);
    await expect(f.service.decide(f.admin.id, request.id, { action: 'decline' })).rejects.toMatchObject({ status: 400 });
    await expect(f.service.resubmitRequest(f.user, input)).rejects.toMatchObject({ status: 409 });
    expect(await f.service.decide(f.admin.id, request.id, { action: 'decline', reason: 'Correct the CVR' })).toMatchObject({ state: 'declined', declineReason: 'Correct the CVR' });
    expect(f.mail.at(-1)?.text).toContain('Correct the CVR');
    expect(await f.service.resubmitRequest(f.user, { ...input, displayName: 'Corrected' })).toMatchObject({ state: 'pending', displayName: 'Corrected', declineReason: null });
  });
  it('AC02 mail failure preserves approval; approval racing membership insertion removes its unused organization', async () => {
    const f = await setup(), request = await f.service.submitRequest(f.user, input); f.failMail();
    expect((await f.service.decide(f.admin.id, request.id, { action: 'approve' })).state).toBe('approved');
    const g = await setup(), other = await g.service.submitRequest(g.user, input);
    g.repository.insertMembership = async () => false;
    await expect(g.service.decide(g.admin.id, other.id, { action: 'approve' })).rejects.toMatchObject({ status: 409 });
    expect(await g.repository.listOrganizations()).toEqual([]);
    expect((await g.repository.findPendingOrLatestRequest(g.user.id))?.state).toBe('pending');
  });
  it('AC11 validates whole DKK prices and only stores display prices', async () => {
    const f = await setup();
    expect(await f.service.setCareerPrice('career', 120)).toEqual({ careers: { career: 120 }, courses: {} });
    expect(await f.service.setCoursePrice('course', 25)).toEqual({ careers: { career: 120 }, courses: { course: 25 } });
    await expect(f.service.setCareerPrice('career', 1000000)).rejects.toMatchObject({ status: 400 });
    expect(await f.service.setCareerPrice('career', null)).toEqual({ careers: {}, courses: { course: 25 } });
  });
  it('AC12 suspends and reactivates, counts members and requires fresh admin permissions', async () => {
    const f = await setup(), request = await f.service.submitRequest(f.user, input);
    const approved = await f.service.decide(f.admin.id, request.id, { action: 'approve' }), id = approved.organizationId!;
    expect((await f.service.suspend(id)).state).toBe('suspended');
    expect((await f.service.reactivate(id)).state).toBe('active');
    expect(await f.service.listOrganizations()).toMatchObject([{ id, memberCount: 1 }]);
    await f.auth.updateRole(f.admin.id, 'student');
    await expect(f.service.decide(f.admin.id, request.id, { action: 'approve' })).rejects.toMatchObject({ status: 403 });
  });
});
