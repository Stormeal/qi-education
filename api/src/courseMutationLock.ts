import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';

export class CourseBusyError extends Error {
  constructor() { super('This course is being updated. Please try again shortly.'); }
}

export class AmbiguousCourseWriteError extends Error {
  constructor(cause: unknown) { super('Course write outcome is uncertain; verified recovery is required.', { cause }); }
}

export async function protectCourseWrite<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) { throw new AmbiguousCourseWriteError(error); }
}

async function beforeDeadline<T>(operation: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new CourseBusyError()), Math.max(0, deadline - Date.now()));
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export interface CourseMutationLock {
  run<T>(courseId: string, operation: () => Promise<T>): Promise<T>;
  list(): Promise<CourseMutationLockInfo[]>;
}

export class InMemoryCourseMutationLock implements CourseMutationLock {
  private readonly held = new Map<string, CourseMutationLockDocument>();
  async list(): Promise<CourseMutationLockInfo[]> { return lockInfo([...this.held.values()]); }
  async run<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + 5000;
    while (this.held.has(courseId)) {
      if (Date.now() >= deadline) throw new CourseBusyError();
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    this.held.set(courseId, { _id: courseId, owner: randomUUID(), acquiredAt: new Date().toISOString() });
    try { return await operation(); }
    finally { this.held.delete(courseId); }
  }
}

// Vercel's extended Node 22 maximum is 30 minutes (checked 2026-10-09).
// Revisit before deploying to a host with a longer invocation lifetime.
export const courseLockExpiryMs = 31 * 60 * 1000;
export type CourseMutationLockDocument = { _id: string; owner: string; acquiredAt: string };
export type CourseMutationLockInfo = {
  courseId: string; owner: string; acquiredAt: string | null; expiresAt: string | null;
  state: 'held' | 'expired' | 'needs-recovery';
};
type LockCollection = Pick<Collection<CourseMutationLockDocument>, 'find' | 'findOne' | 'insertOne' | 'deleteOne'>;

function acquisitionTime(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === normalized ? parsed : NaN;
}

export class MongoCourseMutationLock implements CourseMutationLock {
  constructor(private readonly collectionLoader: () => Promise<LockCollection>) {}
  async list(): Promise<CourseMutationLockInfo[]> {
    const deadline = Date.now() + 5000;
    const collection = await beforeDeadline(this.collectionLoader(), deadline);
    return lockInfo(await beforeDeadline(collection.find({}, { timeoutMS: Math.max(1, deadline - Date.now()) }).toArray(), deadline));
  }
  async run<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const owner = randomUUID();
    const deadline = Date.now() + 5000;
    const collection = await beforeDeadline(this.collectionLoader(), deadline);
    while (true) {
      if (Date.now() >= deadline) throw new CourseBusyError();
      try {
        await beforeDeadline(collection.insertOne(
          { _id: courseId, owner, acquiredAt: new Date().toISOString() },
          { writeConcern: { w: 'majority' }, timeoutMS: Math.max(1, deadline - Date.now()) },
        ), deadline);
        break;
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) {
          // Insertion may still finish remotely; never enter or transfer ownership.
          console.error('Course lock acquisition requires verified recovery if ownership was recorded.', { courseId, owner });
          throw error;
        }
        const held = await beforeDeadline(collection.findOne({ _id: courseId },
          { timeoutMS: Math.max(1, deadline - Date.now()) }), deadline);
        const acquiredAt = acquisitionTime(held?.acquiredAt);
        if (held && Number.isFinite(acquiredAt) && acquiredAt + courseLockExpiryMs <= Date.now()) {
          const result = await beforeDeadline(collection.deleteOne(
            { _id: courseId, owner: held.owner, acquiredAt: held.acquiredAt },
            { writeConcern: { w: 'majority' }, timeoutMS: Math.max(1, deadline - Date.now()) },
          ), deadline);
          if (!result.acknowledged) throw new Error('Expired course ownership removal was not confirmed.');
          if (result.deletedCount) console.info('Expired course operation ownership released.', { courseId, owner: held.owner });
          continue;
        }
        if (Date.now() >= deadline) throw new CourseBusyError();
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    // Preserve uncertain ownership until the host-duration bound. Previously
    // accepted provider writes still need operational outcome reconciliation.
    let release = true;
    try { return await operation(); }
    catch (error) {
      if (error instanceof AmbiguousCourseWriteError) {
        release = false;
        console.error('Course write requires verified recovery.', { courseId, owner });
      }
      throw error;
    } finally {
      if (release) {
        try {
          await beforeDeadline(collection.deleteOne({ _id: courseId, owner },
            { writeConcern: { w: 'majority' }, timeoutMS: 5000 }), Date.now() + 5000);
        } catch (error) {
          console.error('Course lock release requires verified recovery.', { courseId, owner });
          throw error;
        }
      }
    }
  }
}

function lockInfo(documents: CourseMutationLockDocument[]): CourseMutationLockInfo[] {
  const now = Date.now();
  return documents.map(document => {
    const acquired = acquisitionTime(document.acquiredAt), valid = Number.isFinite(acquired);
    const expires = acquired + courseLockExpiryMs;
    const info: CourseMutationLockInfo = {
      courseId: document._id, owner: document.owner,
      acquiredAt: typeof document.acquiredAt === 'string' ? document.acquiredAt : null,
      expiresAt: valid ? new Date(expires).toISOString() : null,
      state: !valid ? 'needs-recovery' : expires <= now ? 'expired' : 'held',
    };
    return { time: valid ? acquired : -Infinity, info };
  }).sort((a, b) => a.time === b.time ? 0 : a.time - b.time).map(entry => entry.info);
}
