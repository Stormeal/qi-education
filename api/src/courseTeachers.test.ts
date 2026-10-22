import { describe, expect, it } from 'vitest';
import { courseTeacherIds, createCourseSchema } from './course.js';
import { InMemoryCourseRepository } from './courseRepository.js';
import { ReadOnlyCourseRepository, UnavailableCourseRepository } from './courseStore.js';
import { courseRequestReads, requestCachedCourses } from './courseRequestReads.js';
import { reviewedRepositories } from './courseReview.js';
import { InMemoryCourseContentRepository } from './courseContentRepository.js';
import { InMemoryCourseAssetRepository } from './courseAssetRepository.js';

const metadata = createCourseSchema.parse({ title: 'Course teachers',
  description: 'An isolated course for teacher assignment.', teacher: 'Display name', level: 'Beginner' });

describe('US-A005 teacher storage', () => {
  it('US-A005-AC06 reads an old course as its owner alone and respects an explicit empty list', () => {
    expect(courseTeacherIds({ ownerUserId: 'T' })).toEqual(['T']);
    expect(courseTeacherIds({ ownerUserId: '' })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: 'T', teacherIds: [] })).toEqual([]);
    expect(courseTeacherIds({ ownerUserId: 'B', teacherIds: ['B', 'A'] })).toEqual(['B', 'A']);
  });

  it('stores a seeded list, replaces it in order and clears the owner mirror with an empty list', async () => {
    const repository = new InMemoryCourseRepository();
    expect(await repository.createCourse(metadata, { id: 'c', createdAt: 'x', ownerUserId: 'ignored', teacherIds: ['A'] }))
      .toMatchObject({ teacherIds: ['A'], ownerUserId: 'A' });
    expect(await repository.updateCourseTeachers('c', ['B', 'A'])).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect((await repository.listCourses()).find(course => course.id === 'c'))
      .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
    expect(await repository.updateCourseTeachers('c', [])).toMatchObject({ teacherIds: [], ownerUserId: '' });
    expect(await repository.updateCourseTeachers('missing', [])).toBeNull();
  });

  it('refuses teacher writes through read-only and unavailable stores', async () => {
    await expect(new ReadOnlyCourseRepository(new InMemoryCourseRepository()).updateCourseTeachers('c', []))
      .rejects.toThrow('read-only');
    await expect(new UnavailableCourseRepository().updateCourseTeachers('c', [])).rejects.toThrow('unavailable');
  });

  it('refreshes request reads and keeps assignment outside the review snapshots', async () => {
    const stored = new InMemoryCourseRepository();
    const content = new InMemoryCourseContentRepository();
    await stored.createCourse({ ...metadata, status: 'published' }, { id: 'c', createdAt: 'x', ownerUserId: 'A' });
    const cached = requestCachedCourses(stored);
    const { courses, review } = reviewedRepositories(cached, content, new InMemoryCourseAssetRepository());
    await courseRequestReads.run({ reads: new Map(), reuseRecent: true }, async () => {
      await courses.listCourses();
      expect(await courses.updateCourseTeachers('c', ['B', 'A']))
        .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B', status: 'published' });
      expect((await courses.listCourses()).find(course => course.id === 'c'))
        .toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
      expect((await review.state('c')).course).toMatchObject({ teacherIds: ['B', 'A'], ownerUserId: 'B' });
      expect(await courses.updateCourseTeachers('missing', [])).toBeNull();
      expect(await content.getCourseContent('c')).toBeNull();
    });
  });
});
