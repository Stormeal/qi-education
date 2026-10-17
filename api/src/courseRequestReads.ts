import { AsyncLocalStorage } from 'node:async_hooks';
import type { CourseRepository } from './courseRepository.js';

// Results live only for this HTTP request. Refresh after acquiring a write lock
// and after a write so pre-lock authorization never supplies a stale snapshot.
// GET requests may also reuse a recent catalog read (INV-005); a lock or write ends that.
export const courseRequestReads = new AsyncLocalStorage<{ reads: Map<object, Promise<unknown>>; reuseRecent: boolean }>();
export function clearCourseRequestReads() {
  const store = courseRequestReads.getStore();
  if (store) { store.reads.clear(); store.reuseRecent = false; }
}
export function requestCachedCourses(repository: CourseRepository): CourseRepository {
  return new Proxy(repository, {
    get(target, property) {
      if (property === 'listCourses') return () => {
        const store = courseRequestReads.getStore();
        if (!store) return target.listCourses();
        if (!store.reads.has(target)) store.reads.set(target, target.listCourses({ recent: store.reuseRecent }));
        return store.reads.get(target);
      };
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        try { return await value.apply(target, args); }
        finally { clearCourseRequestReads(); }
      };
    },
  });
}
