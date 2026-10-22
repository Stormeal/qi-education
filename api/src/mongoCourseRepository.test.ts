import { describe, expect, it, vi } from 'vitest';
import { InMemoryCourseRepository, type CourseRepository } from './courseRepository.js';
import { MongoCourseRepository } from './mongoCourseRepository.js';
import { createCourseSchema, updateCourseSchema, type UpdateCourseInput } from './course.js';
import { fakeCourseCollection } from '../test/fakeCourseCollection.js';

const input = createCourseSchema.parse({ title: 'Full course', description: 'All twenty-one fields survive.', teacher: 'Teacher', level: 'Advanced',
  careerGoals: ['Automation', 'Quality'], status: 'published', requirements: ['Experience'], whatYoullLearn: ['Testing skills'], audience: 'Testers',
  priceDkk: 700, partOfCareer: 'QA', thumbnailAssetId: 'thumb', isPremium: true, isBestseller: true,
  rating: 4.7, ratingCount: 42, category: 'Automation Testing', languages: ['Danish', 'English'] });
const seed = { id: 'course', createdAt: '2030-01-01T00:00:00.000Z', ownerUserId: 'teacher' };

describe.each(['memory', 'mongo'])('US-P015 CourseRepository contract (%s)', kind => {
  function setup(): { repository: CourseRepository; fake: ReturnType<typeof fakeCourseCollection> } {
    const fake = fakeCourseCollection();
    return { repository: kind === 'memory' ? new InMemoryCourseRepository() : new MongoCourseRepository(async () => fake.collection), fake };
  }
  it('AC02 preserves all fields/seeds and supplies defaults for generated identity/date/owner', async () => {
    const { repository } = setup();
    expect(await repository.createCourse(input, seed)).toEqual({ ...input, ...seed });
    expect((await repository.listCourses()).find(course => course.id === seed.id)).toEqual({ ...input, ...seed });
    expect(await repository.createCourse(input)).toMatchObject({ ...input, id: expect.any(String), createdAt: expect.any(String), ownerUserId: '' });
  });
  it('AC02 updates only the chosen fields and preserves identity, owner, created date and concurrent catalog edits', async () => {
    const { repository } = setup();
    await repository.createCourse(input, seed);
    const edited = updateCourseSchema.parse({ ...input, title: 'Edited title' });
    const catalog = { isPremium: false, isBestseller: false, rating: 4.9, ratingCount: 43, category: 'API Testing' as const, languages: ['English' as const] };
    await Promise.all([repository.updateCourse(seed.id, { ...edited, id: 'forged', createdAt: 'forged', ownerUserId: 'forged' } as UpdateCourseInput), repository.updateCourseCatalogMetadata(seed.id, catalog)]);
    await Promise.all([repository.updateCoursePrice(seed.id, { priceDkk: null }), repository.updateCourseThumbnail(seed.id, { thumbnailAssetId: 'new-thumb' })]);
    expect((await repository.listCourses()).find(course => course.id === seed.id)).toEqual({ ...input, ...seed, title: 'Edited title', ...catalog, priceDkk: null, thumbnailAssetId: 'new-thumb' });
    for (const call of [() => repository.updateCourse('missing', edited), () => repository.updateCoursePrice('missing', { priceDkk: null }),
      () => repository.updateCourseThumbnail('missing', { thumbnailAssetId: '' }), () => repository.updateCourseCatalogMetadata('missing', catalog)]) expect(await call()).toBeNull();
  });
  it('AC02 retains oldest-first order for courses added in sheet order', async () => {
    const { repository } = setup();
    for (const [id, date] of [['a', '2030-01-01'], ['b', '2030-01-01'], ['c', '2030-01-02']]) {
      await repository.createCourse(input, { id, createdAt: date, ownerUserId: '' });
    }
    expect((await repository.listCourses()).filter(course => ['a', 'b', 'c'].includes(course.id)).map(course => course.id)).toEqual(['a', 'b', 'c']);
  });
  it('US-A005-AC06 preserves legacy owners and stores teacher lists with the first teacher mirrored', async () => {
    const { repository, fake } = setup();
    const legacy = await repository.createCourse(input, seed);
    expect(legacy.ownerUserId).toBe('teacher');
    expect(legacy.teacherIds).toBeUndefined();
    expect(await repository.createCourse(input, { ...seed, id: 'seeded', teacherIds: ['B', 'A'] }))
      .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect(await repository.updateCourseTeachers(seed.id, ['A', 'B']))
      .toMatchObject({ teacherIds: ['A', 'B'], ownerUserId: 'A' });
    expect((await repository.listCourses()).find(course => course.id === seed.id))
      .toMatchObject({ teacherIds: ['A', 'B'], ownerUserId: 'A' });
    if (kind === 'mongo') expect(fake.calls.writes).toContainEqual({ filter: { _id: seed.id },
      update: { $set: { teacherIds: ['A', 'B'], ownerUserId: 'A' } },
      options: { returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' } } });
    expect(await repository.updateCourseTeachers(seed.id, [])).toMatchObject({ teacherIds: [], ownerUserId: '' });
    expect(await repository.updateCourseTeachers('missing', [])).toBeNull();
  });
});

describe('US-P015 Mongo storage semantics', () => {
  it('AC01 ignores recent option, sorts by createdAt/id and isolates returned snapshots', async () => {
    const fake = fakeCourseCollection(), repository = new MongoCourseRepository(async () => fake.collection);
    for (const [id, createdAt] of [['c', '2030-01-02'], ['b', '2030-01-01'], ['a', '2030-01-01']]) await repository.createCourse(input, { id, createdAt });
    const first = await repository.listCourses({ recent: true });
    first[0].title = 'Mutated'; first[0].languages.length = 0;
    expect((await repository.listCourses({ recent: true })).map(course => course.id)).toEqual(['a', 'b', 'c']);
    expect((await repository.listCourses())[0]).toMatchObject({ title: input.title, languages: input.languages });
    expect(fake.calls.reads).toBe(3); expect(fake.calls.sorts).toEqual(Array(3).fill({ createdAt: 1, _id: 1 }));
    expect(fake.calls.indexes).toContainEqual({ createdAt: 1, _id: 1 });
  });
  it('uses majority data writes and propagates storage errors', async () => {
    const fake = fakeCourseCollection(), repository = new MongoCourseRepository(async () => fake.collection);
    await repository.createCourse(input, seed); await repository.updateCoursePrice(seed.id, { priceDkk: 999 });
    expect(fake.calls.writes).toEqual(expect.arrayContaining([
      expect.objectContaining({ options: { writeConcern: { w: 'majority' } } }),
      expect.objectContaining({ update: { $set: { priceDkk: 999 } }, options: expect.objectContaining({ writeConcern: { w: 'majority' } }) }),
    ]));
    vi.spyOn(fake.operations, 'insertOne').mockResolvedValueOnce({ acknowledged: false });
    await expect(repository.createCourse(input)).rejects.toThrow('not confirmed');
    const unavailable = new MongoCourseRepository(async () => { throw new Error('Offline'); });
    await expect(unavailable.listCourses()).rejects.toThrow('Offline');
    await expect(unavailable.updateCourseThumbnail(seed.id, { thumbnailAssetId: '' })).rejects.toThrow('Offline');
  });
});
