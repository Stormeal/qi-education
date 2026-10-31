import type { Collection, Document } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';
import { SYSTEM_ACCOUNT_ID } from './systemAccount.js';
import { AmbiguousCourseWriteError, protectCourseWrite, CourseBusyError, InMemoryCourseMutationLock, MongoCourseMutationLock, type CourseMutationLock } from './courseMutationLock.js';
import { OrganizationError, type Organization, type OrganizationMembership, type Prices,
  type StoredOrgRequest, type StoredInvitation, type StoredCourseRequest } from './organization.js';

export type OrganizationPrivacyExport = {
  membership: OrganizationMembership | null;
  ownedOrganizations: { id: string; displayName: string }[];
  requests: StoredOrgRequest[];
  courseRequests: StoredCourseRequest[];
  invitations: Omit<StoredInvitation, 'tokenHash' | 'acceptedBy' | 'joining'>[];
};

export interface OrganizationRepository {
  collectForExport(userId: string, email?: string): Promise<OrganizationPrivacyExport>;
  erasureBlockers(userId: string): Promise<{ id: string; name: string }[]>;
  removeForUser(userId: string, email?: string): Promise<void>;
  withOrganizationLock<T>(orgId: string, operation: () => Promise<T>): Promise<T>;
  createRequest(value: StoredOrgRequest): Promise<void>;
  findPendingOrLatestRequest(userId: string): Promise<StoredOrgRequest | null>;
  updateRequest(id: string, expectedState: StoredOrgRequest['state'], patch: Partial<StoredOrgRequest>): Promise<boolean>;
  listRequests(state?: string): Promise<StoredOrgRequest[]>;
  createOrganization(value: Organization): Promise<void>;
  deleteOrganization(id: string): Promise<void>;
  getOrganization(id: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  setOrganizationState(id: string, state: Organization['state']): Promise<boolean>;
  insertMembership(value: OrganizationMembership): Promise<boolean>;
  getMembership(userId: string): Promise<OrganizationMembership | null>;
  listMembers(orgId: string): Promise<OrganizationMembership[]>;
  updateMembership(userId: string, expectedOrgId: string, patch: Partial<OrganizationMembership>, expectedState?: OrganizationMembership['state']): Promise<boolean>;
  deleteMembership(userId: string, expectedOrgId: string): Promise<boolean>;
  createInvitation(value: StoredInvitation): Promise<void>;
  findInvitationByTokenHash(hash: string): Promise<StoredInvitation | null>;
  listInvitations(orgId?: string): Promise<StoredInvitation[]>;
  updateInvitation(id: string, expectedState: StoredInvitation['state'], patch: Partial<StoredInvitation>, expectedTokenHash?: string): Promise<boolean>;
  createCourseRequest(value: StoredCourseRequest): Promise<boolean>;
  listCourseRequests(orgId: string): Promise<StoredCourseRequest[]>;
  decideCourseRequest(id: string, decision: 'approved' | 'declined'): Promise<boolean>;
  getPrices(): Promise<Prices>;
  setCareerPrice(id: string, dkk: number | null): Promise<void>;
  setCoursePrice(id: string, dkk: number | null): Promise<void>;
}

type Tables = { requests: StoredOrgRequest; organizations: Organization; memberships: OrganizationMembership;
  invitations: StoredInvitation; course_requests: StoredCourseRequest; prices: { id: string; kind: 'careers' | 'courses'; resourceId: string; dkk: number } };
type Table = keyof Tables;
type RecordValue = Tables[Table];
// X8 F6: reads name what they need (an id, or equal fields), so MongoDB answers from an index instead of returning a whole collection.
type Filter<K extends Table> = Partial<Tables[K]>;
interface Store {
  list<K extends Table>(table: K, filter?: Filter<K>): Promise<Tables[K][]>;
  get<K extends Table>(table: K, id: string): Promise<Tables[K] | null>;
  insert<K extends Table>(table: K, id: string, value: Tables[K]): Promise<boolean>;
  update<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>, patch: Partial<Tables[K]>): Promise<boolean>;
  delete<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>): Promise<boolean>;
}
const duplicate = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
const open = (value: RecordValue) => 'state' in value && ['pending', 'sent', 'not-sent'].includes(value.state);

class MemoryStore implements Store {
  private tables = new Map<Table, Map<string, RecordValue>>();
  private table(name: Table) { let table = this.tables.get(name); if (!table) this.tables.set(name, table = new Map()); return table; }
  async list<K extends Table>(name: K, filter: Filter<K> = {}): Promise<Tables[K][]> {
    return structuredClone([...this.table(name).values()].filter(value => Object.entries(filter).every(([key, v]) => (value as unknown as Record<string, unknown>)[key] === v))) as Tables[K][];
  }
  async get<K extends Table>(name: K, id: string) { const value = this.table(name).get(id); return value ? structuredClone(value) as Tables[K] : null; }
  async insert<K extends Table>(name: K, id: string, value: Tables[K]) {
    const table = this.table(name);
    if (table.has(id) || this.conflicts(name, id, value)) return false;
    table.set(id, structuredClone(value)); return true;
  }
  private conflicts(name: Table, id: string, value: RecordValue) {
    return [...this.table(name).entries()].some(([key, other]) => {
      if (key === id) return false;
      if (name === 'requests') return open(value) && open(other) && (value as StoredOrgRequest).userId === (other as StoredOrgRequest).userId;
      if (name === 'invitations') { const a = value as StoredInvitation, b = other as StoredInvitation;
        return a.tokenHash === b.tokenHash || (open(a) && open(b) && a.orgId === b.orgId && a.email === b.email); }
      if (name === 'course_requests') { const a = value as StoredCourseRequest, b = other as StoredCourseRequest;
        return open(a) && open(b) && a.userId === b.userId && a.courseId === b.courseId; }
      return false;
    });
  }
  async update<K extends Table>(name: K, id: string, expected: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    const table = this.table(name), value = table.get(id);
    if (!value || !Object.entries(expected).every(([key, v]) => (value as unknown as Record<string, unknown>)[key] === v)) return false;
    const next = structuredClone({ ...value, ...patch }) as RecordValue;
    if (this.conflicts(name, id, next)) throw new OrganizationError(409, 'Conflicting organization state');
    table.set(id, next); return true;
  }
  async delete<K extends Table>(name: K, id: string, expected: Partial<Tables[K]>) {
    const value = this.table(name).get(id);
    if (!value || !Object.entries(expected).every(([key, v]) => (value as unknown as Record<string, unknown>)[key] === v)) return false;
    return this.table(name).delete(id);
  }
}

export type OrganizationCollection = Pick<Collection<Document & { _id: string }>, 'find' | 'insertOne' | 'updateOne' | 'deleteOne' | 'createIndex'>;
export type OrganizationCollections = (table: Table) => Promise<OrganizationCollection>;
class MongoStore implements Store {
  private ready = new Map<Table, Promise<OrganizationCollection>>();
  constructor(private collections: OrganizationCollections) {}
  private collection(table: Table) {
    let promise = this.ready.get(table);
    if (!promise) {
      promise = (async () => {
        const c = await this.collections(table);
        if (table === 'requests') await c.createIndex({ userId: 1 }, { unique: true, partialFilterExpression: { state: 'pending' } });
        if (table === 'invitations') {
          await c.createIndex({ orgId: 1, email: 1 }, { unique: true, partialFilterExpression: { open: true } });
          await c.createIndex({ tokenHash: 1 }, { unique: true });
        }
        if (table === 'course_requests') {
          await c.createIndex({ userId: 1, courseId: 1 }, { unique: true, partialFilterExpression: { state: 'pending' } });
          await c.createIndex({ orgId: 1 });
        }
        if (table === 'memberships') await c.createIndex({ orgId: 1 });
        return c;
      })();
      this.ready.set(table, promise);
      promise.catch(() => this.ready.delete(table));
    }
    return promise;
  }
  async list<K extends Table>(table: K, filter: Filter<K> = {}): Promise<Tables[K][]> {
    return (await (await this.collection(table)).find(filter as Document).toArray()).map(({ _id, open: _open, ...value }) => value as Tables[K]);
  }
  async get<K extends Table>(table: K, id: string) {
    const [found] = (await (await this.collection(table)).find({ _id: id }).toArray()).map(({ _id, open: _open, ...value }) => value as Tables[K]);
    return found ?? null;
  }
  async insert<K extends Table>(table: K, id: string, value: Tables[K]) {
    const collection = await this.collection(table);
    try { await protectCourseWrite(() => collection.insertOne({ ...value, _id: id, ...(table === 'invitations' ? { open: open(value) } : {}) })); return true; }
    catch (error) { if (error instanceof AmbiguousCourseWriteError && duplicate(error.cause)) return false; throw error; }
  }
  async update<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    const state = 'state' in patch ? { open: ['sent', 'not-sent'].includes(String(patch.state)) } : {};
    const collection = await this.collection(table);
    try {
      const result = await protectCourseWrite(() => collection.updateOne({ _id: id, ...expected }, { $set: { ...patch, ...(table === 'invitations' ? state : {}) } }));
      return result.matchedCount === 1;
    } catch (error) {
      if (error instanceof AmbiguousCourseWriteError && duplicate(error.cause)) throw new OrganizationError(409, 'Conflicting organization state');
      throw error;
    }
  }
  async delete<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>) {
    const collection = await this.collection(table);
    return (await protectCourseWrite(() => collection.deleteOne({ _id: id, ...expected }))).deletedCount === 1;
  }
}

class Repository implements OrganizationRepository {
  constructor(private store: Store, private lock: CourseMutationLock) {}
  async withOrganizationLock<T>(orgId: string, operation: () => Promise<T>): Promise<T> {
    try { return await this.lock.run(orgId, operation); }
    catch (error) { if (error instanceof CourseBusyError) throw new OrganizationError(409, 'Organization is being updated. Try again shortly.'); throw error; }
  }
  private async personalInvitations(userId: string, email?: string): Promise<StoredInvitation[]> {
    const accepted = await this.store.list('invitations', { acceptedBy: userId });
    const addressed = email?.trim() ? await this.store.list('invitations', { email: email.trim().toLowerCase() }) : [];
    return [...new Map([...accepted, ...addressed].map(value => [value.id, value])).values()];
  }
  async collectForExport(userId: string, email?: string): Promise<OrganizationPrivacyExport> {
    const [membership, requests, courseRequests, invitations] = await Promise.all([
      this.getMembership(userId), this.store.list('requests', { userId }), this.store.list('course_requests', { userId }), this.personalInvitations(userId, email),
    ]);
    const owned = membership?.role === 'owner' ? await this.getOrganization(membership.orgId) : null;
    return structuredClone({ membership: membership ? { userId: membership.userId, orgId: membership.orgId, role: membership.role,
      state: membership.state, careerId: membership.careerId, startedCourseIds: membership.startedCourseIds, consentAt: membership.consentAt, joinedAt: membership.joinedAt } : null, ownedOrganizations: owned ? [{ id: owned.id, displayName: owned.displayName }] : [],
      requests: requests.map(value => ({ id: value.id, userId: value.userId, state: value.state, displayName: value.displayName,
        companyName: value.companyName, cvr: value.cvr, billingEmail: value.billingEmail, message: value.message,
        declineReason: value.declineReason, submittedAt: value.submittedAt, decidedAt: value.decidedAt, organizationId: value.organizationId })),
      courseRequests: courseRequests.map(value => ({ id: value.id, orgId: value.orgId, userId: value.userId, userName: value.userName,
        courseId: value.courseId, state: value.state, addOnPriceDkk: value.addOnPriceDkk, createdAt: value.createdAt })),
      invitations: invitations.map(value => ({ id: value.id, orgId: value.orgId, email: value.email, state: value.state, expiresAt: value.expiresAt, createdAt: value.createdAt })),
    });
  }
  async erasureBlockers(userId: string): Promise<{ id: string; name: string }[]> {
    const membership = await this.getMembership(userId);
    if (membership?.role !== 'owner') return [];
    const organization = await this.getOrganization(membership.orgId);
    if (!organization) return [];
    // Billing has no separate state yet; an active owner requires transfer conservatively.
    if (organization.state === 'active' || (await this.listMembers(organization.id)).some(member => member.userId !== userId)) {
      return [{ id: organization.id, name: organization.displayName }];
    }
    return [];
  }
  async removeForUser(userId: string, email?: string): Promise<void> {
    await this.withOrganizationLock(`join:${userId}`, async () => {
      const membership = await this.getMembership(userId);
      const [invitations, requests, courseRequests, originals, billingContacts] = await Promise.all([
        this.personalInvitations(userId, email), this.store.list('requests', { userId }),
        this.store.list('course_requests', { userId }), this.store.list('organizations', { originalOwnerId: userId }),
        email?.trim() ? this.store.list('organizations', { billingEmail: email.trim().toLowerCase() }) : [],
      ]);
      const orgIds = [...new Set([...(membership ? [membership.orgId] : []), ...invitations.map(value => value.orgId),
        ...courseRequests.map(value => value.orgId), ...originals.map(value => value.id), ...billingContacts.map(value => value.id)])].sort();
      const locked = async (index: number): Promise<void> => {
        if (index < orgIds.length) return this.withOrganizationLock(orgIds[index], () => locked(index + 1));
        if ((await this.erasureBlockers(userId)).length) throw new OrganizationError(409, 'transfer-organization-first');
        // Delete invites before membership so interrupted joins cannot recreate access on replay.
        for (const invitation of invitations) await this.store.delete('invitations', invitation.id, {});
        for (const request of courseRequests) await this.store.delete('course_requests', request.id, { userId });
        for (const request of requests) await this.store.delete('requests', request.id, { userId });
        for (const organization of originals) await this.store.update('organizations', organization.id, { originalOwnerId: userId },
          { originalOwnerId: SYSTEM_ACCOUNT_ID });
        for (const organization of billingContacts) await this.store.update('organizations', organization.id, { billingEmail: organization.billingEmail }, { billingEmail: '' });
        if (membership) await this.deleteMembership(userId, membership.orgId);
      };
      await locked(0);
    });
  }
  async createRequest(v: StoredOrgRequest) { if (!await this.store.insert('requests', v.id, v)) throw new OrganizationError(409, 'An organization request is already pending'); }
  async findPendingOrLatestRequest(userId: string) { return (await this.store.list('requests', { userId })).sort((a,b) => Number(b.state === 'pending') - Number(a.state === 'pending') || b.submittedAt.localeCompare(a.submittedAt))[0] ?? null; }
  updateRequest(id: string, state: StoredOrgRequest['state'], patch: Partial<StoredOrgRequest>) { return this.store.update('requests', id, { state }, patch); }
  async listRequests(state?: string) { return this.store.list('requests', state ? { state: state as StoredOrgRequest['state'] } : {}); }
  async createOrganization(v: Organization) { if (!await this.store.insert('organizations', v.id, v)) throw new OrganizationError(409, 'Organization already exists'); }
  async deleteOrganization(id: string) { await this.store.delete('organizations', id, {}); }
  getOrganization(id: string) { return this.store.get('organizations', id); }
  listOrganizations() { return this.store.list('organizations'); }
  setOrganizationState(id: string, state: Organization['state']) { return this.store.update('organizations', id, {}, { state }); }
  insertMembership(v: OrganizationMembership) { return this.store.insert('memberships', v.userId, v); }
  getMembership(userId: string) { return this.store.get('memberships', userId); }
  listMembers(orgId: string) { return this.store.list('memberships', { orgId }); }
  updateMembership(userId: string, orgId: string, patch: Partial<OrganizationMembership>, state?: OrganizationMembership['state']) { return this.store.update('memberships', userId, { orgId, ...(state ? { state } : {}) }, patch); }
  deleteMembership(userId: string, orgId: string) { return this.store.delete('memberships', userId, { orgId }); }
  async createInvitation(v: StoredInvitation) { if (!await this.store.insert('invitations', v.id, v)) throw new OrganizationError(409, 'An open invitation already exists for this email'); }
  async findInvitationByTokenHash(hash: string) { return (await this.store.list('invitations', { tokenHash: hash }))[0] ?? null; }
  listInvitations(orgId?: string) { return this.store.list('invitations', orgId ? { orgId } : {}); }
  updateInvitation(id: string, state: StoredInvitation['state'], patch: Partial<StoredInvitation>, tokenHash?: string) { return this.store.update('invitations', id, { state, ...(tokenHash ? { tokenHash } : {}) }, patch); }
  createCourseRequest(v: StoredCourseRequest) { return this.store.insert('course_requests', v.id, v); }
  listCourseRequests(orgId: string) { return this.store.list('course_requests', { orgId }); }
  decideCourseRequest(id: string, state: 'approved' | 'declined') { return this.store.update('course_requests', id, { state: 'pending' }, { state }); }
  async getPrices(): Promise<Prices> { const result: Prices = { careers: {}, courses: {} }; for (const v of await this.store.list('prices')) result[v.kind][v.resourceId] = v.dkk; return result; }
  private async setPrice(kind: 'careers' | 'courses', resourceId: string, dkk: number | null) {
    const id = `${kind}:${resourceId}`;
    if (dkk === null) { await this.store.delete('prices', id, {}); return; }
    if (!await this.store.update('prices', id, {}, { dkk }) && !await this.store.insert('prices', id, { id, kind, resourceId, dkk })) await this.store.update('prices', id, {}, { dkk });
  }
  setCareerPrice(id: string, dkk: number | null) { return this.setPrice('careers', id, dkk); }
  setCoursePrice(id: string, dkk: number | null) { return this.setPrice('courses', id, dkk); }
}
export class InMemoryOrganizationRepository extends Repository { constructor() { super(new MemoryStore(), new InMemoryCourseMutationLock()); } }
const mongoCollections: OrganizationCollections = async table => (await getMongoDatabase()).collection(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_${table === 'organizations' ? 'organizations' : `organization_${table}`}`);
export class MongoOrganizationRepository extends Repository {
  constructor(collections: OrganizationCollections = mongoCollections, lock: CourseMutationLock = collections === mongoCollections
    ? new MongoCourseMutationLock(async () => (await getMongoDatabase()).collection(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_organization_locks`))
    : new InMemoryCourseMutationLock()) { super(new MongoStore(collections), lock); }
}
export function createOrganizationRepository(): OrganizationRepository { return hasMongoConfig() ? new MongoOrganizationRepository() : new InMemoryOrganizationRepository(); }
