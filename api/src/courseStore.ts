import type { CourseRepository, CourseSeed } from './courseRepository.js';
import type { CreateCourseInput, UpdateCourseInput, UpdateCoursePriceInput, UpdateCourseCatalogMetadataInput, UpdateCourseThumbnailInput } from './course.js';

export class CourseReadOnlyError extends Error {
  constructor() { super('Course details are briefly read-only for maintenance. Try again in a few minutes.'); }
}
export class CourseStoreUnavailableError extends Error {
  constructor() { super('Course details storage is unavailable.'); }
}
export class ReadOnlyCourseRepository implements CourseRepository {
  readonly readOnly = true;
  constructor(private readonly repository: CourseRepository) {}
  get storageType() { return this.repository.storageType; }
  listCourses(options?: { recent?: boolean }) { return this.repository.listCourses(options); }
  async createCourse(_input: CreateCourseInput, _seed?: CourseSeed): Promise<never> { throw new CourseReadOnlyError(); }
  async updateCourse(_id: string, _input: UpdateCourseInput): Promise<never> { throw new CourseReadOnlyError(); }
  async updateCoursePrice(_id: string, _input: UpdateCoursePriceInput): Promise<never> { throw new CourseReadOnlyError(); }
  async updateCourseCatalogMetadata(_id: string, _input: UpdateCourseCatalogMetadataInput): Promise<never> { throw new CourseReadOnlyError(); }
  async updateCourseThumbnail(_id: string, _input: UpdateCourseThumbnailInput): Promise<never> { throw new CourseReadOnlyError(); }
}
export function courseWriteFreeze(repository: CourseRepository, enabled: boolean): CourseRepository {
  return enabled && !repository.readOnly ? new ReadOnlyCourseRepository(repository) : repository;
}
export class UnavailableCourseRepository implements CourseRepository {
  readonly storageType = 'mongodb';
  async listCourses(): Promise<never> { throw new CourseStoreUnavailableError(); }
  async createCourse(_input: CreateCourseInput, _seed?: CourseSeed): Promise<never> { throw new CourseStoreUnavailableError(); }
  async updateCourse(_id: string, _input: UpdateCourseInput): Promise<never> { throw new CourseStoreUnavailableError(); }
  async updateCoursePrice(_id: string, _input: UpdateCoursePriceInput): Promise<never> { throw new CourseStoreUnavailableError(); }
  async updateCourseCatalogMetadata(_id: string, _input: UpdateCourseCatalogMetadataInput): Promise<never> { throw new CourseStoreUnavailableError(); }
  async updateCourseThumbnail(_id: string, _input: UpdateCourseThumbnailInput): Promise<never> { throw new CourseStoreUnavailableError(); }
}
