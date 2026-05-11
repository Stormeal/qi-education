import { describe, expect, it } from 'vitest';
import { courseFromSheetRow, courseToSheetRow, type Course } from './course.js';

describe('course sheet mapping', () => {
  it('round-trips the full course shape through sheet rows', () => {
    const course: Course = {
      id: 'course-1',
      title: 'API Automation Foundations',
      description: 'Learn API testing from the ground up.',
      level: 'Intermediate',
      teacher: 'Teacher Demo',
      careerGoals: ['Automation', 'API testing'],
      status: 'ready-for-review',
      createdAt: '2026-05-08T20:00:00.000Z',
      requirements: ['Basic testing experience', 'Comfort reading API documentation'],
      audience: 'QA professionals moving into API automation.',
    };

    expect(courseFromSheetRow(courseToSheetRow(course))).toEqual(course);
  });
});
