import { protectCourseWrite } from './courseMutationLock.js';
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

export type CourseComponentAttachmentAsset = {
  _id: string;
  courseId: string;
  componentId: string;
  contentType: string;
  fileName: string;
  sizeBytes: number;
  binary: Buffer;
  createdAt: string;
};

type CourseAssetCollection = Pick<
  Collection<CourseThumbnailAsset | CourseComponentAttachmentAsset>,
  'findOne' | 'insertOne' | 'deleteOne'
>;
type StoredCourseAsset<T extends { binary: Buffer }> = Omit<T, 'binary'> & {
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
  saveComponentAttachment(input: {
    courseId: string;
    componentId: string;
    contentType: string;
    fileName: string;
    binary: Buffer;
  }): Promise<CourseComponentAttachmentAsset>;
  getComponentAttachment(assetId: string): Promise<CourseComponentAttachmentAsset | null>;
  deleteAsset(assetId: string, courseId: string): Promise<void>;
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

    const collection = await this.collection();
    await protectCourseWrite(() => collection.insertOne(asset));
    return asset;
  }

  async getThumbnail(assetId: string): Promise<CourseThumbnailAsset | null> {
    const asset = await (await this.collection()).findOne({ _id: assetId });

    return asset && !('componentId' in asset)
      ? normalizeStoredAsset(asset as StoredCourseAsset<CourseThumbnailAsset>)
      : null;
  }

  async saveComponentAttachment(input: {
    courseId: string;
    componentId: string;
    contentType: string;
    fileName: string;
    binary: Buffer;
  }): Promise<CourseComponentAttachmentAsset> {
    const asset: CourseComponentAttachmentAsset = {
      _id: randomUUID(),
      courseId: input.courseId,
      componentId: input.componentId,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: input.binary.byteLength,
      binary: input.binary,
      createdAt: new Date().toISOString(),
    };

    const collection = await this.collection();
    await protectCourseWrite(() => collection.insertOne(asset));
    return asset;
  }

  async getComponentAttachment(assetId: string): Promise<CourseComponentAttachmentAsset | null> {
    const asset = await (await this.collection()).findOne({ _id: assetId });

    return asset && 'componentId' in asset
      ? normalizeStoredAsset(asset as StoredCourseAsset<CourseComponentAttachmentAsset>)
      : null;
  }

  async deleteAsset(assetId: string, courseId: string): Promise<void> {
    const collection = await this.collection();
    await protectCourseWrite(() => collection.deleteOne({ _id: assetId, courseId }));
  }
}

function normalizeStoredAsset<T extends { binary: Buffer }>(asset: StoredCourseAsset<T>): T {
  if (Buffer.isBuffer(asset.binary)) {
    return asset as T;
  }

  if (asset.binary instanceof Binary) {
    return {
      ...asset,
      binary: Buffer.from(asset.binary.buffer),
    } as T;
  }

  return {
    ...asset,
    binary: Buffer.from(asset.binary),
  } as T;
}

export class InMemoryCourseAssetRepository implements CourseAssetRepository {
  readonly storageType = 'memory';
  private readonly assets = new Map<string, CourseThumbnailAsset>();
  private readonly componentAssets = new Map<string, CourseComponentAttachmentAsset>();

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

  async saveComponentAttachment(input: {
    courseId: string;
    componentId: string;
    contentType: string;
    fileName: string;
    binary: Buffer;
  }): Promise<CourseComponentAttachmentAsset> {
    const asset: CourseComponentAttachmentAsset = {
      _id: randomUUID(),
      courseId: input.courseId,
      componentId: input.componentId,
      contentType: input.contentType,
      fileName: input.fileName,
      sizeBytes: input.binary.byteLength,
      binary: input.binary,
      createdAt: new Date().toISOString(),
    };

    this.componentAssets.set(asset._id, asset);
    return asset;
  }

  async getComponentAttachment(assetId: string): Promise<CourseComponentAttachmentAsset | null> {
    return this.componentAssets.get(assetId) ?? null;
  }

  async deleteAsset(assetId: string, courseId: string): Promise<void> {
    if (this.assets.get(assetId)?.courseId === courseId) this.assets.delete(assetId);
    if (this.componentAssets.get(assetId)?.courseId === courseId) this.componentAssets.delete(assetId);
  }
}

export function createCourseAssetRepository(): CourseAssetRepository {
  if (!apiConfig.MONGODB_URI || !apiConfig.MONGODB_DB_NAME || !apiConfig.MONGODB_COURSE_ASSET_COLLECTION) {
    return new InMemoryCourseAssetRepository();
  }

  return new MongoCourseAssetRepository(async () =>
    (await getMongoDatabase()).collection<CourseThumbnailAsset | CourseComponentAttachmentAsset>(
      apiConfig.MONGODB_COURSE_ASSET_COLLECTION!,
    ),
  );
}
