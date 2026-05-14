import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
import {
  type AuthUser,
  authUserFromSheetRow,
  authSheetHeaders,
  authUserToSheetRow,
  hashPassword
} from './auth.js';
import { createSheetsClient, ensureWorksheetHeaders } from './googleSheets.js';

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null>;
}

export class GoogleSheetsAuthRepository implements AuthRepository {
  async findByEmail(email: string): Promise<AuthUser | null> {
    const users = await this.listUsers();
    return users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    const users = await this.listUsers();
    return users.find((user) => user.id === id) ?? null;
  }

  async enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(authSheetRange(), [...authSheetHeaders]);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: authSheetRange(),
    });
    const rows = response.data.values ?? [];
    const rowIndex = rows.slice(1).findIndex((row) => (row as string[])[0] === userId);

    if (rowIndex < 0) {
      return null;
    }

    const existing = authUserFromSheetRow(rows[rowIndex + 1] as string[]);
    const enrolledCourseIds = existing.enrolledCourseIds.includes(courseId)
      ? existing.enrolledCourseIds
      : [...existing.enrolledCourseIds, courseId];
    const updated: AuthUser = {
      ...existing,
      enrolledCourseIds,
    };
    const sheetRowNumber = rowIndex + 2;
    const sheetTitle = authSheetRange().split('!')[0];
    const rowColumn = toColumnName(authUserToSheetRow(updated).length);

    await sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetTitle}!A${sheetRowNumber}:${rowColumn}${sheetRowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [authUserToSheetRow(updated)]
      }
    });

    return updated;
  }

  private async listUsers(): Promise<AuthUser[]> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(authSheetRange(), [...authSheetHeaders]);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: authSheetRange()
    });

    const rows = response.data.values ?? [];
    return rows.slice(1).map((row) => authUserFromSheetRow(row as string[]));
  }
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly users: AuthUser[] = [
    createDemoUser('student', 'student@qi-education.local', 'Student Demo'),
    createDemoUser('teacher', 'teacher@qi-education.local', 'Teacher Demo'),
    createDemoUser('admin', 'admin@qi-education.local', 'Admin Demo')
  ];

  async findByEmail(email: string): Promise<AuthUser | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null> {
    const index = this.users.findIndex((user) => user.id === userId);

    if (index < 0) {
      return null;
    }

    const user = this.users[index];

    if (!user.enrolledCourseIds.includes(courseId)) {
      this.users[index] = {
        ...user,
        enrolledCourseIds: [...user.enrolledCourseIds, courseId],
      };
    }

    return this.users[index];
  }
}

export function createAuthRepository(): AuthRepository {
  return hasGoogleSheetsConfig() ? new GoogleSheetsAuthRepository() : new InMemoryAuthRepository();
}

function createDemoUser(role: AuthUser['role'], email: string, displayName: string): AuthUser {
  return {
    id: randomUUID(),
    email,
    displayName,
    passwordHash: hashPassword('Password123!'),
    role,
    status: 'active',
    createdAt: new Date().toISOString(),
    enrolledCourseIds: []
  };
}

function authSheetRange() {
  const sheetTitle = apiConfig.GOOGLE_SHEETS_USERS_RANGE.split('!')[0] ?? 'Users';
  const lastColumn = toColumnName(authSheetHeaders.length);

  return `${sheetTitle}!A:${lastColumn}`;
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
