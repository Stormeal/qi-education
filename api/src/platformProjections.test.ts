import { describe, expect, it, vi } from 'vitest';
import { MongoCourseAssetRepository } from './courseAssetRepository.js';
import { MongoCourseContentRepository } from './courseContentRepository.js';
import { InFlightRead } from './inFlightRead.js';

describe('US-P006 Mongo transfer boundaries', () => {
  it('AC04 projects course ownership without binary bytes and filters attachment type', async () => {
    const findOne = vi.fn().mockResolvedValue({ courseId: 'owned' });
    const assets = new MongoCourseAssetRepository(async () => ({ findOne }) as never);
    expect(await assets.getComponentAttachmentOwner('asset')).toEqual({ courseId: 'owned' });
    expect(findOne).toHaveBeenCalledWith({ _id: 'asset', componentId: { $exists: true } }, { projection: { _id: 0, courseId: 1 } });
    findOne.mockResolvedValue(null);
    expect(await assets.getComponentAttachmentOwner('thumbnail-or-missing')).toBeNull();
  });
  it('AC05 performs one batch query that selects metadata/status only', async () => {
    const docs = [{ _id: 'one', review: { liveStatus: 'published', live: { metadata: { title: 'Reviewed title' } } } }];
    const find = vi.fn(() => ({ toArray: async () => docs }));
    const content = new MongoCourseContentRepository(async () => ({ find }) as never);
    expect(await content.listCourseReviewSummaries(['one', 'two'])).toEqual(docs);
    expect(find).toHaveBeenCalledWith({ _id: { $in: ['one', 'two'] } }, { projection: {
      _id: 1, 'review.liveStatus': 1, 'review.live.metadata': 1, 'review.working.metadata': 1, 'review.working.status': 1,
    } });
    expect(await content.listCourseReviewSummaries([])).toEqual([]);
    expect(find).toHaveBeenCalledOnce();
  });
});

describe('concurrent-only read sharing', () => {
  it('does not retain errors or successful results and invalidates overlapping old fetches', async () => {
    const read = new InFlightRead<number>();
    const failure = vi.fn(async () => { throw new Error('Quota'); });
    const a = read.run(failure), b = read.run(failure);
    expect(a).toBe(b);
    await expect(a).rejects.toThrow('Quota');
    expect(failure).toHaveBeenCalledOnce();
    await expect(read.run(async () => 2)).resolves.toBe(2);
    await expect(read.run(async () => 3)).resolves.toBe(3);
    let release!: (value: number) => void;
    const old = read.run(() => new Promise(resolve => { release = resolve; }));
    read.invalidate();
    const fresh = read.run(async () => 5);
    release(4);
    expect(await old).toBe(4); expect(await fresh).toBe(5);
  });
});
