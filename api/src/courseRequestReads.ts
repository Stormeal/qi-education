import { AsyncLocalStorage } from 'node:async_hooks';
import type { CourseRepository } from './courseRepository.js';

// Results live only for this HTTP request. Refresh after acquiring a write lock
// and after a write so pre-lock authorization never supplies a stale snapshot.
export const courseRequestReads = new AsyncLocalStorage<Map<object, Promise<unknown>>>();
export function clearCourseRequestReads() { courseRequestReads.getStore()?.clear(); }
export function requestCachedCourses(repository: CourseRepository): CourseRepository {
  return new Proxy(repository, {
    get(target, property) {
      if (property === 'listCourses') return () => {
        const cache = courseRequestReads.getStore();
        if (!cache) return target.listCourses();
        if (!cache.has(target)) cache.set(target, target.listCourses());
        return cache.get(target);
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
