import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
import {
  type AuthUser,
  authUserFromSheetRow,
  hashPassword
} from './auth.js';
import { createSheetsClient } from './googleSheets.js';

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
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

  private async listUsers(): Promise<AuthUser[]> {
    const sheets = createSheetsClient();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: apiConfig.GOOGLE_SHEETS_USERS_RANGE
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
    createdAt: new Date().toISOString()
  };
}
