import type { Collection, Document } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';
import { OrganizationError, type Organization, type OrganizationMembership, type Prices,
  type StoredOrgRequest, type StoredInvitation, type StoredCourseRequest } from './organization.js';

export interface OrganizationRepository {
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
interface Store {
  list<K extends Table>(table: K): Promise<Tables[K][]>;
  insert<K extends Table>(table: K, id: string, value: Tables[K]): Promise<boolean>;
  update<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>, patch: Partial<Tables[K]>): Promise<boolean>;
  delete<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>): Promise<boolean>;
}
const duplicate = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
const open = (value: RecordValue) => 'state' in value && ['pending', 'sent', 'not-sent'].includes(value.state);

class MemoryStore implements Store {
  private tables = new Map<Table, Map<string, RecordValue>>();
  private table(name: Table) { let table = this.tables.get(name); if (!table) this.tables.set(name, table = new Map()); return table; }
  async list<K extends Table>(name: K): Promise<Tables[K][]> { return structuredClone([...this.table(name).values()]) as Tables[K][]; }
  async insert<K extends Table>(name: K, id: string, value: Tables[K]) {
    const table = this.table(name);
    const conflicts = [...table.values()].some(other => {
      if (name === 'requests') return open(value) && open(other) && (value as StoredOrgRequest).userId === (other as StoredOrgRequest).userId;
      if (name === 'invitations') { const a = value as StoredInvitation, b = other as StoredInvitation;
        return a.tokenHash === b.tokenHash || (open(a) && open(b) && a.orgId === b.orgId && a.email === b.email); }
      if (name === 'course_requests') { const a = value as StoredCourseRequest, b = other as StoredCourseRequest;
        return open(a) && open(b) && a.userId === b.userId && a.courseId === b.courseId; }
      return false;
    });
    if (table.has(id) || conflicts) return false;
    table.set(id, structuredClone(value)); return true;
  }
  async update<K extends Table>(name: K, id: string, expected: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    const table = this.table(name), value = table.get(id);
    if (!value || !Object.entries(expected).every(([key, v]) => (value as unknown as Record<string, unknown>)[key] === v)) return false;
    table.set(id, structuredClone({ ...value, ...patch }) as RecordValue); return true;
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
        if (table === 'course_requests') await c.createIndex({ userId: 1, courseId: 1 }, { unique: true, partialFilterExpression: { state: 'pending' } });
        return c;
      })();
      this.ready.set(table, promise);
      promise.catch(() => this.ready.delete(table));
    }
    return promise;
  }
  async list<K extends Table>(table: K): Promise<Tables[K][]> {
    return (await (await this.collection(table)).find({}).toArray()).map(({ _id, open: _open, ...value }) => value as Tables[K]);
  }
  async insert<K extends Table>(table: K, id: string, value: Tables[K]) {
    try { await (await this.collection(table)).insertOne({ ...value, _id: id, ...(table === 'invitations' ? { open: open(value) } : {}) }); return true; }
    catch (error) { if (duplicate(error)) return false; throw error; }
  }
  async update<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    const state = 'state' in patch ? { open: ['sent', 'not-sent'].includes(String(patch.state)) } : {};
    const result = await (await this.collection(table)).updateOne({ _id: id, ...expected }, { $set: { ...patch, ...(table === 'invitations' ? state : {}) } });
    return result.matchedCount === 1;
  }
  async delete<K extends Table>(table: K, id: string, expected: Partial<Tables[K]>) {
    return (await (await this.collection(table)).deleteOne({ _id: id, ...expected })).deletedCount === 1;
  }
}

class Repository implements OrganizationRepository {
  constructor(private store: Store) {}
  async createRequest(v: StoredOrgRequest) { if (!await this.store.insert('requests', v.id, v)) throw new OrganizationError(409, 'An organization request is already pending'); }
  async findPendingOrLatestRequest(userId: string) { return (await this.store.list('requests')).filter(v => v.userId === userId).sort((a,b) => Number(b.state === 'pending') - Number(a.state === 'pending') || b.submittedAt.localeCompare(a.submittedAt))[0] ?? null; }
  updateRequest(id: string, state: StoredOrgRequest['state'], patch: Partial<StoredOrgRequest>) { return this.store.update('requests', id, { state }, patch); }
  async listRequests(state?: string) { return (await this.store.list('requests')).filter(v => !state || v.state === state); }
  async createOrganization(v: Organization) { if (!await this.store.insert('organizations', v.id, v)) throw new OrganizationError(409, 'Organization already exists'); }
  async deleteOrganization(id: string) { await this.store.delete('organizations', id, {}); }
  async getOrganization(id: string) { return (await this.store.list('organizations')).find(v => v.id === id) ?? null; }
  listOrganizations() { return this.store.list('organizations'); }
  setOrganizationState(id: string, state: Organization['state']) { return this.store.update('organizations', id, {}, { state }); }
  insertMembership(v: OrganizationMembership) { return this.store.insert('memberships', v.userId, v); }
  async getMembership(userId: string) { return (await this.store.list('memberships')).find(v => v.userId === userId) ?? null; }
  async listMembers(orgId: string) { return (await this.store.list('memberships')).filter(v => v.orgId === orgId); }
  updateMembership(userId: string, orgId: string, patch: Partial<OrganizationMembership>, state?: OrganizationMembership['state']) { return this.store.update('memberships', userId, { orgId, ...(state ? { state } : {}) }, patch); }
  deleteMembership(userId: string, orgId: string) { return this.store.delete('memberships', userId, { orgId }); }
  async createInvitation(v: StoredInvitation) { if (!await this.store.insert('invitations', v.id, v)) throw new OrganizationError(409, 'An open invitation already exists for this email'); }
  async findInvitationByTokenHash(hash: string) { return (await this.store.list('invitations')).find(v => v.tokenHash === hash) ?? null; }
  async listInvitations(orgId?: string) { return (await this.store.list('invitations')).filter(v => !orgId || v.orgId === orgId); }
  updateInvitation(id: string, state: StoredInvitation['state'], patch: Partial<StoredInvitation>, tokenHash?: string) { return this.store.update('invitations', id, { state, ...(tokenHash ? { tokenHash } : {}) }, patch); }
  createCourseRequest(v: StoredCourseRequest) { return this.store.insert('course_requests', v.id, v); }
  async listCourseRequests(orgId: string) { return (await this.store.list('course_requests')).filter(v => v.orgId === orgId); }
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
export class InMemoryOrganizationRepository extends Repository { constructor() { super(new MemoryStore()); } }
export class MongoOrganizationRepository extends Repository {
  constructor(collections: OrganizationCollections = async table => (await getMongoDatabase()).collection(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_${table === 'organizations' ? 'organizations' : `organization_${table}`}`)) { super(new MongoStore(collections)); }
}
export function createOrganizationRepository(): OrganizationRepository { return hasMongoConfig() ? new MongoOrganizationRepository() : new InMemoryOrganizationRepository(); }
