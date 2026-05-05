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
  CORS_ORIGIN: z
    .string()
    .default(
      'http://localhost:4200,http://127.0.0.1:4200,https://stormeal.github.io,https://qi-education.vercel.app',
    ),
  AUTH_TOKEN_SECRET: z.string().min(16).default('local-dev-auth-secret'),
  GOOGLE_SHEET_ID: z.string().min(1).optional(),
  GOOGLE_SHEETS_COURSES: z.string().min(1).optional(),
  GOOGLE_SHEETS_USERS: z.string().min(1).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEETS_COURSES_RANGE: z.string().optional(),
  GOOGLE_SHEETS_USERS_RANGE: z.string().optional(),
  GOOGLE_SHEETS_FEEDBACK_RANGE: z.string().optional(),
});

const env = envSchema.parse(process.env);
const coursesRange = firstDefined(env.GOOGLE_SHEETS_COURSES_RANGE, env.GOOGLE_SHEETS_COURSES);
const usersRange = firstDefined(env.GOOGLE_SHEETS_USERS_RANGE, env.GOOGLE_SHEETS_USERS);
const spreadsheetId = firstDefined(env.GOOGLE_SHEETS_SPREADSHEET_ID, env.GOOGLE_SHEET_ID);

export const apiConfig = {
  ...env,
  GOOGLE_SHEETS_SPREADSHEET_ID: spreadsheetId,
  GOOGLE_SHEETS_COURSES_RANGE:
    coursesRange && coursesRange !== 'GOOGLE_SHEETS_COURSES_RANGE' ? coursesRange : 'Courses!A:H',
  GOOGLE_SHEETS_USERS_RANGE:
    usersRange && usersRange !== 'GOOGLE_SHEETS_USERS_RANGE' ? usersRange : 'Users!A:G',
  GOOGLE_SHEETS_FEEDBACK_RANGE:
    env.GOOGLE_SHEETS_FEEDBACK_RANGE &&
    env.GOOGLE_SHEETS_FEEDBACK_RANGE !== 'GOOGLE_SHEETS_FEEDBACK_RANGE'
      ? env.GOOGLE_SHEETS_FEEDBACK_RANGE
      : 'Feedback!A:I',
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
    apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID &&
    apiConfig.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    apiConfig.GOOGLE_PRIVATE_KEY,
  );
}

export function getCorsOrigins() {
  return apiConfig.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
