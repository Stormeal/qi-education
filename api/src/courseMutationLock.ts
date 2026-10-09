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
}

export class InMemoryCourseMutationLock implements CourseMutationLock {
  private readonly held = new Set<string>();
  async run<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + 5000;
    while (this.held.has(courseId)) {
      if (Date.now() >= deadline) throw new CourseBusyError();
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    this.held.add(courseId);
    try { return await operation(); }
    finally { this.held.delete(courseId); }
  }
}

// Vercel's extended Node 22 maximum is 30 minutes (checked 2026-10-09).
// Revisit before deploying to a host with a longer invocation lifetime.
export const courseLockExpiryMs = 31 * 60 * 1000;
export type CourseMutationLockDocument = { _id: string; owner: string; acquiredAt: string };
type LockCollection = Pick<Collection<CourseMutationLockDocument>, 'findOne' | 'insertOne' | 'deleteOne'>;

function acquisitionTime(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === normalized ? parsed : NaN;
}

export class MongoCourseMutationLock implements CourseMutationLock {
  constructor(private readonly collectionLoader: () => Promise<LockCollection>) {}
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
