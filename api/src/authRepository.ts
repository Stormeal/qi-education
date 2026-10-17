import { protectCourseWrite } from './courseMutationLock.js';
import { InFlightRead } from './inFlightRead.js';
import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig, isHostedApi } from './config.js';
import {
  type AuthUser,
  type UserRole,
  type UserStatus,
  authUserFromSheetRow,
  authSheetHeaders,
  authUserToSheetRow,
  hashPassword
} from './auth.js';
import { createSheetsClient, ensureWorksheetHeaders } from './googleSheets.js';

export type AuthAccessMutation = { user: AuthUser; previous: AuthUser | null };

export interface AuthRepository {
  readonly unavailableReason?: string;
  findByEmail(email: string, options?: { fresh?: boolean }): Promise<AuthUser | null>;
  findById(id: string, options?: { fresh?: boolean }): Promise<AuthUser | null>;
  listUsers(options?: { fresh?: boolean }): Promise<AuthUser[]>;
  updateRole(userId: string, role: UserRole): Promise<AuthUser | null>;
  updateStatus(userId: string, status: UserStatus): Promise<AuthUser | null>;
  updateRoleWithChange(userId: string, role: UserRole): Promise<AuthAccessMutation | null>;
  updateStatusWithChange(userId: string, status: UserStatus): Promise<AuthAccessMutation | null>;
  createUser(user: AuthUser): Promise<AuthUser>;
  enrollUserInCourse(userId: string, courseId: string): Promise<AuthUser | null>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<AuthUser | null>;
}

export class GoogleSheetsAuthRepository implements AuthRepository {
  private readonly usersRead = new InFlightRead<AuthUser[]>();
  private async write<T>(operation: () => Promise<T>): Promise<T> {
    this.usersRead.invalidate();
    try { return await protectCourseWrite(operation); }
    finally { this.usersRead.invalidate(); }
  }
  async findByEmail(email: string, options?: { fresh?: boolean }): Promise<AuthUser | null> {
    const users = await (options?.fresh ? this.usersRead.runFresh(this.loadUsers) : this.listUsers());
    return users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string, options?: { fresh?: boolean }): Promise<AuthUser | null> {
    // Password proof, session authentication and role checks must not join a snapshot that
    // was requested before this call; simultaneous fresh callers still share one read.
    const users = await (options?.fresh ? this.usersRead.runFresh(this.loadUsers) : this.listUsers());
    return users.find((user) => user.id === id) ?? null;
  }

  async createUser(user: AuthUser): Promise<AuthUser> {
    const sheets = createSheetsClient();
    await ensureWorksheetHeaders(authSheetRange(), [...authSheetHeaders]);

    await this.write(() => sheets.spreadsheets.values.append({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: authSheetRange(),
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [authUserToSheetRow(user)],
      },
    }));

    return user;
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

    await this.write(() => sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${sheetTitle}!H${sheetRowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        // Never rewrite a password, status or identity read before another mutation.
        values: [[updated.enrolledCourseIds.join(', ')]]
      }
    }));

    return updated;
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<AuthUser | null> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: authSheetRange(),
    });
    const rows = response.data.values ?? [];
    const index = rows.slice(1).findIndex(row => (row as string[])[0] === userId);
    if (index < 0) return null;
    const existing = authUserFromSheetRow(rows[index + 1] as string[]);
    if (existing.status !== 'active') return null;
    const sheetTitle = authSheetRange().split('!')[0];
    await this.write(() => sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: `${sheetTitle}!D${index + 2}`,
      valueInputOption: 'RAW', requestBody: { values: [[passwordHash]] },
    }));
    return { ...existing, passwordHash };
  }

  async updateRole(userId: string, role: UserRole): Promise<AuthUser | null> {
    return (await this.updateRoleWithChange(userId, role))?.user ?? null;
  }

  async updateRoleWithChange(userId: string, role: UserRole): Promise<AuthAccessMutation | null> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: authSheetRange(),
    });
    const rows = response.data.values ?? [];
    const index = rows.slice(1).findIndex(row => (row as string[])[0] === userId);
    if (index < 0) return null;
    const existing = authUserFromSheetRow(rows[index + 1] as string[]);
    if (existing.role === role) return { user: existing, previous: null };
    const sheetTitle = authSheetRange().split('!')[0];
    await this.write(() => sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: `${sheetTitle}!E${index + 2}`,
      valueInputOption: 'RAW', requestBody: { values: [[role]] },
    }));
    return { user: { ...existing, role }, previous: existing };
  }

  async updateStatus(userId: string, status: UserStatus): Promise<AuthUser | null> {
    return (await this.updateStatusWithChange(userId, status))?.user ?? null;
  }

  async updateStatusWithChange(userId: string, status: UserStatus): Promise<AuthAccessMutation | null> {
    const sheets = createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: authSheetRange(),
    });
    const rows = response.data.values ?? [];
    const index = rows.slice(1).findIndex(row => (row as string[])[0] === userId);
    if (index < 0) return null;
    const existing = authUserFromSheetRow(rows[index + 1] as string[]);
    if (existing.status === status) return { user: existing, previous: null };
    const sheetTitle = authSheetRange().split('!')[0];
    await this.write(() => sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: `${sheetTitle}!F${index + 2}`,
      valueInputOption: 'RAW', requestBody: { values: [[status]] },
    }));
    return { user: { ...existing, status }, previous: existing };
  }

  async listUsers(options?: { fresh?: boolean }): Promise<AuthUser[]> {
    return options?.fresh ? this.usersRead.runFresh(this.loadUsers) : this.usersRead.run(this.loadUsers);
  }

  private readonly loadUsers = async (): Promise<AuthUser[]> => {
    {
      const sheets = createSheetsClient();

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
        range: authSheetRange()
      });

      const rows = response.data.values ?? [];
      return rows.slice(1).map((row) => authUserFromSheetRow(row as string[]));
    }
  };
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

  async listUsers(): Promise<AuthUser[]> { return [...this.users]; }

  async updateRole(userId: string, role: UserRole): Promise<AuthUser | null> {
    return (await this.updateRoleWithChange(userId, role))?.user ?? null;
  }
  async updateRoleWithChange(userId: string, role: UserRole): Promise<AuthAccessMutation | null> {
    const index = this.users.findIndex(user => user.id === userId);
    if (index < 0) return null;
    const previous = this.users[index];
    if (previous.role === role) return { user: previous, previous: null };
    this.users[index] = { ...previous, role };
    return { user: this.users[index], previous };
  }
  async updateStatus(userId: string, status: UserStatus): Promise<AuthUser | null> {
    return (await this.updateStatusWithChange(userId, status))?.user ?? null;
  }
  async updateStatusWithChange(userId: string, status: UserStatus): Promise<AuthAccessMutation | null> {
    const index = this.users.findIndex(user => user.id === userId);
    if (index < 0) return null;
    const previous = this.users[index];
    if (previous.status === status) return { user: previous, previous: null };
    this.users[index] = { ...previous, status };
    return { user: this.users[index], previous };
  }

  async createUser(user: AuthUser): Promise<AuthUser> {
    this.users.push(user);
    return user;
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

  async updatePasswordHash(userId: string, passwordHash: string): Promise<AuthUser | null> {
    const index = this.users.findIndex(user => user.id === userId && user.status === 'active');
    if (index < 0) return null;
    this.users[index] = { ...this.users[index], passwordHash };
    return this.users[index];
  }
}

export function createAuthRepository(): AuthRepository {
  if (hasGoogleSheetsConfig()) return new GoogleSheetsAuthRepository();
  if (isHostedApi()) return new UnavailableAuthRepository();
  return new InMemoryAuthRepository();
}

export class AuthUnavailableError extends Error {
  constructor() {
    super('Production user store is not configured. Authentication is unavailable.');
  }
}

// No seeded users and no writes when the production store is missing. Keep the
// server running so existing health routes can explain the unavailable state.
class UnavailableAuthRepository implements AuthRepository {
  readonly unavailableReason = new AuthUnavailableError().message;
  async findByEmail(_email: string): Promise<AuthUser | null> { return null; }
  async findById(_id: string): Promise<AuthUser | null> { return null; }
  async listUsers(): Promise<AuthUser[]> { throw new AuthUnavailableError(); }
  async updateRole(_userId: string, _role: UserRole): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
  async updateStatus(_userId: string, _status: UserStatus): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
  async updateRoleWithChange(_userId: string, _role: UserRole): Promise<AuthAccessMutation | null> { throw new AuthUnavailableError(); }
  async updateStatusWithChange(_userId: string, _status: UserStatus): Promise<AuthAccessMutation | null> { throw new AuthUnavailableError(); }
  async createUser(_user: AuthUser): Promise<AuthUser> { throw new AuthUnavailableError(); }
  async enrollUserInCourse(_userId: string, _courseId: string): Promise<AuthUser | null> { return null; }
  async updatePasswordHash(_userId: string, _passwordHash: string): Promise<AuthUser | null> { throw new AuthUnavailableError(); }
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
