import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'api', '.env');
const options = new Set(process.argv.slice(2));
const allowDemo = options.has('--allow-demo');
const skipServer = options.has('--skip-server');
const localApiBaseUrl = process.env.QI_EDUCATION_LOCAL_API ?? 'http://localhost:3001';

const checks = [];
const warnings = [];

function pass(label) {
  checks.push({ status: 'OK', label });
}

function fail(label) {
  checks.push({ status: 'FAIL', label });
}

function warn(label) {
  warnings.push(label);
}

function parseEnvFile(path) {
  const env = new Map();

  if (!existsSync(path)) {
    return env;
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env.set(key, value);
  }

  return env;
}

function hasValue(env, key) {
  return Boolean(env.get(key)?.trim());
}

function hasAnyValue(env, keys) {
  return keys.some((key) => hasValue(env, key));
}

function hasAllValues(env, keys) {
  return keys.every((key) => hasValue(env, key));
}

function checkEnv(env) {
  if (!existsSync(envPath)) {
    if (allowDemo) {
      warn('api/.env is missing; demo mode allows the in-memory users only.');
    } else {
      fail('api/.env is missing. Run npm run env:pull or create it from api/.env.example.');
    }
    return;
  }

  pass('api/.env exists.');

  if (hasValue(env, 'AUTH_TOKEN_SECRET') || hasValue(env, 'SESSION_SECRET')) {
    pass('Auth token secret is configured.');
  } else if (allowDemo) {
    warn('Auth token secret is missing; local development will use the built-in fallback.');
  } else {
    fail('AUTH_TOKEN_SECRET is missing from api/.env.');
  }

  const sheetIdConfigured =
    hasValue(env, 'GOOGLE_SHEETS_SPREADSHEET_ID') || hasValue(env, 'GOOGLE_SHEET_ID');
  const googleSheetsConfigured =
    sheetIdConfigured &&
    hasValue(env, 'GOOGLE_SERVICE_ACCOUNT_EMAIL') &&
    hasValue(env, 'GOOGLE_PRIVATE_KEY');

  if (googleSheetsConfigured) {
    pass('Google Sheets auth storage is configured.');
  } else if (allowDemo) {
    warn('Google Sheets auth storage is incomplete; local API will use demo users.');
  } else {
    fail(
      'Google Sheets auth storage is incomplete. Set GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY.',
    );
  }

  const corsOrigin = env.get('CORS_ORIGIN') ?? '';

  if (!corsOrigin || corsOrigin.includes('http://localhost:4200')) {
    pass('CORS allows the Angular localhost origin.');
  } else {
    fail('CORS_ORIGIN does not include http://localhost:4200.');
  }

  const mongoKeys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'];

  if (hasAnyValue(env, mongoKeys) && !hasAllValues(env, mongoKeys)) {
    fail('MongoDB content storage is partially configured. Set all MongoDB variables or none.');
  } else if (hasAllValues(env, mongoKeys)) {
    pass('MongoDB content storage is configured.');
  } else {
    warn('MongoDB content storage is not configured; course content will use memory locally.');
  }
}

async function checkServer(env) {
  if (skipServer) {
    warn('Skipped local API checks because --skip-server was provided.');
    return;
  }

  let configResponse;

  try {
    configResponse = await fetchJson(`${localApiBaseUrl}/health/config`);
  } catch (error) {
    fail(
      `Local API is not reachable at ${localApiBaseUrl}. Start it with npm run api:dev or npm run app:dev.`,
    );
    warn(error instanceof Error ? error.message : String(error));
    return;
  }

  if (configResponse.status === 200 && configResponse.body?.status === 'ok') {
    pass('Local API /health/config is reachable.');
  } else {
    fail(`Local API /health/config returned HTTP ${configResponse.status}.`);
    return;
  }

  const authStorage = configResponse.body?.auth?.storage;

  if (authStorage === 'google-sheets') {
    pass('Local API is using Google Sheets users.');
  } else if (allowDemo) {
    warn('Local API is using in-memory demo users.');
  } else {
    fail('Local API is using in-memory demo users, so shared/prod accounts will not work locally.');
  }

  if (configResponse.body?.auth?.configured) {
    pass('Local API auth is available.');
  } else {
    fail('Local API auth is unavailable.');
  }

  const corsOrigins = configResponse.body?.corsOrigins ?? [];

  if (Array.isArray(corsOrigins) && corsOrigins.includes('http://localhost:4200')) {
    pass('Running API CORS config includes http://localhost:4200.');
  } else {
    fail('Running API CORS config does not include http://localhost:4200.');
  }

  const mongoKeys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'];
  const expectsMongo = hasAllValues(env, mongoKeys);

  if (expectsMongo && configResponse.body?.content?.configured) {
    pass('Local API content storage is configured.');
  } else if (expectsMongo) {
    fail('api/.env has MongoDB values, but local API reports content storage as unconfigured.');
  } else {
    warn('Local API content storage is not configured; this is acceptable for auth-only testing.');
  }

  try {
    const authResponse = await fetchJson(`${localApiBaseUrl}/health/auth`);

    if (authResponse.status === 200 && authResponse.body?.status === 'ok') {
      pass('Local API /health/auth is ready.');
    } else {
      fail(`Local API /health/auth returned HTTP ${authResponse.status}.`);
    }
  } catch (error) {
    fail('Local API /health/auth could not be checked.');
    warn(error instanceof Error ? error.message : String(error));
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const body = await response.json().catch(() => null);

  return {
    status: response.status,
    body,
  };
}

function printResults() {
  console.log('QI-Education local doctor');
  console.log('');

  for (const check of checks) {
    console.log(`${check.status}: ${check.label}`);
  }

  for (const warning of warnings) {
    console.log(`WARN: ${warning}`);
  }

  const failed = checks.filter((check) => check.status === 'FAIL');

  if (failed.length > 0) {
    console.log('');
    console.log('Result: failed');
    console.log('Next: fix the FAIL items above, then run npm run doctor again.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('Result: passed');
}

const env = parseEnvFile(envPath);

checkEnv(env);
await checkServer(env);
printResults();
