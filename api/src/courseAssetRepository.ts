import { randomUUID } from 'node:crypto';
import { Binary, type Collection } from 'mongodb';
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
type StoredCourseThumbnailAsset = Omit<CourseThumbnailAsset, 'binary'> & {
  binary: Buffer | Binary | Uint8Array;
};

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
    const asset = await (await this.collection()).findOne({ _id: assetId });

    return asset ? normalizeStoredThumbnailAsset(asset as StoredCourseThumbnailAsset) : null;
  }

  async deleteAsset(assetId: string): Promise<void> {
    await (await this.collection()).deleteOne({ _id: assetId });
  }
}

function normalizeStoredThumbnailAsset(asset: StoredCourseThumbnailAsset): CourseThumbnailAsset {
  if (Buffer.isBuffer(asset.binary)) {
    return asset as CourseThumbnailAsset;
  }

  if (asset.binary instanceof Binary) {
    return {
      ...asset,
      binary: Buffer.from(asset.binary.buffer),
    };
  }

  return {
    ...asset,
    binary: Buffer.from(asset.binary),
  };
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
