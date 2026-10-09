import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleSheetsAuthRepository } from './authRepository.js';
import { GoogleSheetsCourseRepository } from './courseRepository.js';
import { GoogleSheetsFeedbackRepository } from './feedbackRepository.js';
import { authSheetHeaders, type AuthUser, toAuthenticatedUser } from './auth.js';
import { courseSheetHeaders, createCourseSchema } from './course.js';
import { feedbackSheetHeaders } from './feedback.js';

const stub = vi.hoisted(() => ({ rows: new Map<string, string[][]>(), modes: [] as string[] }));
vi.mock('./googleSheets.js', () => {
  function convert(values: unknown[][], mode: string) {
    stub.modes.push(mode);
    return values.map(row => row.map(value => {
      const text = String(value);
      if (mode === 'RAW') return text;
      // Minimal Sheets USER_ENTERED emulation: formula evaluation and number coercion.
      if (text === '=1+1') return '2';
      if (/^[+-]?\d+$/.test(text)) return String(Number(text));
      return text;
    }));
  }
  return { ensureWorksheetHeaders: async () => {}, createSheetsClient: () => ({ spreadsheets: { values: {
    get: async ({ range }: { range: string }) => ({ data: { values: structuredClone(stub.rows.get(range.split('!')[0]) ?? []) } }),
    append: async ({ range, valueInputOption, requestBody }: { range: string; valueInputOption: string; requestBody: { values: unknown[][] } }) => {
      stub.rows.get(range.split('!')[0])!.push(...convert(requestBody.values, valueInputOption)); return {};
    },
    update: async ({ range, valueInputOption, requestBody }: { range: string; valueInputOption: string; requestBody: { values: unknown[][] } }) => {
      const match = /!([A-Z]+)(\d+):/.exec(range)!;
      const col = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      const row = stub.rows.get(range.split('!')[0])![Number(match[2]) - 1];
      row.splice(col, requestBody.values[0].length, ...convert(requestBody.values, valueInputOption)[0]); return {};
    },
  } } }) };
});
beforeEach(() => {
  stub.rows.clear(); stub.modes.length = 0;
  stub.rows.set('Users', [[...authSheetHeaders]]); stub.rows.set('Courses', [[...courseSheetHeaders]]);
  stub.rows.set('Feedback', [[...feedbackSheetHeaders]]);
});

describe('INV-009 / US-P007-AC03/04 literal spreadsheet round trips', () => {
  it.each(['=1+1', '007', '+01', '-01', '@name'])('preserves %s in all nine data writes', async text => {
    const auth = new GoogleSheetsAuthRepository(), courses = new GoogleSheetsCourseRepository(), feedback = new GoogleSheetsFeedbackRepository();
    const user: AuthUser = { id: 'user', email: 'user@example.test', displayName: text, passwordHash: 'hash', role: 'student', status: 'active', createdAt: '2026-10-09', enrolledCourseIds: [] };
    await auth.createUser(user);
    const names = [(await auth.findById('user'))!.displayName];
    await auth.enrollUserInCourse('user', 'course'); names.push((await auth.findById('user'))!.displayName);
    await courses.createCourse(createCourseSchema.parse({ title: text, description: 'Literal description', teacher: 'Teacher', level: 'Beginner' }), { id: 'course', createdAt: '2026-10-09' });
    let course = (await courses.listCourses())[0]; const titles = [course.title];
    await courses.updateCourse('course', { ...course, title: text }); course = (await courses.listCourses())[0]; titles.push(course.title);
    await courses.updateCoursePrice('course', { priceDkk: 7 }); course = (await courses.listCourses())[0]; titles.push(course.title);
    await courses.updateCourseCatalogMetadata('course', { isPremium: false, isBestseller: false, rating: 0, ratingCount: 0, category: 'Software Testing', languages: [] });
    course = (await courses.listCourses())[0]; titles.push(course.title);
    await courses.updateCourseThumbnail('course', { thumbnailAssetId: 'asset' }); course = (await courses.listCourses())[0]; titles.push(course.title);
    const entry = await feedback.createFeedback({ page: 'course', rating: 'okay', message: text }, toAuthenticatedUser(user));
    const messages = [(await feedback.findFeedbackById(entry.id))!.message];
    await feedback.updateFeedbackTriage(entry.id, { workStatus: 'work', priority: 'low', githubIssueUrl: text });
    const triaged = (await feedback.findFeedbackById(entry.id))!; messages.push(triaged.message);
    expect({ names, titles, category: course.category, messages, issueUrl: triaged.githubIssueUrl }).toEqual({
      names: [text, text], titles: Array(5).fill(text), category: 'Software Testing', messages: [text, text], issueUrl: text,
    });
    expect(stub.modes.filter(mode => mode !== 'RAW')).toEqual([]);
    expect(stub.modes.filter(mode => mode === 'RAW').length).toBe(11); // Nine data writes plus two feedback header writes.
  });
});
