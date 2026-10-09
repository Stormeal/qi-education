import { describe, expect, it } from 'vitest';
import { courseFromSheetRow, courseToSheetRow, type Course } from './course.js';

describe('course sheet mapping', () => {
  it('round-trips the full course shape through sheet rows', () => {
    const course: Course = {
      id: 'course-1',
      ownerUserId: 'teacher-1',
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
      thumbnailAssetId: 'asset-1',
      isPremium: true,
      isBestseller: true,
      rating: 4.7,
      ratingCount: 128,
      category: 'API Testing',
      languages: ['English', 'Danish'],
    };

    expect(courseFromSheetRow(courseToSheetRow(course))).toEqual(course);
  });

  it('defaults legacy rows without category/languages columns', () => {
    const legacyRow = courseToSheetRow({
      id: 'legacy-1',
      ownerUserId: '',
      title: 'Legacy Course',
      description: 'Created before the catalog filter fields existed.',
      level: 'Beginner',
      partOfCareer: '',
      teacher: 'Teacher Demo',
      careerGoals: [],
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      requirements: [],
      whatYoullLearn: [],
      audience: '',
      priceDkk: null,
      thumbnailAssetId: '',
      isPremium: false,
      isBestseller: false,
      rating: 0,
      ratingCount: 0,
      category: 'Uncategorized',
      languages: [],
    }).slice(0, 18);

    const parsed = courseFromSheetRow(legacyRow);

    expect(parsed.category).toBe('Uncategorized');
    expect(parsed.languages).toEqual([]);
  });

  it('drops unknown languages when parsing a sheet row', () => {
    const row = courseToSheetRow({
      id: 'lang-1',
      ownerUserId: '',
      title: 'Language Parsing',
      description: 'Verifies language column parsing.',
      level: 'Beginner',
      partOfCareer: '',
      teacher: 'Teacher Demo',
      careerGoals: [],
      status: 'published',
      createdAt: '2026-01-01T00:00:00.000Z',
      requirements: [],
      whatYoullLearn: [],
      audience: '',
      priceDkk: null,
      thumbnailAssetId: '',
      isPremium: false,
      isBestseller: false,
      rating: 0,
      ratingCount: 0,
      category: 'Uncategorized',
      languages: ['English'],
    });
    row[19] = 'English, Klingon, Danish';

    expect(courseFromSheetRow(row).languages).toEqual(['English', 'Danish']);
  });
});
