import { mkdtemp, rm, readFile, readdir, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BSON, type Document } from 'mongodb';
import { backupDatabase, restoreDatabase } from './databaseBackup.js';
import { fakeBackupDatabase } from '../test/fakeBackupDatabase.js';

const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0)) {
    if (dirname(resolve(folder)) !== resolve(tmpdir()) || !basename(folder).startsWith('qi-backup-')) throw new Error('Unsafe test cleanup target');
    await rm(folder, { recursive: true, force: true });
  }
});
async function temporary() { const folder = await mkdtemp(join(tmpdir(), 'qi-backup-test-')); folders.push(folder); return folder; }
const canonical = (value: unknown) => BSON.EJSON.stringify(value, { relaxed: false });
const writes = (fake: ReturnType<typeof fakeBackupDatabase>) => fake.events.filter(event => ['create', 'insert', 'indexes'].includes(event.operation));

describe('US-P017-AC01 backup destination protection', () => {
  it('refuses an output folder inside the repository before opening any database cursor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qi-backup-repo-')); folders.push(root);
    const database = { databaseName: 'synthetic', listCollections() { throw new Error('Must not read the database'); } } as never;
    await expect(backupDatabase(database, resolve(root, 'private-data'), { repositoryRoot: root })).rejects.toThrow('outside the repository');
  });

  it('refuses a non-empty output folder without overwriting its files or reading the database', async () => {
    const folder = await temporary(), fake = fakeBackupDatabase('source');
    await writeFile(join(folder, 'keep.txt'), 'keep');
    await expect(backupDatabase(fake.database, folder)).rejects.toThrow('must be empty');
    expect(await readFile(join(folder, 'keep.txt'), 'utf8')).toBe('keep'); expect(fake.events).toEqual([]);
  });
  it('resolves junctions/symlinks before checking whether output is inside the repository', async () => {
    const base = await temporary(), root = join(base, 'repo'), alias = join(base, 'alias');
    await mkdir(root); await symlink(root, alias, 'junction');
    const fake = fakeBackupDatabase('source');
    await expect(backupDatabase(fake.database, join(alias, 'backup'), { repositoryRoot: root })).rejects.toThrow('outside the repository');
    expect(await readdir(root)).toEqual([]); expect(fake.events).toEqual([]);
  });
  it('also refuses a repository path that traverses an outward junction', async () => {
    const base = await temporary(), root = join(base, 'repo'), outside = join(base, 'outside');
    await mkdir(root); await mkdir(outside); await symlink(outside, join(root, 'alias'), 'junction');
    await expect(backupDatabase(fakeBackupDatabase('source').database, join(root, 'alias', 'backup'), { repositoryRoot: root })).rejects.toThrow('outside the repository');
    expect(await readdir(outside)).toEqual([]);
  });
  it.each(['../escape', 'sub/path', 'CON', 'trailing.'])('refuses collection name %j that cannot be a safe filename', async name => {
    const fake = fakeBackupDatabase('source', { [name]: { documents: [] } });
    await expect(backupDatabase(fake.database, await temporary())).rejects.toThrow('safe backup filenames');
    expect(fake.events).toEqual([]);
  });
  it('refuses collection filenames that would collide on Windows', async () => {
    const fake = fakeBackupDatabase('source', { Users: { documents: [] }, users: { documents: [] } });
    await expect(backupDatabase(fake.database, await temporary())).rejects.toThrow('safe backup filenames');
  });
});

describe('US-P017-AC01/AC02 round-trip backup and restore', () => {
  it('keeps BSON values, nested arrays, IDs and empty collections, and recreates unique/TTL indexes', async () => {
    const records: Document[] = [{ _id: new BSON.ObjectId('0123456789abcdef01234567'), title: 'literal\ntext',
      number: 42, double: new BSON.Double(42), large: BSON.Long.fromString('9223372036854775807'),
      price: BSON.Decimal128.fromString('123.4500'), date: new Date('2026-10-19T00:00:00.123Z'),
      binary: new BSON.Binary(Buffer.from([0, 1, 254, 255]), 128), nested: [[1, 'two', new Date(0)], { okay: true, none: null }],
      passwordHash: 'synthetic-private-password-hash' }, { _id: 'string-id', number: 1.25 }];
    const indexes = [{ name: '_id_', key: { _id: 1 }, v: 2 },
      { name: 'unique_title', key: { title: 1 }, unique: true, v: 2, ns: 'source.records' },
      { name: 'expiry', key: { date: 1 }, expireAfterSeconds: 0, v: 2 },
      { name: 'partial', key: { title: 1 }, partialFilterExpression: { date: { $gte: new Date(0) } }, v: 2 }];
    const source = fakeBackupDatabase('source', { records: { documents: records, indexes }, empty: { documents: [] } });
    const folder = await temporary(), logs: string[] = [];
    const result = await backupDatabase(source.database, folder, { now: () => new Date('2026-10-19T00:00:00.000Z'), log: line => logs.push(line) });
    expect(result).toEqual({ collections: 2, documents: 2, folder });
    expect((await readdir(folder)).sort()).toEqual(['empty.ejson', 'manifest.json', 'records.ejson']);
    const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ createdAt: '2026-10-19T00:00:00.000Z', database: 'source', collections: [{ name: 'records', count: 2 }, { name: 'empty', count: 0 }] });
    expect(manifest.collections[0].indexes.map((index: Document) => index.name)).toEqual(['unique_title', 'expiry', 'partial']);
    const lines = (await readFile(join(folder, 'records.ejson'), 'utf8')).trimEnd().split('\n');
    expect(lines).toHaveLength(2); expect(lines[0]).toContain('"$numberInt":"42"'); expect(lines[0]).toContain('"$binary"');
    expect(writes(source)).toEqual([]);
    expect(source.events.filter(event => event.operation === 'find').every(event => (event.options as { promoteValues: boolean }).promoteValues === false)).toBe(true);
    expect(source.events.filter(event => event.operation === 'close')).toHaveLength(2);
    expect(logs).toEqual(['records: 2 documents', 'empty: 0 documents']);
    const target = fakeBackupDatabase('restored');
    expect(await restoreDatabase(target.database, folder)).toEqual({ collections: 2, documents: 2, database: 'restored' });
    expect(canonical(target.data.get('records')!.documents)).toBe(canonical(records));
    expect(target.data.has('empty')).toBe(true);
    const restored = target.data.get('records')!.indexes;
    expect(restored.find(index => index.name === 'unique_title')?.unique).toBe(true);
    expect(Number(restored.find(index => index.name === 'expiry')?.expireAfterSeconds)).toBe(0);
    expect(restored.find(index => index.name === 'partial')?.partialFilterExpression.date.$gte).toEqual(new Date(0));
    expect(Number(restored.find(index => index.name === 'unique_title')?.version)).toBe(2);
    expect(restored.some(index => Object.hasOwn(index, 'ns'))).toBe(false);
  });
  it('streams a large UTF-8 document across read chunks and inserts at most 500 records per batch', async () => {
    const documents = Array.from({ length: 501 }, (_, i) => ({ _id: i, text: i === 0 ? '𠮷'.repeat(40000) : 'small' }));
    const folder = await temporary(), source = fakeBackupDatabase('source', { arbitrary_new_collection: { documents } });
    await backupDatabase(source.database, folder);
    const target = fakeBackupDatabase('target'); await restoreDatabase(target.database, folder);
    expect(target.events.filter(event => event.operation === 'insert').map(event => event.size)).toEqual([500, 1]);
    expect(canonical(target.data.get('arbitrary_new_collection')!.documents)).toBe(canonical(documents));
  });
  it('backs up and restores a database with no collections', async () => {
    const folder = await temporary(), source = fakeBackupDatabase('source'), target = fakeBackupDatabase('target');
    expect((await backupDatabase(source.database, folder)).documents).toBe(0);
    expect(await restoreDatabase(target.database, folder)).toEqual({ collections: 0, documents: 0, database: 'target' });
    expect(writes(target)).toEqual([]);
  });
});

describe('US-P017-AC02 restore preflight and verification', () => {
  async function archive() {
    const folder = await temporary();
    await backupDatabase(fakeBackupDatabase('source', { first: { documents: [{ _id: 'one' }] }, last: { documents: [{ _id: 'two' }] } }).database, folder);
    return folder;
  }
  it.each(['last', 'unrelated'])('refuses data in existing collection %s before writing anything', async name => {
    const folder = await archive(), target = fakeBackupDatabase('target', { first: { documents: [] }, [name]: { documents: [{ _id: 'keep' }] } });
    await expect(restoreDatabase(target.database, folder)).rejects.toThrow('already holds data');
    expect(writes(target)).toEqual([]); expect(target.data.get(name)?.documents).toHaveLength(1);
  });
  it('allows existing empty collections and never drops them', async () => {
    const target = fakeBackupDatabase('target', { first: { documents: [] } });
    await restoreDatabase(target.database, await archive());
    expect(target.events.filter(event => event.operation === 'create').map(event => event.name)).toEqual(['last']);
  });
  it('refuses pre-existing non-default indexes before creating or writing any collection', async () => {
    const target = fakeBackupDatabase('target', { last: { documents: [], indexes: [
      { name: '_id_', key: { _id: 1 } }, { name: 'unexpected_ttl', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
    ] } });
    await expect(restoreDatabase(target.database, await archive())).rejects.toThrow('non-default indexes');
    expect(writes(target)).toEqual([]);
  });
  it('refuses a manifest count mismatch before any writes', async () => {
    const folder = await archive(), path = join(folder, 'manifest.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.collections[1].count++; await writeFile(path, JSON.stringify(manifest));
    const target = fakeBackupDatabase('target');
    await expect(restoreDatabase(target.database, folder)).rejects.toThrow('count does not match');
    expect(writes(target)).toEqual([]);
  });
  it('verifies every collection before creating indexes that immediately expire restored documents', async () => {
    const folder = await temporary();
    const source = fakeBackupDatabase('source', {
      first: { documents: [{ _id: 'expired', expiresAt: new Date(0) }], indexes: [
        { name: 'expiry', key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      ] },
      last: { documents: [{ _id: 'kept', title: 'unique' }], indexes: [
        { name: 'unique_title', key: { title: 1 }, unique: true },
      ] },
    });
    await backupDatabase(source.database, folder);
    const target = fakeBackupDatabase('target');
    const collection = target.database.collection.bind(target.database);
    target.database.collection = name => {
      const handle = collection(name);
      return { ...handle, async createIndexes(indexes) {
        await handle.createIndexes(indexes);
        if (indexes.some(index => index.expireAfterSeconds !== undefined)) target.data.get(name)!.documents.length = 0;
      } };
    };
    await expect(restoreDatabase(target.database, folder)).resolves.toEqual({ collections: 2, documents: 2, database: 'target' });
    expect(target.events.filter(event => ['insert', 'count', 'indexes'].includes(event.operation))
      .map(event => `${event.operation}:${event.name}`)).toEqual([
      'insert:first', 'insert:last', 'count:first', 'count:last', 'indexes:first', 'indexes:last',
    ]);
    expect(target.data.get('first')!.documents).toHaveLength(0);
    expect(target.data.get('first')!.indexes.some(index => index.name === 'expiry')).toBe(true);
    expect(target.data.get('last')!.indexes.some(index => index.name === 'unique_title')).toBe(true);
  });
  it('reports a final database count mismatch after insertion', async () => {
    const folder = await archive(), target = fakeBackupDatabase('target');
    target.setCountResult((_name, count) => count - 1);
    await expect(restoreDatabase(target.database, folder)).rejects.toThrow('count does not match');
  });
  it.each(['malformed', 'missing', 'not-document'])('validates every collection before writing when a later file is %s', async failure => {
    const folder = await archive(), path = join(folder, 'last.ejson');
    if (failure === 'missing') await rm(path);
    else await writeFile(path, failure === 'malformed' ? '{"passwordHash":"private"' : '[]\n');
    const target = fakeBackupDatabase('target');
    await expect(restoreDatabase(target.database, folder)).rejects.toThrow();
    expect(writes(target)).toEqual([]);
  });
  it('refuses manifest path traversal without creating target collections', async () => {
    const folder = await archive(), path = join(folder, 'manifest.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.collections[0].name = '../escape'; await writeFile(path, JSON.stringify(manifest));
    const target = fakeBackupDatabase('target');
    await expect(restoreDatabase(target.database, folder)).rejects.toThrow('safe backup filenames');
    expect(writes(target)).toEqual([]);
  });
});
