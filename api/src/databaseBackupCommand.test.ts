import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupDatabase } from './databaseBackup.js';
import { runDatabaseCommand, runConfiguredDatabaseCommand, type DatabaseCommandSettings } from './databaseBackupCommand.js';
import { fakeBackupDatabase } from '../test/fakeBackupDatabase.js';

const mongo = vi.hoisted(() => ({ createMongoClient: vi.fn(() => { throw new Error('No real Mongo connection'); }) }));
vi.mock('./mongo.js', () => mongo);
const folders: string[] = [];
const settings: DatabaseCommandSettings = { mode: 'shared', sharedServices: '1', uri: 'synthetic-mongo-uri', database: 'source' };
async function temporary() { const folder = await mkdtemp(join(tmpdir(), 'qi-db-command-')); folders.push(folder); return folder; }
afterEach(async () => {
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) {
    if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith('qi-db-command-')) throw new Error('Unsafe test cleanup target');
    await rm(folder, { recursive: true, force: true });
  }
});
function io() { const output: string[] = [], errors: string[] = []; return { output, errors, log: (line: string) => output.push(line), error: (line: string) => errors.push(line) }; }

describe.each(['backup', 'restore'] as const)('US-P017 %s command refusal', command => {
  const args = command === 'backup' ? ['--out', 'unused'] : ['--from', 'unused', '--into', 'scratch'];
  it.each([
    { mode: 'isolated', sharedServices: undefined }, { mode: 'isolated', sharedServices: '1' },
    { mode: 'shared', sharedServices: '0' }, { mode: 'shared', sharedServices: 'true' }, { mode: 'hosted', sharedServices: '1' },
  ] as const)('requires exact opt-in and shared local mode (%j)', async markers => {
    const connect = vi.fn(), messages = io();
    expect(await runDatabaseCommand(command, args, { ...settings, ...markers }, { ...messages, connect })).toBe(1);
    expect(connect).not.toHaveBeenCalled(); expect(messages.errors).toEqual(['Database commands require USE_SHARED_SERVICES=1 in shared local mode.']);
  });
  it('refuses missing flags before connecting', async () => {
    const connect = vi.fn(), messages = io();
    expect(await runDatabaseCommand(command, [], settings, { ...messages, connect })).toBe(1);
    expect(connect).not.toHaveBeenCalled(); expect(messages.errors).toHaveLength(1);
  });
  it.each(['--unknown', 'positional'])('refuses malformed arguments %s before connecting', async argument => {
    const connect = vi.fn(), messages = io();
    expect(await runDatabaseCommand(command, [argument], settings, { ...messages, connect })).toBe(1);
    expect(connect).not.toHaveBeenCalled(); expect(messages.errors[0]).toContain('Usage:');
  });
  it.each(['uri', 'database'] as const)('requires %s without printing its value', async field => {
    const connect = vi.fn(), messages = io();
    expect(await runDatabaseCommand(command, args, { ...settings, [field]: undefined }, { ...messages, connect })).toBe(1);
    expect(connect).not.toHaveBeenCalled(); expect(messages.errors).toEqual(['Valid MONGODB_URI and MONGODB_DB_NAME settings are required.']);
  });
  it('redacts connection errors instead of printing URI, records or password hashes', async () => {
    const connect = vi.fn(async () => { throw new Error('mongodb://private:secret@host {"passwordHash":"private-hash"}'); });
    const messages = io();
    expect(await runDatabaseCommand(command, args, settings, { ...messages, connect })).toBe(1);
    expect(messages.errors).toEqual(['Database command failed. Check MongoDB access, backup files and available disk space.']);
    expect(messages.output).toEqual([]);
  });
  it('the configured runner refuses the test process without loading a Mongo client', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runConfiguredDatabaseCommand(command, args)).toBe(1);
    expect(error).toHaveBeenCalledWith('Database commands require USE_SHARED_SERVICES=1 in shared local mode.');
    expect(mongo.createMongoClient).not.toHaveBeenCalled();
  });
});

describe('US-P017 command contract and verification', () => {
  it.each(['backup', 'restore'] as const)('the %s entry point sets exit code 1 in an isolated process', async command => {
    const previousArgs = process.argv, previousCode = process.exitCode;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.argv = ['node', 'synthetic-cli', ...(command === 'backup' ? ['--out', 'unused'] : ['--from', 'unused', '--into', 'scratch'])];
    try {
      if (command === 'backup') await import('./backupDatabaseCli.js');
      else await import('./restoreDatabaseCli.js');
      expect(process.exitCode).toBe(1);
      expect(error).toHaveBeenCalledWith('Database commands require USE_SHARED_SERVICES=1 in shared local mode.');
      expect(mongo.createMongoClient).not.toHaveBeenCalled();
    } finally { process.argv = previousArgs; process.exitCode = previousCode; }
  });
  it('AC01/AC02 prints the agreed success lines and connects restore only to --into', async () => {
    const folder = await temporary(), source = fakeBackupDatabase('source', { records: { documents: [{ _id: 'one', passwordHash: 'private-hash' }] } });
    const target = fakeBackupDatabase('scratch'), close = vi.fn(async () => {}), messages = io();
    const connect = vi.fn(async (_uri: string, database: string) => ({ database: database === 'source' ? source.database : target.database, close }));
    expect(await runDatabaseCommand('backup', ['--out', folder], settings, { ...messages, connect })).toBe(0);
    expect(messages.output).toEqual(['records: 1 documents', `Backup complete: 1 collections, 1 documents in ${folder}`]);
    expect(await runDatabaseCommand('restore', ['--from', folder, '--into', 'scratch'], settings, { ...messages, connect })).toBe(0);
    expect(messages.output.at(-1)).toBe('Restore verified: 1 collections, 1 documents into scratch');
    expect(connect.mock.calls).toEqual([['synthetic-mongo-uri', 'source'], ['synthetic-mongo-uri', 'scratch']]);
    expect(close).toHaveBeenCalledTimes(2); expect(messages.errors).toEqual([]);
    expect(messages.output.join('\n')).not.toContain('private-hash');
  });
  it('AC02 a final database count mismatch exits 1, closes the client and never prints verified', async () => {
    const folder = await temporary(), source = fakeBackupDatabase('source', { records: { documents: [{ _id: 'one' }] } });
    await backupDatabase(source.database, folder);
    const target = fakeBackupDatabase('scratch'), close = vi.fn(async () => {}), messages = io();
    target.setCountResult((_name, count) => count - 1);
    const connect = vi.fn(async () => ({ database: target.database, close }));
    expect(await runDatabaseCommand('restore', ['--from', folder, '--into', 'scratch'], settings, { ...messages, connect })).toBe(1);
    expect(messages.errors).toEqual(['Restored document count does not match its manifest.']);
    expect(messages.output.join('\n')).not.toContain('Restore verified:'); expect(close).toHaveBeenCalledOnce();
  });
  it('AC02 a populated target exits 1 without writes', async () => {
    const folder = await temporary(), source = fakeBackupDatabase('source', { records: { documents: [{ _id: 'one' }] } });
    await backupDatabase(source.database, folder);
    const target = fakeBackupDatabase('scratch', { other: { documents: [{ _id: 'keep' }] } }), messages = io();
    const close = vi.fn(async () => {});
    expect(await runDatabaseCommand('restore', ['--from', folder, '--into', 'scratch'], settings,
      { ...messages, connect: async () => ({ database: target.database, close }) })).toBe(1);
    expect(target.events.every(event => event.operation === 'count')).toBe(true); expect(close).toHaveBeenCalledOnce();
  });
  it('AC01 a non-empty output exits 1, closes the client, and keeps existing files', async () => {
    const folder = await temporary(); await writeFile(join(folder, 'keep'), 'keep');
    const source = fakeBackupDatabase('source'), close = vi.fn(async () => {}), messages = io();
    expect(await runDatabaseCommand('backup', ['--out', folder], settings,
      { ...messages, connect: async () => ({ database: source.database, close }) })).toBe(1);
    expect(messages.errors).toEqual(['Backup folder must be empty.']); expect(close).toHaveBeenCalledOnce();
  });
  it.each(['bad.name', 'has space', '../source', 'x'.repeat(64)])('refuses invalid target name %j before connecting', async database => {
    const connect = vi.fn(), messages = io();
    expect(await runDatabaseCommand('restore', ['--from', 'unused', '--into', database], settings, { ...messages, connect })).toBe(1);
    expect(connect).not.toHaveBeenCalled();
  });
  it('refuses duplicate options rather than choosing a different output or target silently', async () => {
    const connect = vi.fn(), messages = io();
    expect(await runDatabaseCommand('restore', ['--from', 'unused', '--into', 'one', '--into', 'two'], settings, { ...messages, connect })).toBe(1);
    expect(connect).not.toHaveBeenCalled();
  });
});
