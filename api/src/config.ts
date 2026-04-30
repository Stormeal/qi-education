import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  loadEnv({ path: resolve(apiRoot, '.env'), quiet: true });
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  GOOGLE_SHEET_ID: z.string().min(1).optional(),
  GOOGLE_SHEETS_COURSES: z.string().min(1).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEETS_COURSES_RANGE: z.string().optional()
});

const env = envSchema.parse(process.env);
const coursesRange = firstDefined(env.GOOGLE_SHEETS_COURSES_RANGE, env.GOOGLE_SHEETS_COURSES);
const spreadsheetId = firstDefined(env.GOOGLE_SHEETS_SPREADSHEET_ID, env.GOOGLE_SHEET_ID);

export const config = {
  ...env,
  GOOGLE_SHEETS_SPREADSHEET_ID: spreadsheetId,
  GOOGLE_SHEETS_COURSES_RANGE:
    coursesRange && coursesRange !== 'GOOGLE_SHEETS_COURSES_RANGE' ? coursesRange : 'Courses!A:H'
};

function firstDefined(primary: string | undefined, fallback: string | undefined) {
  if (primary !== undefined) {
    return primary;
  }

  return fallback;
}

export function hasGoogleSheetsConfig() {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }

  return Boolean(
    config.GOOGLE_SHEETS_SPREADSHEET_ID &&
      config.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      config.GOOGLE_PRIVATE_KEY
  );
}
