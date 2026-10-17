import { beforeEach, describe, expect, it, vi } from 'vitest';
import { courseFromSheetRow, courseSheetHeaders, courseToSheetRow, createCourseSchema, decodeCourseSheetCell } from './course.js';
import { GoogleSheetsCourseRepository } from './courseRepository.js';

const sheet = vi.hoisted(() => ({ rows: [] as string[][] }));
vi.mock('./googleSheets.js', () => ({
  ensureWorksheetHeaders: async () => undefined,
  createSheetsClient: () => ({ spreadsheets: { values: {
    get: async () => ({ data: { values: structuredClone(sheet.rows) } }),
    update: async (request: { requestBody: { values: string[][] } }) => { sheet.rows[1] = request.requestBody.values[0]; },
  } } }),
}));
const course = {
  ...createCourseSchema.parse({ title: 'Rollback course', description: 'Preserve all course details', level: 'Beginner', teacher: 'Teacher' }),
  id: 'rollback', createdAt: '2026-10-17T00:00:00.000Z', ownerUserId: ' padded owner ',
  rating: 4.25, languages: ['English', 'English'] as ('English')[],
  careerGoals: ['One, two', 'qi-course-cell:v1:not-an-escape'],
  requirements: ['One\ntwo', ' padded requirement '], whatYoullLearn: ['', ' trailing '],
};
beforeEach(() => { sheet.rows = [[...courseSheetHeaders], courseToSheetRow(course, { lossless: true })]; });

describe('US-P015 lossless rollback rows', () => {
  it('preserves all fields without changing the ordinary default serialization', () => {
    expect(courseFromSheetRow(sheet.rows[1])).toEqual(course);
    const legacy = courseToSheetRow(course);
    expect(legacy[16]).toBe('4.3');
    expect(legacy[5]).toBe('One, two, qi-course-cell:v1:not-an-escape');
    expect(courseFromSheetRow(legacy).rating).toBe(4.3);
    const ordinary = { ...course, ownerUserId: 'owner', rating: 4.2, languages: ['English'] as ('English')[],
      careerGoals: ['Testing'], requirements: ['Learn testing'], whatYoullLearn: ['Test APIs'] };
    expect(courseToSheetRow(ordinary, { lossless: true })).toEqual(courseToSheetRow(ordinary));
  });
  it('escapes literal marker prefixes in lists and owner IDs', () => {
    const literal = { ...course, ownerUserId: 'qi-course-cell:v1:literal', careerGoals: ['qi-course-cell:v1:literal'],
      requirements: ['qi-course-cell:v1:literal'], whatYoullLearn: ['qi-course-cell:v1:literal'] };
    expect(courseFromSheetRow(courseToSheetRow(literal, { lossless: true }))).toEqual(literal);
    const defaultRow = courseToSheetRow(literal);
    expect(courseFromSheetRow(defaultRow).careerGoals).toEqual(literal.careerGoals);
    expect(courseFromSheetRow(defaultRow).ownerUserId).toEqual(literal.ownerUserId);
    const legacyRow = courseToSheetRow({ ...literal, careerGoals: ['Testing'] });
    legacyRow[5] = 'qi-course-cell:v1:literal';
    expect(courseFromSheetRow(legacyRow).careerGoals).toEqual(['qi-course-cell:v1:literal']);
  });
  it.each([
    { field: 'rating', value: 6 }, { field: 'rating', value: '4.25' },
    { field: 'languages', value: ['French'] }, { field: 'careerGoals', value: [42] },
    { field: 'ownerUserId', value: null }, { field: 'wrong-field', value: 4.25 },
  ])('rejects malformed typed escapes: $field', payload => {
    const bad = [...sheet.rows[1]];
    const field = payload.field === 'wrong-field' ? 'rating' : payload.field;
    bad[courseSheetHeaders.indexOf(field as typeof courseSheetHeaders[number])] =
      'qi-course-cell:v1:' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(() => decodeCourseSheetCell(field, bad[courseSheetHeaders.indexOf(field as typeof courseSheetHeaders[number])], { strict: true })).toThrow();
  });
  it.each(['metadata', 'price', 'catalog', 'thumbnail'])('retains restored fields after a subsequent Sheets %s edit', async kind => {
    const repository = new GoogleSheetsCourseRepository();
    if (kind === 'metadata') await repository.updateCourse(course.id, { ...course, title: 'Updated title' });
    if (kind === 'price') await repository.updateCoursePrice(course.id, { priceDkk: 500 });
    if (kind === 'catalog') await repository.updateCourseCatalogMetadata(course.id, {
      isPremium: true, isBestseller: false, rating: course.rating, ratingCount: 5, category: 'API Testing', languages: course.languages,
    });
    if (kind === 'thumbnail') await repository.updateCourseThumbnail(course.id, { thumbnailAssetId: 'new-thumbnail' });
    expect((await repository.listCourses())[0]).toMatchObject({
      ownerUserId: course.ownerUserId, rating: course.rating, languages: course.languages,
      careerGoals: course.careerGoals, requirements: course.requirements, whatYoullLearn: course.whatYoullLearn,
    });
  });
});
