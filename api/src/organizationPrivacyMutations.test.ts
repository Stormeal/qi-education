import { describe, expect, it } from 'vitest';
import { InMemoryAuthRepository } from './authRepository.js';
import { InMemoryOrganizationRepository } from './organizationRepository.js';
import { OrganizationService } from './organizationService.js';

function gate() {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return { waiting, release };
}
async function setup(withUserMutation?: <T>(userId: string, operation: () => Promise<T>) => Promise<T>) {
  const auth = new InMemoryAuthRepository(), repository = new InMemoryOrganizationRepository();
  const owner = (await auth.findByEmail('student@qi-education.local'))!, admin = (await auth.findByEmail('admin@qi-education.local'))!, target = (await auth.findByEmail('teacher@qi-education.local'))!;
  const service = new OrganizationService({ auth, repository, withUserMutation, sender: { provider: 'local', available: true, send: async () => {} } });
  await repository.createOrganization({ id: 'org', displayName: 'Team', companyName: 'Company', billingEmail: 'billing@example.test', cvr: '12345678', state: 'active', originalOwnerId: owner.id, createdAt: 'now' });
  for (const user of [owner, target]) await repository.insertMembership({ userId: user.id, orgId: 'org', role: user.id === owner.id ? 'owner' : 'member', state: 'active', careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now' });
  return { auth, repository, service, owner, admin, target };
}
describe('US-P021 cross-user organization privacy admission', () => {
  it('admits an approval target before taking its request lock and keeps the scope across a paused write', async () => {
    const active = new Set<string>(), entered = gate(), finish = gate();
    const f = await setup(async (id, operation) => { active.add(id); try { return await operation(); } finally { active.delete(id); } });
    await f.repository.deleteMembership(f.target.id, 'org');
    const request = await f.service.submitRequest(f.target, { displayName: 'New team', companyName: 'New company', cvr: '12345678', billingEmail: f.target.email });
    const create = f.repository.createOrganization.bind(f.repository);
    f.repository.createOrganization = async value => { entered.release(); await finish.waiting; return create(value); };
    const approval = f.service.decide(f.admin.id, request.id, { action: 'approve' });
    await entered.waiting;
    const admitted = active.has(f.target.id);
    finish.release(); await approval;
    expect(admitted).toBe(true); expect(active.size).toBe(0);
  });
  it.each(['promote', 'setCareer', 'invite', 'resend'] as const)('refuses %s when target admission is closed before taking organization mutation locks', async action => {
    let closedTarget: string | undefined;
    const f = await setup(async (id, operation) => { if (id === closedTarget) throw new Error('account-erasing'); return operation(); });
    await f.repository.deleteMembership(f.target.id, 'org');
    const invite = await f.service.invite(f.owner.id, 'org', f.target.email);
    if (action === 'promote' || action === 'setCareer') await f.repository.insertMembership({ userId: f.target.id, orgId: 'org', role: 'member', state: 'active', careerId: null, startedCourseIds: [], consentAt: 'now', joinedAt: 'now' });
    closedTarget = f.target.id;
    const operation = action === 'promote' ? f.service.promote(f.owner.id, 'org', f.target.id)
      : action === 'setCareer' ? f.service.setCareer(f.owner.id, 'org', f.target.id, null)
      : action === 'invite' ? f.service.invite(f.owner.id, 'org', f.target.email)
      : f.service.resend(f.owner.id, 'org', invite.id);
    await expect(operation).rejects.toThrow('account-erasing');
    expect((await f.repository.getMembership(f.target.id))?.role ?? 'absent').toBe(action === 'promote' || action === 'setCareer' ? 'member' : 'absent');
  });
  it('rechecks target status inside admission instead of trusting the pre-admission lookup', async () => {
    let closeTarget: (() => Promise<void>) | undefined;
    const f = await setup(async (_id, operation) => { await closeTarget?.(); return operation(); });
    await f.repository.deleteMembership(f.target.id, 'org');
    closeTarget = async () => { await f.auth.updateStatus(f.target.id, 'disabled'); };
    await expect(f.service.invite(f.owner.id, 'org', f.target.email)).rejects.toMatchObject({ status: 403 });
    expect(await f.repository.listInvitations('org')).toEqual([]);
  });
});
