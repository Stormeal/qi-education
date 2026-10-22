import { randomUUID } from 'node:crypto';
import { apiConfig, getServicesMode, hasMongoConfig } from './config.js';
import { MongoCourseRepository } from './mongoCourseRepository.js';
import { courseWriteFreeze, UnavailableCourseRepository } from './courseStore.js';
export { MongoCourseRepository } from './mongoCourseRepository.js';
import {
  type Course,
  type CreateCourseInput,
  type UpdateCourseCatalogMetadataInput,
  type UpdateCourseInput,
  type UpdateCoursePriceInput,
  type UpdateCourseThumbnailInput,
} from './course.js';

export interface CourseRepository {
  readonly storageType: 'memory' | 'mongodb';
  readonly readOnly?: boolean;
  /** Optional hint for read reuse; MongoDB currently reads fresh on every call. */
  listCourses(options?: { recent?: boolean }): Promise<Course[]>;
  createCourse(input: CreateCourseInput, seed?: CourseSeed): Promise<Course>;
  updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null>;
  updateCoursePrice(id: string, input: UpdateCoursePriceInput): Promise<Course | null>;
  updateCourseTeachers(id: string, teacherIds: string[]): Promise<Course | null>;
  updateCourseCatalogMetadata(id: string, input: UpdateCourseCatalogMetadataInput): Promise<Course | null>;
  updateCourseThumbnail(id: string, input: UpdateCourseThumbnailInput): Promise<Course | null>;
}

export type CourseSeed = {
  id: string;
  createdAt: string;
  ownerUserId?: string;
  teacherIds?: string[];
};

export class InMemoryCourseRepository implements CourseRepository {
  readonly storageType: CourseRepository['storageType'] = 'memory';
  private readonly courses: Course[] = [
    {
      id: 'demo-course-1',
      ownerUserId: '',
      title: 'Career Discovery Workshop',
      description: 'Map existing strengths, learning gaps, and practical next steps.',
      requirements: ['An interest in structured learning', 'A current or target career goal'],
      whatYoullLearn: ['How to evaluate a new career path', 'How to map skills to practical next steps'],
      audience: 'Learners who want a clear starting point for choosing a practical education path.',
      level: 'Beginner',
      partOfCareer: 'QA Foundations',
      teacher: 'QI Academy',
      careerGoals: ['Career change', 'Skill mapping'],
      status: 'published',
      createdAt: new Date().toISOString(),
      priceDkk: null,
      thumbnailAssetId: '',
      isPremium: false,
      isBestseller: false,
      rating: 0,
      ratingCount: 0,
      category: 'Software Testing',
      languages: ['English'],
    }
  ];

  async listCourses(): Promise<Course[]> {
    return this.courses;
  }

  async createCourse(input: CreateCourseInput, seed?: CourseSeed): Promise<Course> {
    const course: Course = {
      ...input,
      id: seed?.id ?? randomUUID(),
      ownerUserId: seed?.ownerUserId ?? '',
      ...(seed?.teacherIds !== undefined ? { teacherIds: [...seed.teacherIds], ownerUserId: seed.teacherIds[0] ?? '' } : {}),
      createdAt: seed?.createdAt ?? new Date().toISOString()
    };

    this.courses.push(course);
    return course;
  }

  async updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const current = this.courses[index];
    const updated: Course = {
      ...current,
      ...input,
      id: current.id,
      ownerUserId: current.ownerUserId,
      createdAt: current.createdAt
    };

    this.courses[index] = updated;
    return updated;
  }

  async updateCoursePrice(id: string, input: UpdateCoursePriceInput): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const updated: Course = {
      ...this.courses[index],
      priceDkk: input.priceDkk,
    };

    this.courses[index] = updated;
    return updated;
  }

  async updateCourseTeachers(id: string, teacherIds: string[]): Promise<Course | null> {
    const index = this.courses.findIndex(course => course.id === id);
    if (index < 0) return null;
    const updated = { ...this.courses[index], teacherIds: [...teacherIds], ownerUserId: teacherIds[0] ?? '' };
    this.courses[index] = updated;
    return updated;
  }

  async updateCourseCatalogMetadata(
    id: string,
    input: UpdateCourseCatalogMetadataInput,
  ): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const updated: Course = {
      ...this.courses[index],
      ...input,
    };

    this.courses[index] = updated;
    return updated;
  }

  async updateCourseThumbnail(id: string, input: UpdateCourseThumbnailInput): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const updated: Course = {
      ...this.courses[index],
      thumbnailAssetId: input.thumbnailAssetId,
    };

    this.courses[index] = updated;
    return updated;
  }
}

export function createCourseRepository(): CourseRepository {
  return courseWriteFreeze(selectCourseRepository(), apiConfig.COURSE_STORE_READ_ONLY === '1');
}
function selectCourseRepository(): CourseRepository {
  if (getServicesMode() === 'isolated') return new InMemoryCourseRepository();
  return hasMongoConfig() ? new MongoCourseRepository() : new UnavailableCourseRepository();
}
