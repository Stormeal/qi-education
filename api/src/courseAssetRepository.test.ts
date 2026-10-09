import { describe, expect, it, vi } from 'vitest';
import { Binary } from 'mongodb';
import {
  InMemoryCourseAssetRepository,
  MongoCourseAssetRepository,
  type CourseThumbnailAsset,
} from './courseAssetRepository.js';

describe('course asset repository', () => {
  it('stores and retrieves thumbnails in memory', async () => {
    const repository = new InMemoryCourseAssetRepository();

    const created = await repository.saveThumbnail({
      courseId: 'course-1',
      contentType: 'image/png',
      fileName: 'thumbnail.png',
      binary: Buffer.from('image-binary'),
    });
    const loaded = await repository.getThumbnail(created._id);

    expect(created.courseId).toBe('course-1');
    expect(created.contentType).toBe('image/png');
    expect(created.sizeBytes).toBe(Buffer.byteLength('image-binary'));
    expect(loaded).toEqual(created);
  });

  it('deletes thumbnails from memory', async () => {
    const repository = new InMemoryCourseAssetRepository();
    const created = await repository.saveThumbnail({
      courseId: 'course-1',
      contentType: 'image/jpeg',
      fileName: 'thumbnail.jpg',
      binary: Buffer.from('image-binary'),
    });

    await repository.deleteAsset(created._id, 'course-1');

    expect(await repository.getThumbnail(created._id)).toBeNull();
  });

  it('preserves another course asset when deletion is requested with a different course ID', async () => {
    const repository = new InMemoryCourseAssetRepository();
    const thumbnail = await repository.saveThumbnail({ courseId: 'course-1', contentType: 'image/png', fileName: 'one.png', binary: Buffer.from('image') });
    const attachment = await repository.saveComponentAttachment({ courseId: 'course-1', componentId: 'text-1', contentType: 'text/plain', fileName: 'one.txt', binary: Buffer.from('notes') });
    await repository.deleteAsset(thumbnail._id, 'course-2');
    await repository.deleteAsset(attachment._id, 'course-2');
    expect(await repository.getThumbnail(thumbnail._id)).toEqual(thumbnail);
    expect(await repository.getComponentAttachment(attachment._id)).toEqual(attachment);
    await repository.deleteAsset(attachment._id, 'course-1');
    expect(await repository.getComponentAttachment(attachment._id)).toBeNull();
  });

  it('scopes Mongo asset deletion to the course ID at the database boundary', async () => {
    const deleteOne = vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 });
    const repository = new MongoCourseAssetRepository(async () => ({ findOne: vi.fn(), insertOne: vi.fn(), deleteOne }) as never);
    await repository.deleteAsset('foreign-asset', 'owned-course');
    expect(deleteOne).toHaveBeenCalledWith({ _id: 'foreign-asset', courseId: 'owned-course' });
  });

  it('inserts thumbnails into Mongo storage', async () => {
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'asset-1' });
    const repository = new MongoCourseAssetRepository(async () => ({
      findOne: vi.fn(),
      insertOne,
      deleteOne: vi.fn(),
    }) as never);

    const created = await repository.saveThumbnail({
      courseId: 'course-1',
      contentType: 'image/webp',
      fileName: 'thumbnail.webp',
      binary: Buffer.from('image-binary'),
    });

    expect(insertOne).toHaveBeenCalledOnce();
    expect(created._id).toEqual(expect.any(String));
    expect(created.createdAt).toEqual(expect.any(String));
  });

  it('loads thumbnails from Mongo storage', async () => {
    const asset: CourseThumbnailAsset = {
      _id: 'asset-1',
      courseId: 'course-1',
      contentType: 'image/png',
      fileName: 'thumbnail.png',
      sizeBytes: 11,
      binary: Buffer.from('image-binary'),
      createdAt: '2026-05-24T12:00:00.000Z',
    };
    const findOne = vi.fn().mockResolvedValue(asset);
    const repository = new MongoCourseAssetRepository(async () => ({
      findOne,
      insertOne: vi.fn(),
      deleteOne: vi.fn(),
    }) as never);

    expect(await repository.getThumbnail('asset-1')).toEqual(asset);
    expect(findOne).toHaveBeenCalledWith({ _id: 'asset-1' });
  });

  it('normalizes BSON binary values loaded from Mongo storage', async () => {
    const findOne = vi.fn().mockResolvedValue({
      _id: 'asset-1',
      courseId: 'course-1',
      contentType: 'image/png',
      fileName: 'thumbnail.png',
      sizeBytes: 11,
      binary: new Binary(Buffer.from('image-binary')),
      createdAt: '2026-05-24T12:00:00.000Z',
    });
    const repository = new MongoCourseAssetRepository(async () => ({
      findOne,
      insertOne: vi.fn(),
      deleteOne: vi.fn(),
    }) as never);

    const loaded = await repository.getThumbnail('asset-1');

    expect(Buffer.isBuffer(loaded?.binary)).toBe(true);
    expect(loaded?.binary.equals(Buffer.from('image-binary'))).toBe(true);
  });
});
