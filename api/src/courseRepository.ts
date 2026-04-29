import { randomUUID } from 'node:crypto';
import { config, hasGoogleSheetsConfig } from './config.js';
import { type Course, type CreateCourseInput, courseFromSheetRow, courseToSheetRow } from './course.js';
import { createSheetsClient } from './googleSheets.js';

export interface CourseRepository {
  listCourses(): Promise<Course[]>;
  createCourse(input: CreateCourseInput): Promise<Course>;
}

export class GoogleSheetsCourseRepository implements CourseRepository {
  async listCourses(): Promise<Course[]> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: config.GOOGLE_SHEETS_COURSES_RANGE
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
      spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: config.GOOGLE_SHEETS_COURSES_RANGE,
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
}

export function createCourseRepository(): CourseRepository {
  return hasGoogleSheetsConfig() ? new GoogleSheetsCourseRepository() : new InMemoryCourseRepository();
}
