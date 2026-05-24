import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { apiConfig } from './config.js';
import { getMongoDatabase } from './mongo.js';

export type CourseAssetStorageType = 'memory' | 'mongodb';

export type CourseThumbnailAsset = {
  _id: string;
  courseId: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
  sizeBytes: number;
  binary: Buffer;
  createdAt: string;
};

type CourseAssetCollection = Pick<
  Collection<CourseThumbnailAsset>,
  'findOne' | 'insertOne' | 'deleteOne'
>;

export interface CourseAssetRepository {
  readonly storageType: CourseAssetStorageType;
  checkHealth(): Promise<void>;
  saveThumbnail(input: {
    courseId: string;
    contentType: CourseThumbnailAsset['contentType'];
    fileName: string;
    binary: Buffer;
  }): Promise<CourseThumbnailAsset>;
  getThumbnail(assetId: string): Promise<CourseThumbnailAsset | null>;
  deleteAsset(assetId: string): Promise<void>;
}

export class MongoCourseAssetRepository implements CourseAssetRepository {
  readonly storageType = 'mongodb';

  constructor(private readonly collectionLoader: () => Promise<CourseAssetCollection>) {}

  private async collection() {
    return this.collectionLoader();
  }

  async checkHealth(): Promise<void> {
    await (await this.collection()).findOne({ _id: '__course_asset_healthcheck__' });
  }

  async saveThumbnail(input: {
    courseId: string;
    contentType: CourseThumbnailAsset['contentType'];
    fileName: string;
    binary: Buffer;
  }): Promise<CourseThumbnailAsset> {
    const asset: CourseThumbnailAsset = {
      _id: randomUUID(),
      courseId: input.courseId,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: input.binary.byteLength,
      binary: input.binary,
      createdAt: new Date().toISOString(),
    };

    await (await this.collection()).insertOne(asset);
    return asset;
  }

  async getThumbnail(assetId: string): Promise<CourseThumbnailAsset | null> {
    return (await (await this.collection()).findOne({ _id: assetId })) ?? null;
  }

  async deleteAsset(assetId: string): Promise<void> {
    await (await this.collection()).deleteOne({ _id: assetId });
  }
}

export class InMemoryCourseAssetRepository implements CourseAssetRepository {
  readonly storageType = 'memory';
  private readonly assets = new Map<string, CourseThumbnailAsset>();

  async checkHealth(): Promise<void> {
    return;
  }

  async saveThumbnail(input: {
    courseId: string;
    contentType: CourseThumbnailAsset['contentType'];
    fileName: string;
    binary: Buffer;
  }): Promise<CourseThumbnailAsset> {
    const asset: CourseThumbnailAsset = {
      _id: randomUUID(),
      courseId: input.courseId,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: input.binary.byteLength,
      binary: input.binary,
      createdAt: new Date().toISOString(),
    };

    this.assets.set(asset._id, asset);
    return asset;
  }

  async getThumbnail(assetId: string): Promise<CourseThumbnailAsset | null> {
    return this.assets.get(assetId) ?? null;
  }

  async deleteAsset(assetId: string): Promise<void> {
    this.assets.delete(assetId);
  }
}

export function createCourseAssetRepository(): CourseAssetRepository {
  if (!apiConfig.MONGODB_URI || !apiConfig.MONGODB_DB_NAME || !apiConfig.MONGODB_COURSE_ASSET_COLLECTION) {
    return new InMemoryCourseAssetRepository();
  }

  return new MongoCourseAssetRepository(async () =>
    (await getMongoDatabase()).collection<CourseThumbnailAsset>(apiConfig.MONGODB_COURSE_ASSET_COLLECTION!),
  );
}
