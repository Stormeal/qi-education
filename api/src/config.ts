import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const defaultCorsOrigin = 'http://localhost:4200,http://127.0.0.1:4200,https://stormeal.github.io,https://qi-education.vercel.app';

export type ServicesMode = 'isolated' | 'shared' | 'hosted';
export function getServicesMode(settings: Record<string, string | undefined> = process.env): ServicesMode {
  if (settings.NODE_ENV === 'test') return 'isolated';
  if (settings.NODE_ENV === 'production' || settings.VERCEL !== undefined) return 'hosted';
  return settings.USE_SHARED_SERVICES === '1' ? 'shared' : 'isolated';
}
export function isHostedApi(): boolean { return getServicesMode() === 'hosted'; }
function sharedServicesEnabled(): boolean { return getServicesMode() !== 'isolated'; }

if (process.env.NODE_ENV !== 'test') {
  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  // Only the host itself may say "this is Vercel". A pulled api/.env can contain VERCEL=1,
  // which would turn a local run into a hosted one and back onto the shared services.
  const onVercel = process.env.VERCEL !== undefined;
  loadEnv({ path: resolve(apiRoot, '.env'), quiet: true });
  if (!onVercel) delete process.env.VERCEL;
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGIN: z.string().default(defaultCorsOrigin),
  AUTH_TOKEN_SECRET: z.string().min(16).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  USER_STORE: z.enum(['google-sheets', 'mongodb']).default('google-sheets'),
  USER_STORE_READ_ONLY: z.enum(['0', '1']).default('0'),
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_DB_NAME: z.string().min(1).optional(),
  MONGODB_COURSE_CONTENT_COLLECTION: z.string().min(1).optional(),
  MONGODB_COURSE_ASSET_COLLECTION: z.string().min(1).optional(),
  GOOGLE_SHEET_ID: z.string().min(1).optional(),
  GOOGLE_SHEETS_COURSES: z.string().min(1).optional(),
  GOOGLE_SHEETS_USERS: z.string().min(1).optional(),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().min(1).optional(),
  GOOGLE_SHEETS_COURSES_RANGE: z.string().optional(),
  GOOGLE_SHEETS_USERS_RANGE: z.string().optional(),
  GOOGLE_SHEETS_FEEDBACK_RANGE: z.string().optional(),
  GITHUB_FEEDBACK_TOKEN: z.string().min(1).optional(),
  GITHUB_FEEDBACK_REPOSITORY: z.string().min(1).optional(),
  GITHUB_FEEDBACK_PROJECT_ID: z.string().min(1).optional(),
  BREVO_API_KEY: z.string().trim().min(1).optional(),
  MAIL_FROM_ADDRESS: z.email().optional(),
  MAIL_FROM_NAME: z.string().trim().min(1).default('QI Academy'),
  APP_PUBLIC_URL: z.url().refine(value => /^https?:\/\//.test(value), 'APP_PUBLIC_URL must use HTTP or HTTPS').optional(),
  MUX_TOKEN_ID: z.string().min(1).optional(),
  MUX_TOKEN_SECRET: z.string().min(1).optional(),
  MUX_WEBHOOK_SECRET: z.string().min(1).optional(),
  MUX_DEFAULT_PLAYBACK_POLICY: z.enum(['public', 'signed']).default('public'),
  MUX_SIGNING_KEY_ID: z.string().min(1).optional(),
  MUX_SIGNING_PRIVATE_KEY: z.string().min(1).optional(),
});

// Filter before validation: an ignored shared key (even an empty or invalid one)
// must not select a provider or prevent an isolated local/test startup.
export function buildApiConfig(source: Record<string, string | undefined>) {
  const mode = getServicesMode(source), settings = { ...source };
  if (mode === 'isolated') {
    for (const key of Object.keys(settings)) {
      if (/^(GOOGLE_|MONGODB_|MUX_|GITHUB_FEEDBACK_)/.test(key)) delete settings[key];
    }
  }
  if (source.NODE_ENV === 'test') delete settings.BREVO_API_KEY;
  const env = envSchema.parse(settings);
  const authTokenSecret = authTokenSecretForMode(env.AUTH_TOKEN_SECRET, env.SESSION_SECRET, mode);
  const coursesRange = firstDefined(env.GOOGLE_SHEETS_COURSES_RANGE, env.GOOGLE_SHEETS_COURSES);
  const usersRange = firstDefined(env.GOOGLE_SHEETS_USERS_RANGE, env.GOOGLE_SHEETS_USERS);
  const spreadsheetId = firstDefined(env.GOOGLE_SHEETS_SPREADSHEET_ID, env.GOOGLE_SHEET_ID);
  return {
    ...env,
    mode,
    AUTH_TOKEN_SECRET: authTokenSecret,
    GOOGLE_SHEETS_SPREADSHEET_ID: spreadsheetId,
    GOOGLE_SHEETS_COURSES_RANGE:
      coursesRange && coursesRange !== 'GOOGLE_SHEETS_COURSES_RANGE' ? coursesRange : 'Courses!A:R',
    GOOGLE_SHEETS_USERS_RANGE:
      usersRange && usersRange !== 'GOOGLE_SHEETS_USERS_RANGE' ? usersRange : 'Users!A:H',
    GOOGLE_SHEETS_FEEDBACK_RANGE:
      env.GOOGLE_SHEETS_FEEDBACK_RANGE && env.GOOGLE_SHEETS_FEEDBACK_RANGE !== 'GOOGLE_SHEETS_FEEDBACK_RANGE'
        ? env.GOOGLE_SHEETS_FEEDBACK_RANGE : 'Feedback!A:M',
  };
}
export const apiConfig = buildApiConfig(process.env);

export function resolveAuthTokenSecret(
  secret: string | undefined,
  legacySessionSecret?: string,
  nodeEnv = process.env.NODE_ENV,
  vercel = process.env.VERCEL,
): string {
  return authTokenSecretForMode(secret, legacySessionSecret, getServicesMode({ NODE_ENV: nodeEnv, VERCEL: vercel }));
}

function authTokenSecretForMode(secret: string | undefined, legacySessionSecret: string | undefined, mode: ServicesMode): string {
  if (secret) return secret;
  if (legacySessionSecret) return legacySessionSecret;
  return mode === 'hosted' ? '' : 'local-dev-auth-secret';
}

function firstDefined(primary: string | undefined, fallback: string | undefined) {
  if (primary !== undefined) {
    return primary;
  }

  return fallback;
}

export function hasGoogleSheetsConfig() {
  if (!sharedServicesEnabled()) {
    return false;
  }

  return Boolean(
    apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID &&
    apiConfig.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    apiConfig.GOOGLE_PRIVATE_KEY,
  );
}

export function hasMongoConfig() {
  if (!sharedServicesEnabled()) {
    return false;
  }

  return hasMongoConfigValues(
    apiConfig.MONGODB_URI,
    apiConfig.MONGODB_DB_NAME,
    apiConfig.MONGODB_COURSE_CONTENT_COLLECTION,
  );
}

export function hasMongoAssetConfig() {
  if (!sharedServicesEnabled()) {
    return false;
  }

  return hasMongoConfigValues(
    apiConfig.MONGODB_URI,
    apiConfig.MONGODB_DB_NAME,
    apiConfig.MONGODB_COURSE_ASSET_COLLECTION,
  );
}

export function hasMongoConfigValues(
  mongoUri: string | undefined,
  databaseName: string | undefined,
  collectionName: string | undefined,
) {
  return Boolean(mongoUri && databaseName && collectionName);
}

export function hasMuxConfig() {
  if (!sharedServicesEnabled()) {
    return false;
  }

  return hasMuxConfigValues(apiConfig.MUX_TOKEN_ID, apiConfig.MUX_TOKEN_SECRET);
}

export function hasMuxConfigValues(tokenId: string | undefined, tokenSecret: string | undefined) {
  return Boolean(tokenId && tokenSecret);
}

export function getCorsOrigins() {
  const corsOrigin = apiConfig.CORS_ORIGIN.trim() ? apiConfig.CORS_ORIGIN : defaultCorsOrigin;

  return corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function hasGitHubFeedbackConfig() {
  if (!sharedServicesEnabled()) return false;
  return Boolean(apiConfig.GITHUB_FEEDBACK_TOKEN && apiConfig.GITHUB_FEEDBACK_REPOSITORY);
}

export function hasMuxWebhookConfig() {
  return sharedServicesEnabled() && Boolean(apiConfig.MUX_WEBHOOK_SECRET);
}
