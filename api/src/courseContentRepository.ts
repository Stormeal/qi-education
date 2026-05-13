import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfig } from './config.js';
import type { CourseContentSection } from './courseContent.js';
import { getMongoDatabase } from './mongo.js';

export type CourseContentDocument = {
  _id: string;
  sections: CourseContentSection[];
  createdAt: string;
  updatedAt: string;
};

export type CourseContentStorageType = 'memory' | 'mongodb';

type CourseContentCollection = Pick<
  Collection<CourseContentDocument>,
  'findOne' | 'insertOne' | 'updateOne' | 'deleteOne'
>;

export interface CourseContentRepository {
  readonly storageType: CourseContentStorageType;
  checkHealth(): Promise<void>;
  getCourseContent(courseId: string): Promise<CourseContentDocument | null>;
  createEmptyCourseContent(courseId: string, createdAt?: string): Promise<CourseContentDocument>;
  updateCourseContent(courseId: string, sections: CourseContentSection[]): Promise<CourseContentDocument>;
  deleteCourseContent(courseId: string): Promise<void>;
}

export class MongoCourseContentRepository implements CourseContentRepository {
  readonly storageType = 'mongodb';

  constructor(private readonly collectionLoader: () => Promise<CourseContentCollection>) {}

  private async collection() {
    return this.collectionLoader();
  }

  async checkHealth(): Promise<void> {
    await (await this.collection()).findOne({ _id: '__course_content_healthcheck__' });
  }

  async getCourseContent(courseId: string): Promise<CourseContentDocument | null> {
    return (await (await this.collection()).findOne({ _id: courseId })) ?? null;
  }

  async createEmptyCourseContent(courseId: string, createdAt?: string): Promise<CourseContentDocument> {
    const now = createdAt ?? new Date().toISOString();
    const document: CourseContentDocument = {
      _id: courseId,
      sections: [],
      createdAt: now,
      updatedAt: now,
    };

    await (await this.collection()).insertOne(document);
    return document;
  }

  async updateCourseContent(
    courseId: string,
    sections: CourseContentSection[],
  ): Promise<CourseContentDocument> {
    const collection = await this.collection();
    const existing = await collection.findOne({ _id: courseId });
    const now = new Date().toISOString();

    if (!existing) {
      const created: CourseContentDocument = {
        _id: courseId,
        sections,
        createdAt: now,
        updatedAt: now,
      };

      await collection.insertOne(created);
      return created;
    }

    await collection.updateOne(
      { _id: courseId },
      {
        $set: {
          sections,
          updatedAt: now,
        },
      },
    );

    return {
      ...existing,
      sections,
      updatedAt: now,
    };
  }

  async deleteCourseContent(courseId: string): Promise<void> {
    await (await this.collection()).deleteOne({ _id: courseId });
  }
}

export class InMemoryCourseContentRepository implements CourseContentRepository {
  readonly storageType = 'memory';
  private readonly documents = new Map<string, CourseContentDocument>();

  async checkHealth(): Promise<void> {
    return;
  }

  async getCourseContent(courseId: string): Promise<CourseContentDocument | null> {
    return this.documents.get(courseId) ?? null;
  }

  async createEmptyCourseContent(courseId: string, createdAt?: string): Promise<CourseContentDocument> {
    const now = createdAt ?? new Date().toISOString();
    const document: CourseContentDocument = {
      _id: courseId,
      sections: [],
      createdAt: now,
      updatedAt: now,
    };

    this.documents.set(courseId, document);
    return document;
  }

  async updateCourseContent(
    courseId: string,
    sections: CourseContentSection[],
  ): Promise<CourseContentDocument> {
    const existing = this.documents.get(courseId);
    const now = new Date().toISOString();
    const document: CourseContentDocument = existing
      ? {
          ...existing,
          sections,
          updatedAt: now,
        }
      : {
          _id: courseId,
          sections,
          createdAt: now,
          updatedAt: now,
        };

    this.documents.set(courseId, document);
    return document;
  }

  async deleteCourseContent(courseId: string): Promise<void> {
    this.documents.delete(courseId);
  }
}

export function createCourseContentRepository(): CourseContentRepository {
  if (!hasMongoConfig()) {
    return new InMemoryCourseContentRepository();
  }

  const collectionName = apiConfig.MONGODB_COURSE_CONTENT_COLLECTION;

  if (!collectionName) {
    throw new Error('MONGODB_COURSE_CONTENT_COLLECTION is required to access course content.');
  }

  return new MongoCourseContentRepository(async () =>
    (await getMongoDatabase()).collection<CourseContentDocument>(collectionName),
  );
}
