import { z } from 'zod';
import {
  type AuthUser, authSheetHeaders, authUserFromSheetRow, authUserToSheetRow,
  userRoleSchema, userStatusSchema,
} from './auth.js';

export type UsersMigrationSettings = {
  USE_SHARED_SERVICES?: string;
  USER_STORE?: string;
  USER_STORE_READ_ONLY?: string;
};

export interface UsersMigrationPorts {
  readSheet(): Promise<unknown[][]>;
  readMongo(): Promise<AuthUser[]>;
  ensureMongoIndexes(): Promise<void>;
  upsertMongo(user: AuthUser): Promise<'inserted' | 'updated' | 'unchanged'>;
  updateSheetRow(sheetRowNumber: number, values: string[]): Promise<void>;
  appendSheetRows(rows: string[][]): Promise<void>;
}

export async function runUsersMigration(
  args: string[], settings: UsersMigrationSettings,
  open: () => Promise<UsersMigrationPorts>, write: (line: string) => void,
): Promise<0 | 1> {
  const modes = ['--dry-run', '--apply', '--verify', '--restore-sheet'];
  if (args.length !== 1 || !modes.includes(args[0])) {
    write('Refused: choose exactly one of --dry-run, --apply, --verify, --restore-sheet.');
    return 1;
  }
  const mode = args[0];
  const store = settings.USER_STORE ?? 'google-sheets';
  const readOnly = settings.USER_STORE_READ_ONLY ?? '0';
  if (settings.USE_SHARED_SERVICES !== '1') {
    write('Refused: USE_SHARED_SERVICES=1 is required for every migration mode.');
    return 1;
  }
  if (!['google-sheets', 'mongodb'].includes(store) || !['0', '1'].includes(readOnly)) {
    write('Refused: USER_STORE must be google-sheets or mongodb; USER_STORE_READ_ONLY must be 0 or 1.');
    return 1;
  }
  if (mode === '--apply' && (store !== 'google-sheets' || readOnly !== '1')) {
    write('Refused: --apply requires USER_STORE=google-sheets and USER_STORE_READ_ONLY=1.');
    return 1;
  }
  if (mode === '--restore-sheet' && (store !== 'mongodb' || readOnly !== '1')) {
    write('Refused: --restore-sheet requires USER_STORE=mongodb and USER_STORE_READ_ONLY=1.');
    return 1;
  }

  try {
    const ports = await open();
    const sheet = validateSheet(await ports.readSheet());
    write('Read and validated Users sheet.');
    const reportSheet = () => write(`Sheet rows: ${sheet.total}; valid: ${sheet.valid}; invalid: ${sheet.invalid}; duplicate emails: ${sheet.duplicateEmails}`);
    if (sheet.issues.length && mode !== '--verify') {
      reportSheet();
      for (const issue of sheet.issues) write(issue);
      return 1;
    }
    if (mode === '--dry-run') { reportSheet(); return 0; }

    const mongoUsers = await ports.readMongo();
    write(`Read MongoDB accounts: ${mongoUsers.length}.`);
    const mongoIssues = validateMongoUsers(mongoUsers);
    if (mode === '--verify') {
      reportSheet();
      for (const issue of sheet.issues) write(issue);
      return verifyUsers(sheet.verificationUsers, mongoUsers, write, [
        ...sheet.invalidFields,
        ...mongoIssues.map(issue => ({ id: mongoUsers[issue.account - 1].id, field: issue.field.replace('duplicate ', '') })),
      ], sheet.issues.length > 0);
    }
    if (mongoIssues.length) {
      reportSheet();
      for (const issue of mongoIssues) write(`MongoDB account ${issue.account}: invalid or missing ${issue.field}.`);
      return 1;
    }
    if (mode === '--apply') {
      // Detect cross-id email collisions before any write, rather than failing midway
      // through a copy that encounters an existing account's unique email.
      const destinationEmails = new Map(mongoUsers.map(user => [user.email, user.id]));
      for (const { user, rowNumber } of sheet.users) {
        const existingId = destinationEmails.get(user.email);
        if (existingId !== undefined && existingId !== user.id) {
          reportSheet();
          write(`Row ${rowNumber}: email belongs to another MongoDB account; copy refused.`);
          return 1;
        }
      }
      await ports.ensureMongoIndexes();
      write('Created or confirmed MongoDB email and enrollment indexes.');
      const counts = { inserted: 0, updated: 0, unchanged: 0 };
      for (const { user } of sheet.users) counts[await ports.upsertMongo(user)]++;
      write('Copied Users accounts to MongoDB.');
      reportSheet();
      write(`inserted: ${counts.inserted}; updated: ${counts.updated}; unchanged: ${counts.unchanged}`);
      return 0;
    }

    const sheetById = new Map(sheet.users.map(entry => [entry.user.id, entry]));
    const restoredUsers = new Map(sheet.users.map(entry => [entry.user.id, entry.user]));
    for (const user of mongoUsers) restoredUsers.set(user.id, user);
    const restoredEmails = new Set<string>();
    for (const user of restoredUsers.values()) {
      if (restoredEmails.has(user.email)) {
        reportSheet();
        write('Restore refused: resulting sheet would contain duplicate emails; resolve the conflicting accounts first.');
        return 1;
      }
      restoredEmails.add(user.email);
    }
    const append: string[][] = [];
    let updated = 0;
    let unchanged = 0;
    for (const user of mongoUsers) {
      const existing = sheetById.get(user.id);
      if (!existing) {
        append.push(authUserToSheetRow(user));
      } else if (sameUser(existing.user, user)) {
        unchanged++;
      } else {
        await ports.updateSheetRow(existing.rowNumber, authUserToSheetRow(user));
        updated++;
      }
    }
    if (append.length) await ports.appendSheetRows(append);
    write('Copied MongoDB accounts into Users sheet.');
    reportSheet();
    write(`Restored sheet: appended: ${append.length}; updated: ${updated}; unchanged: ${unchanged}`);
    return 0;
  } catch {
    // Driver errors may contain a duplicate document, password hash, request body,
    // connection URI or private key. Never forward provider messages or stacks.
    write('Migration failed: provider or configuration operation failed. Keep writes frozen; resolve the connection or data issue and rerun, then verify.');
    return 1;
  }
}

type SheetEntry = { user: AuthUser; rowNumber: number };
type ComparedUser = { [Field in keyof AuthUser]: Field extends 'id' ? string : unknown };

function validateSheet(rows: unknown[][]) {
  const issues: string[] = [];
  const users: SheetEntry[] = [];
  const verificationUsers: ComparedUser[] = [];
  const invalidFields: Array<{ id: string; field: string }> = [];
  const idsByRow = new Map<number, string>();
  const invalidRows = new Set<number>();
  const emails = new Map<string, number[]>();
  const ids = new Map<string, number[]>();
  const headersMatch = authSheetHeaders.every((header, index) => rows[0]?.[index] === header);
  if (!headersMatch) {
    issues.push('Row 1: expected Users account headers in columns A:H.');
  }
  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const errors = sheetRowErrors(row);
    for (const field of errors) issues.push(`Row ${rowNumber}: invalid or missing ${field}.`);
    if (errors.length) invalidRows.add(rowNumber);
    if (headersMatch) {
      const comparable = comparableSheetUser(row);
      if (comparable) {
        verificationUsers.push(comparable);
        idsByRow.set(rowNumber, comparable.id);
        for (const field of errors) invalidFields.push({ id: comparable.id, field });
      }
    }
    if (typeof row[0] === 'string' && row[0].trim()) addRow(ids, row[0], rowNumber);
    if (typeof row[1] === 'string' && row[1].trim()) addRow(emails, row[1].trim().toLowerCase(), rowNumber);
    if (!errors.length) users.push({ user: authUserFromSheetRow(row as string[]), rowNumber });
  });
  let duplicateEmails = 0;
  for (const numbers of emails.values()) {
    if (numbers.length < 2) continue;
    duplicateEmails++;
    for (const number of numbers) {
      issues.push(`Row ${number}: duplicate email (rows ${numbers.join(', ')}).`);
      const id = idsByRow.get(number);
      if (id !== undefined) invalidFields.push({ id, field: 'email' });
    }
  }
  for (const numbers of ids.values()) {
    if (numbers.length < 2) continue;
    for (const number of numbers) {
      invalidRows.add(number);
      issues.push(`Row ${number}: duplicate id (rows ${numbers.join(', ')}).`);
      const id = idsByRow.get(number);
      if (id !== undefined) invalidFields.push({ id, field: 'id' });
    }
  }
  const total = Math.max(0, rows.length - 1);
  return { users, verificationUsers, invalidFields, issues, total,
    valid: total - invalidRows.size, invalid: invalidRows.size, duplicateEmails };
}

function comparableSheetUser(row: unknown[]): ComparedUser | null {
  if (typeof row[0] !== 'string' || !row[0].trim()) return null;
  // Reuse the account mapping for email/enrollment normalization, but retain raw
  // invalid fields for verification. Its fallback role/status must not conceal a
  // discrepancy. These comparable objects are never passed to a write port.
  const mapped = authUserFromSheetRow(row.map(value => typeof value === 'string' ? value : ''));
  return {
    id: row[0], email: typeof row[1] === 'string' ? mapped.email : row[1],
    displayName: row[2] ?? '', passwordHash: row[3] ?? '', role: row[4], status: row[5],
    createdAt: row[6] ?? '',
    enrolledCourseIds: row[7] === undefined || typeof row[7] === 'string' ? mapped.enrolledCourseIds : row[7],
  };
}

function addRow(map: Map<string, number[]>, key: string, rowNumber: number) {
  const numbers = map.get(key) ?? [];
  numbers.push(rowNumber);
  map.set(key, numbers);
}

function sheetRowErrors(row: unknown[]): string[] {
  const errors: string[] = [];
  for (const index of [0, 2, 3, 6]) {
    if (typeof row[index] !== 'string' || !(row[index] as string).trim()) errors.push(authSheetHeaders[index]);
  }
  if (typeof row[1] !== 'string' || !z.email().safeParse(row[1].trim().toLowerCase()).success) errors.push('email');
  if (!userRoleSchema.safeParse(row[4]).success) errors.push('role');
  if (!userStatusSchema.safeParse(row[5]).success) errors.push('status');
  if (typeof row[6] === 'string' && row[6].trim() && !Number.isFinite(Date.parse(row[6]))) errors.push('createdAt');
  const enrollment = row[7];
  if (enrollment !== undefined && (typeof enrollment !== 'string' ||
      (enrollment.trim() !== '' && enrollment.split(',').some(value => !value.trim())))) errors.push('enrolledCourseIds');
  return errors;
}

function validateMongoUsers(users: AuthUser[]): Array<{ account: number; field: string }> {
  const issues: Array<{ account: number; field: string }> = [];
  const ids = new Set<string>();
  const emails = new Set<string>();
  users.forEach((user, index) => {
    // Validate raw values before calling the sheet serializer: a malformed array
    // must never be coerced or truncated during rollback.
    const fields: unknown[] = [user.id, user.email, user.displayName, user.passwordHash,
      user.role, user.status, user.createdAt, ''];
    const errors = sheetRowErrors(fields);
    if (!Array.isArray(user.enrolledCourseIds) || user.enrolledCourseIds.some(id =>
      typeof id !== 'string' || !id.trim() || id !== id.trim() || id.includes(','))) errors.push('enrolledCourseIds');
    if (typeof user.email === 'string' && user.email !== user.email.trim().toLowerCase()) errors.push('email');
    if (ids.has(user.id)) errors.push('duplicate id');
    if (emails.has(user.email)) errors.push('duplicate email');
    ids.add(user.id);
    emails.add(user.email);
    for (const field of errors) issues.push({ account: index + 1, field });
  });
  return issues;
}

function sameUser(left: AuthUser, right: AuthUser): boolean {
  return authSheetHeaders.every(field => JSON.stringify(left[field]) === JSON.stringify(right[field]));
}

function verifyUsers(sheetUsers: ComparedUser[], mongoUsers: AuthUser[], write: (line: string) => void,
  invalidFields: Array<{ id: string; field: string }> = [], blocked = false): 0 | 1 {
  const mongoById = new Map(mongoUsers.map(user => [user.id, user]));
  const sheetById = new Map(sheetUsers.map(user => [user.id, user]));
  const differences = new Set<string>();
  const difference = (id: string, field: string) => {
    const message = `Difference: id=${JSON.stringify(typeof id === 'string' ? id : '(invalid MongoDB id)')}; field=${field}`;
    if (differences.has(message)) return;
    differences.add(message);
    write(message);
  };
  for (const issue of invalidFields) difference(issue.id, issue.field);
  const ambiguousIds = new Set<string>();
  for (const accounts of [sheetUsers, mongoUsers]) {
    const seen = new Set<string>();
    for (const user of accounts) {
      if (seen.has(user.id)) { ambiguousIds.add(user.id); difference(user.id, 'id'); }
      seen.add(user.id);
    }
  }
  for (const user of sheetUsers) {
    if (ambiguousIds.has(user.id)) continue;
    const mongo = mongoById.get(user.id);
    if (!mongo) {
      difference(user.id, 'missingInMongoDB');
      continue;
    }
    for (const field of authSheetHeaders) {
      if (JSON.stringify(user[field]) !== JSON.stringify(mongo[field])) difference(user.id, field);
    }
  }
  for (const user of mongoUsers) if (!sheetById.has(user.id)) difference(user.id, 'missingInSheet');
  if (differences.size || blocked) return 1;
  write(`Verified: ${sheetUsers.length} accounts identical`);
  return 0;
}
