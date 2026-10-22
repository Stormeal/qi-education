import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import type { CourseRepository, CourseSeed } from './courseRepository.js';
import { courseFields, createCourseSchema, updateCourseSchema, updateCourseCatalogMetadataSchema,
  type Course, type CreateCourseInput, type UpdateCourseInput, type UpdateCoursePriceInput,
  type UpdateCourseCatalogMetadataInput, type UpdateCourseThumbnailInput } from './course.js';
import { apiConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type MongoCourseDocument = Omit<Course, 'id'> & { _id: string };
export type MongoCourseCollection = Pick<Collection<MongoCourseDocument>, 'find' | 'insertOne' | 'findOneAndUpdate' | 'createIndex'>;
const majority = { writeConcern: { w: 'majority' as const } };
function dto(document: MongoCourseDocument): Course {
  return structuredClone(Object.fromEntries(courseFields.map(field => [field, field === 'id' ? document._id : document[field]])) as Course);
}
function fields(input: object, allowed: string[]): Partial<Omit<Course, 'id' | 'createdAt'>> {
  return structuredClone(Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key))));
}
export class MongoCourseRepository implements CourseRepository {
  readonly storageType = 'mongodb';
  private index: Promise<unknown> | undefined;
  constructor(private readonly collection: () => Promise<MongoCourseCollection> = async () =>
    (await getMongoDatabase()).collection<MongoCourseDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_courses`)) {}

  async listCourses(_options?: { recent?: boolean }): Promise<Course[]> {
    return (await (await this.collection()).find().sort({ createdAt: 1, _id: 1 }).toArray()).map(dto);
  }
  async createCourse(input: CreateCourseInput, seed?: CourseSeed): Promise<Course> {
    const collection = await this.collection();
    this.index ??= collection.createIndex({ createdAt: 1, _id: 1 }).catch(error => { this.index = undefined; throw error; });
    await this.index;
    const document = { ...fields(input, Object.keys(createCourseSchema.shape)), _id: seed?.id ?? randomUUID(),
      createdAt: seed?.createdAt ?? new Date().toISOString(), ownerUserId: seed?.ownerUserId ?? '',
      ...(seed?.teacherIds !== undefined ? { teacherIds: [...seed.teacherIds], ownerUserId: seed.teacherIds[0] ?? '' } : {}) } as MongoCourseDocument;
    const result = await collection.insertOne(document, majority);
    if (!result.acknowledged) throw new Error('Course creation was not confirmed.');
    return dto(document);
  }
  updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
    return this.update(id, fields(input, Object.keys(updateCourseSchema.shape)));
  }
  updateCoursePrice(id: string, input: UpdateCoursePriceInput): Promise<Course | null> { return this.update(id, { priceDkk: input.priceDkk }); }
  updateCourseTeachers(id: string, teacherIds: string[]): Promise<Course | null> {
    return this.update(id, { teacherIds: [...teacherIds], ownerUserId: teacherIds[0] ?? '' });
  }
  updateCourseThumbnail(id: string, input: UpdateCourseThumbnailInput): Promise<Course | null> { return this.update(id, { thumbnailAssetId: input.thumbnailAssetId }); }
  updateCourseCatalogMetadata(id: string, input: UpdateCourseCatalogMetadataInput): Promise<Course | null> {
    return this.update(id, fields(input, Object.keys(updateCourseCatalogMetadataSchema.shape)));
  }
  private async update(id: string, input: Partial<Omit<Course, 'id' | 'createdAt'>>): Promise<Course | null> {
    const document = await (await this.collection()).findOneAndUpdate({ _id: id }, { $set: input },
      { returnDocument: 'after', includeResultMetadata: false, ...majority });
    return document ? dto(document) : null;
  }
}
