import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
import {
  type Course,
  type CreateCourseInput,
  type UpdateCourseInput,
  courseFromSheetRow,
  courseToSheetRow,
} from './course.js';
import { createSheetsClient } from './googleSheets.js';

export interface CourseRepository {
  listCourses(): Promise<Course[]>;
  createCourse(input: CreateCourseInput): Promise<Course>;
  updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null>;
}

export class GoogleSheetsCourseRepository implements CourseRepository {
  async listCourses(): Promise<Course[]> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: apiConfig.GOOGLE_SHEETS_COURSES_RANGE
    });

    const rows = response.data.values ?? [];
    return rows.slice(1).map((row) => courseFromSheetRow(row as string[]));
  }

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const course: Course = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };

    const sheets = createSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: apiConfig.GOOGLE_SHEETS_COURSES_RANGE,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [courseToSheetRow(course)]
      }
    });

    return course;
  }

  async updateCourse(id: string, input: UpdateCourseInput): Promise<Course | null> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: apiConfig.GOOGLE_SHEETS_COURSES_RANGE
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
    const sheetTitle = apiConfig.GOOGLE_SHEETS_COURSES_RANGE.split('!')[0];
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
}

export class InMemoryCourseRepository implements CourseRepository {
  private readonly courses: Course[] = [
    {
      id: 'demo-course-1',
      title: 'Career Discovery Workshop',
      description: 'Map existing strengths, learning gaps, and practical next steps.',
      requirements: ['An interest in structured learning', 'A current or target career goal'],
      audience: 'Learners who want a clear starting point for choosing a practical education path.',
      level: 'Beginner',
      teacher: 'QI Education',
      careerGoals: ['Career change', 'Skill mapping'],
      status: 'published',
      createdAt: new Date().toISOString()
    }
  ];

  async listCourses(): Promise<Course[]> {
    return this.courses;
  }

  async createCourse(input: CreateCourseInput): Promise<Course> {
    const course: Course = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString()
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
