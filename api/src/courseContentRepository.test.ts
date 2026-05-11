import { describe, expect, it, vi } from 'vitest';
import type { CourseContentSection } from './courseContent.js';
import {
  InMemoryCourseContentRepository,
  MongoCourseContentRepository,
  type CourseContentDocument,
} from './courseContentRepository.js';

describe('course content repository', () => {
  it('creates and retrieves empty content in memory', async () => {
    const repository = new InMemoryCourseContentRepository();

    const created = await repository.createEmptyCourseContent('course-1');
    const loaded = await repository.getCourseContent('course-1');

    expect(created._id).toBe('course-1');
    expect(created.sections).toEqual([]);
    expect(created.createdAt).toEqual(expect.any(String));
    expect(loaded).toEqual(created);
  });

  it('updates existing content in memory without changing createdAt', async () => {
    const repository = new InMemoryCourseContentRepository();
    const original = await repository.createEmptyCourseContent('course-1');
    const sections = [sampleSection()];

    const updated = await repository.updateCourseContent('course-1', sections);

    expect(updated._id).toBe('course-1');
    expect(updated.sections).toEqual(sections);
    expect(updated.createdAt).toBe(original.createdAt);
    expect(updated.updatedAt >= original.updatedAt).toBe(true);
  });

  it('inserts a new Mongo document when updating missing content', async () => {
    const findOne = vi.fn().mockResolvedValueOnce(null);
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true, insertedId: 'course-1' });
    const updateOne = vi.fn();
    const repository = new MongoCourseContentRepository(async () => ({
      findOne,
      insertOne,
      updateOne,
      deleteOne: vi.fn(),
    }) as never);

    const updated = await repository.updateCourseContent('course-1', [sampleSection()]);

    expect(findOne).toHaveBeenCalledWith({ _id: 'course-1' });
    expect(insertOne).toHaveBeenCalledOnce();
    expect(updateOne).not.toHaveBeenCalled();
    expect(updated._id).toBe('course-1');
    expect(updated.sections).toEqual([sampleSection()]);
  });

  it('updates an existing Mongo document in place', async () => {
    const existing: CourseContentDocument = {
      _id: 'course-1',
      sections: [],
      createdAt: '2026-05-11T12:00:00.000Z',
      updatedAt: '2026-05-11T12:00:00.000Z',
    };
    const findOne = vi.fn().mockResolvedValueOnce(existing);
    const insertOne = vi.fn();
    const updateOne = vi.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1, modifiedCount: 1 });
    const repository = new MongoCourseContentRepository(async () => ({
      findOne,
      insertOne,
      updateOne,
      deleteOne: vi.fn(),
    }) as never);
    const sections = [sampleSection()];

    const updated = await repository.updateCourseContent('course-1', sections);

    expect(insertOne).not.toHaveBeenCalled();
    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'course-1' },
      {
        $set: {
          sections,
          updatedAt: expect.any(String),
        },
      },
    );
    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.sections).toEqual(sections);
  });

  it('deletes content from the Mongo collection', async () => {
    const deleteOne = vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 1 });
    const repository = new MongoCourseContentRepository(async () => ({
      findOne: vi.fn(),
      insertOne: vi.fn(),
      updateOne: vi.fn(),
      deleteOne,
    }) as never);

    await repository.deleteCourseContent('course-1');

    expect(deleteOne).toHaveBeenCalledWith({ _id: 'course-1' });
  });
});

function sampleSection(): CourseContentSection {
  return {
    id: 'section-1',
    title: 'Chapter 1',
    components: [
      {
        id: 'component-1',
        title: 'Intro video',
        type: 'video',
        durationMinutes: 5,
        content: 'A short overview of the course.',
        resourceUrl: 'https://example.com/video',
      },
    ],
  };
}
