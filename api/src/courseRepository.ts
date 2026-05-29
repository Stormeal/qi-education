import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
import {
  type Course,
  type CreateCourseInput,
  type UpdateCourseCatalogMetadataInput,
  type UpdateCourseInput,
  type UpdateCoursePriceInput,
  type UpdateCourseThumbnailInput,
  courseFromSheetRow,
  courseSheetHeaders,
  courseToSheetRow,
} from './course.js';
import { createSheetsClient, ensureWorksheetHeaders } from './googleSheets.js';

export interface CourseRepository {
  readonly storageType: 'memory' | 'google-sheets';
  listCourses(): Promise<Course[]>;
  createCourse(input: CreateCourseInput, seed?: CourseSeed): Promise<Course>;
  updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null>;
  updateCoursePrice(id: string, input: UpdateCoursePriceInput): Promise<Course | null>;
  updateCourseCatalogMetadata(id: string, input: UpdateCourseCatalogMetadataInput): Promise<Course | null>;
  updateCourseThumbnail(id: string, input: UpdateCourseThumbnailInput): Promise<Course | null>;
}

export type CourseSeed = {
  id: string;
  createdAt: string;
};

export class GoogleSheetsCourseRepository implements CourseRepository {
  readonly storageType: CourseRepository['storageType'] = 'google-sheets';

  async listCourses(): Promise<Course[]> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: courseSheetRange(),
    });

    const rows = response.data.values ?? [];
    return rows.slice(1).map((row) => courseFromSheetRow(row as string[]));
  }

  async createCourse(input: CreateCourseInput, seed?: CourseSeed): Promise<Course> {
    const course: Course = {
      ...input,
      id: seed?.id ?? randomUUID(),
      createdAt: seed?.createdAt ?? new Date().toISOString()
    };

    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(courseSheetRange(), [...courseSheetHeaders]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: courseSheetRange(),
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [courseToSheetRow(course)]
      }
    });

    return course;
  }

  async updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(courseSheetRange(), [...courseSheetHeaders]);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: courseSheetRange(),
    });

    const rows = response.data.values ?? [];
    const rowIndex = rows.slice(1).findIndex((row) => (row as string[])[0] === id);

    if (rowIndex < 0) {
      return null;
    }

    const existing = courseFromSheetRow(rows[rowIndex + 1] as string[]);
    const course: Course = {
      ...existing,
      ...input,
      id: existing.id,
      createdAt: existing.createdAt
    };
    const sheetRowNumber = rowIndex + 2;
    const sheetTitle = courseSheetRange().split('!')[0];
    const rowColumn = toColumnName(courseToSheetRow(course).length);

    await sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetTitle}!A${sheetRowNumber}:${rowColumn}${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [courseToSheetRow(course)]
      }
    });

    return course;
  }

  async updateCoursePrice(id: string, input: UpdateCoursePriceInput): Promise<Course | null> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(courseSheetRange(), [...courseSheetHeaders]);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: courseSheetRange(),
    });

    const rows = response.data.values ?? [];
    const rowIndex = rows.slice(1).findIndex((row) => (row as string[])[0] === id);

    if (rowIndex < 0) {
      return null;
    }

    const existing = courseFromSheetRow(rows[rowIndex + 1] as string[]);
    const updated: Course = {
      ...existing,
      priceDkk: input.priceDkk,
    };
    const sheetRowNumber = rowIndex + 2;
    const sheetTitle = courseSheetRange().split('!')[0];
    const rowColumn = toColumnName(courseToSheetRow(updated).length);

    await sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetTitle}!A${sheetRowNumber}:${rowColumn}${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [courseToSheetRow(updated)],
      },
    });

    return updated;
  }

  async updateCourseCatalogMetadata(
    id: string,
    input: UpdateCourseCatalogMetadataInput,
  ): Promise<Course | null> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(courseSheetRange(), [...courseSheetHeaders]);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: courseSheetRange(),
    });

    const rows = response.data.values ?? [];
    const rowIndex = rows.slice(1).findIndex((row) => (row as string[])[0] === id);

    if (rowIndex < 0) {
      return null;
    }

    const existing = courseFromSheetRow(rows[rowIndex + 1] as string[]);
    const updated: Course = {
      ...existing,
      ...input,
    };
    const sheetRowNumber = rowIndex + 2;
    const sheetTitle = courseSheetRange().split('!')[0];
    const rowColumn = toColumnName(courseToSheetRow(updated).length);

    await sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetTitle}!A${sheetRowNumber}:${rowColumn}${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [courseToSheetRow(updated)],
      },
    });

    return updated;
  }

  async updateCourseThumbnail(id: string, input: UpdateCourseThumbnailInput): Promise<Course | null> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(courseSheetRange(), [...courseSheetHeaders]);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: courseSheetRange(),
    });

    const rows = response.data.values ?? [];
    const rowIndex = rows.slice(1).findIndex((row) => (row as string[])[0] === id);

    if (rowIndex < 0) {
      return null;
    }

    const existing = courseFromSheetRow(rows[rowIndex + 1] as string[]);
    const updated: Course = {
      ...existing,
      thumbnailAssetId: input.thumbnailAssetId,
    };
    const sheetRowNumber = rowIndex + 2;
    const sheetTitle = courseSheetRange().split('!')[0];
    const rowColumn = toColumnName(courseToSheetRow(updated).length);

    await sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetTitle}!A${sheetRowNumber}:${rowColumn}${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [courseToSheetRow(updated)],
      },
    });

    return updated;
  }
}

export class InMemoryCourseRepository implements CourseRepository {
  readonly storageType: CourseRepository['storageType'] = 'memory';
  private readonly courses: Course[] = [
    {
      id: 'demo-course-1',
      title: 'Career Discovery Workshop',
      description: 'Map existing strengths, learning gaps, and practical next steps.',
      requirements: ['An interest in structured learning', 'A current or target career goal'],
      whatYoullLearn: ['How to evaluate a new career path', 'How to map skills to practical next steps'],
      audience: 'Learners who want a clear starting point for choosing a practical education path.',
      level: 'Beginner',
      partOfCareer: 'QA Foundations',
      teacher: 'QI Education',
      careerGoals: ['Career change', 'Skill mapping'],
      status: 'published',
      createdAt: new Date().toISOString(),
      priceDkk: null,
      thumbnailAssetId: '',
      isPremium: false,
      isBestseller: false,
      rating: 0,
      ratingCount: 0,
    }
  ];

  async listCourses(): Promise<Course[]> {
    return this.courses;
  }

  async createCourse(input: CreateCourseInput, seed?: CourseSeed): Promise<Course> {
    const course: Course = {
      ...input,
      id: seed?.id ?? randomUUID(),
      createdAt: seed?.createdAt ?? new Date().toISOString()
    };

    this.courses.push(course);
    return course;
  }

  async updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const current = this.courses[index];
    const updated: Course = {
      ...current,
      ...input,
      id: current.id,
      createdAt: current.createdAt
    };

    this.courses[index] = updated;
    return updated;
  }

  async updateCoursePrice(id: string, input: UpdateCoursePriceInput): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const updated: Course = {
      ...this.courses[index],
      priceDkk: input.priceDkk,
    };

    this.courses[index] = updated;
    return updated;
  }

  async updateCourseCatalogMetadata(
    id: string,
    input: UpdateCourseCatalogMetadataInput,
  ): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const updated: Course = {
      ...this.courses[index],
      ...input,
    };

    this.courses[index] = updated;
    return updated;
  }

  async updateCourseThumbnail(id: string, input: UpdateCourseThumbnailInput): Promise<Course | null> {
    const index = this.courses.findIndex((course) => course.id === id);

    if (index < 0) {
      return null;
    }

    const updated: Course = {
      ...this.courses[index],
      thumbnailAssetId: input.thumbnailAssetId,
    };

    this.courses[index] = updated;
    return updated;
  }
}

export function createCourseRepository(): CourseRepository {
  return hasGoogleSheetsConfig() ? new GoogleSheetsCourseRepository() : new InMemoryCourseRepository();
}

function toColumnName(index: number) {
  let remaining = index;
  let columnName = '';

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    columnName = String.fromCharCode(65 + offset) + columnName;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return columnName;
}

function courseSheetRange() {
  const sheetTitle = apiConfig.GOOGLE_SHEETS_COURSES_RANGE.split('!')[0] ?? 'Courses';
  const lastColumn = toColumnName(courseSheetHeaders.length);

  return `${sheetTitle}!A:${lastColumn}`;
}
