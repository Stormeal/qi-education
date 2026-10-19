import { existsSync, readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'api', '.env');
const options = new Set(process.argv.slice(2));
const skipServer = options.has('--skip-server');
const localApiBaseUrl = process.env.QI_ACADEMY_LOCAL_API ?? process.env.QI_EDUCATION_LOCAL_API ?? 'http://localhost:3001';

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
  return existsSync(path) ? new Map(Object.entries(parseDotenv(readFileSync(path, 'utf8')))) : new Map();
}

function hasValue(env, key) {
  return Boolean(env.get(key)?.trim());
}

function hasAllValues(env, keys) {
  return keys.every((key) => hasValue(env, key));
}

// Mirror config.ts's small mode predicate; this CLI runs without a TypeScript build.
function servicesMode(env) {
  if (env.get('NODE_ENV') === 'test') return 'isolated';
  if (env.get('NODE_ENV') === 'production' || env.has('VERCEL')) return 'hosted';
  return env.get('USE_SHARED_SERVICES') === '1' ? 'shared' : 'isolated';
}

function checkEnv(env) {
  pass(`Stores: ${mode}`);
  if (!['0', '1'].includes(env.get('USER_STORE_READ_ONLY') ?? '0')) fail('USER_STORE_READ_ONLY must be 0 or 1.');
  pass(`User store: ${store}`);
  pass(`Account writes: ${readOnly ? 'read-only' : 'enabled'}`);
  if (!['0', '1'].includes(env.get('COURSE_STORE_READ_ONLY') ?? '0')) fail('COURSE_STORE_READ_ONLY must be 0 or 1.');
  pass(`Course store: ${store}`);
  pass(`Course details writes: ${courseReadOnly ? 'read-only' : 'enabled'}`);
  if (!existsSync(envPath)) {
    if (mode === 'isolated') warn('api/.env is missing; isolated local defaults will be used.');
    else { fail('api/.env is missing. Run npm run env:pull or create it from api/.env.example.'); return; }
  } else pass('api/.env exists.');

  if (hasValue(env, 'AUTH_TOKEN_SECRET') || hasValue(env, 'SESSION_SECRET')) {
    pass('Auth token secret is configured.');
  } else if (mode === 'isolated') {
    warn('Auth token secret is missing; local development will use the built-in fallback.');
  } else {
    fail('AUTH_TOKEN_SECRET is missing from api/.env.');
  }

  if (mode === 'isolated') {
    pass('Shared service settings are ignored; stores use local memory and video/issues are disabled.');
  }

  const corsOrigin = env.get('CORS_ORIGIN') ?? '';

  if (!corsOrigin || corsOrigin.includes('http://localhost:4200')) {
    pass('CORS allows the Angular localhost origin.');
  } else {
    fail('CORS_ORIGIN does not include http://localhost:4200.');
  }

  if (mode === 'isolated') return;

  const mongoContentKeys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'];
  const mongoAssetKeys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_ASSET_COLLECTION'];

  if (hasAllValues(env, mongoContentKeys)) pass('MongoDB storage for accounts, courses and content is configured.');
  else fail('MongoDB storage is incomplete. Set MONGODB_URI, MONGODB_DB_NAME, and MONGODB_COURSE_CONTENT_COLLECTION.');

  if (hasValue(env, 'MONGODB_COURSE_ASSET_COLLECTION') && !hasAllValues(env, mongoAssetKeys)) {
    fail('MongoDB asset storage is partially configured. Set all asset MongoDB variables or none.');
  } else if (hasAllValues(env, mongoAssetKeys)) {
    pass('MongoDB asset storage is configured.');
  } else {
    warn('MongoDB asset storage is not configured; thumbnails will use memory locally.');
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

  if (configResponse.body?.mode !== mode) {
    fail('Running API mode differs from the selected mode; restart it with the intended settings.');
  } else pass(`Running API mode: ${mode}`);

  const authStorage = configResponse.body?.auth?.storage;

  if (authStorage === 'mongodb') pass('Local API is using MongoDB users.');
  else if (authStorage === 'memory') warn('Local API is using in-memory demo users.');
  if (authStorage !== store) fail(`Running API user store is ${authStorage}, expected ${store}; restart it with the intended settings.`);

  const runtimeCourses = configResponse.body?.courses;
  if (runtimeCourses?.storage !== store) fail(`Running API course store is ${runtimeCourses?.storage}, expected ${store}; restart it with the intended settings.`);
  else pass(`Running API course store: ${store}`);
  if (runtimeCourses?.readOnly !== courseReadOnly) fail('Running API course readOnly differs from COURSE_STORE_READ_ONLY; restart it with the intended settings.');

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

  const mongoContentKeys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_CONTENT_COLLECTION'];
  const mongoAssetKeys = ['MONGODB_URI', 'MONGODB_DB_NAME', 'MONGODB_COURSE_ASSET_COLLECTION'];
  const expectsMongoContent = mode !== 'isolated' && hasAllValues(env, mongoContentKeys);
  const expectsMongoAssets = mode !== 'isolated' && hasAllValues(env, mongoAssetKeys);

  if (expectsMongoContent && configResponse.body?.content?.configured) {
    pass('Local API content storage is configured.');
  } else if (expectsMongoContent) {
    fail('api/.env has MongoDB values, but local API reports content storage as unconfigured.');
  } else {
    warn('Local API content storage is not configured; this is acceptable for auth-only testing.');
  }

  if (expectsMongoAssets && configResponse.body?.assets?.configured) {
    pass('Local API asset storage is configured.');
  } else if (expectsMongoAssets) {
    fail('api/.env has MongoDB asset values, but local API reports asset storage as unconfigured.');
  } else {
    warn('Local API asset storage is not configured; this is acceptable for auth-only testing.');
  }

  try {
    const authResponse = await fetchJson(`${localApiBaseUrl}/health/auth`);

    if (authResponse.status === 200 && authResponse.body?.status === 'ok') {
      pass('Local API /health/auth is ready.');
      if (authResponse.body.store !== authStorage) fail('/health/auth store differs from /health/config auth.storage.');
      if (authResponse.body.readOnly !== readOnly) fail('Running API readOnly differs from USER_STORE_READ_ONLY; restart it with the intended settings.');
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
  console.log('QI Academy local doctor');
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

// Tests do not inspect api/.env. Shell values override dotenv, including empty values.
const env = process.env.NODE_ENV === 'test' ? new Map() : parseEnvFile(envPath);
for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env.set(key, value);
const mode = servicesMode(env);
// Accounts and course details share one store: memory when isolated, MongoDB otherwise.
const store = mode === 'isolated' ? 'memory' : 'mongodb';
const readOnly = env.get('USER_STORE_READ_ONLY') === '1';
const courseReadOnly = env.get('COURSE_STORE_READ_ONLY') === '1';

checkEnv(env);
await checkServer(env);
printResults();
