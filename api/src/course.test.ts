import { describe, expect, it } from 'vitest';
import { courseFromSheetRow, courseToSheetRow, type Course } from './course.js';

describe('course sheet mapping', () => {
  it('round-trips the full course shape through sheet rows', () => {
    const course: Course = {
      id: 'course-1',
      title: 'API Automation Foundations',
      description: 'Learn API testing from the ground up.',
      level: 'Intermediate',
      partOfCareer: 'Automation Engineering',
      teacher: 'Teacher Demo',
      careerGoals: ['Automation', 'API testing'],
      status: 'ready-for-review',
      createdAt: '2026-05-08T20:00:00.000Z',
      requirements: ['Basic testing experience', 'Comfort reading API documentation'],
      whatYoullLearn: ['Create stable API checks', 'Report automation results clearly'],
      audience: 'QA professionals moving into API automation.',
      priceDkk: 2495,
    };

    expect(courseFromSheetRow(courseToSheetRow(course))).toEqual(course);
  });
});
