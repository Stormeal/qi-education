import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BSON, type Document, type IndexDescription } from 'mongodb';
import { z } from 'zod';

type CollectionList = { name: string };
type ListedDatabase = {
  databaseName: string;
  listCollections(filter: Document, options: { nameOnly: true }): { toArray(): Promise<CollectionList[]> };
};
export type BackupDatabase = ListedDatabase & {
  collection(name: string): {
    find(filter: Document, options: { promoteValues: false }): AsyncIterable<Document> & { close(): Promise<void> };
    listIndexes(): { toArray(): Promise<Document[]> };
  };
};
export type RestoreDatabase = ListedDatabase & {
  createCollection(name: string): Promise<unknown>;
  collection(name: string): {
    countDocuments(): Promise<number>;
    listIndexes(): { toArray(): Promise<Document[]> };
    insertMany(documents: Document[], options: { ordered: true; writeConcern: { w: 'majority' } }): Promise<{ acknowledged: boolean; insertedCount: number }>;
    createIndexes(indexes: IndexDescription[]): Promise<unknown>;
  };
};
const manifestSchema = z.object({
  createdAt: z.iso.datetime(), database: z.string().min(1),
  collections: z.array(z.object({ name: z.string().min(1), count: z.number().int().nonnegative().safe(), indexes: z.array(z.record(z.string(), z.unknown())) })),
});
export type BackupManifest = z.infer<typeof manifestSchema>;
export type DatabaseBackupOptions = { repositoryRoot?: string; now?: () => Date; log?: (message: string) => void };
export class DatabaseBackupError extends Error {}
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function within(root: string, path: string) {
  const rest = relative(root, path);
  return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith('..' + sep));
}
async function physicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    const parent = dirname(absolute);
    if (parent === absolute) throw error;
    return join(await physicalPath(parent), relative(parent, absolute));
  }
}
async function prepareOutput(folder: string, root: string) {
  const destination = await physicalPath(folder), actualRoot = await realpath(root);
  if (within(resolve(root), resolve(folder)) || within(actualRoot, destination)) throw new DatabaseBackupError('Backup folder must be outside the repository.');
  await mkdir(destination, { recursive: true, mode: 0o700 });
  if ((await readdir(destination)).length) throw new DatabaseBackupError('Backup folder must be empty.');
  return destination;
}
function validateNames(names: string[]) {
  const used = new Set<string>();
  for (const name of names) {
    if (!name || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || used.has(name.toLowerCase())) {
      throw new DatabaseBackupError('Collection names must map to distinct safe backup filenames.');
    }
    used.add(name.toLowerCase());
  }
}

export async function backupDatabase(database: BackupDatabase, folder: string, options: DatabaseBackupOptions = {}) {
  const destination = await prepareOutput(folder, options.repositoryRoot ?? repositoryRoot);
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  validateNames(collections.map(collection => collection.name));
  const manifest: BackupManifest = { createdAt: (options.now ?? (() => new Date()))().toISOString(), database: database.databaseName, collections: [] };
  let documents = 0;
  for (const { name } of collections) {
    const collection = database.collection(name);
    const indexes = (await collection.listIndexes().toArray()).filter(index => index.name !== '_id_');
    const file = await open(join(destination, name + '.ejson'), 'wx', 0o600);
    let count = 0;
    try {
      const cursor = collection.find({}, { promoteValues: false });
      try {
        for await (const document of cursor) {
          await file.writeFile(BSON.EJSON.stringify(document, { relaxed: false }) + '\n');
          count++;
        }
      } finally { await cursor.close(); }
    } finally { await file.close(); }
    // Index filters may also contain BSON values. Keep their EJSON types while
    // leaving manifest counts as ordinary JSON numbers.
    manifest.collections.push({ name, count, indexes: BSON.EJSON.serialize(indexes, { relaxed: false }) as Document[] });
    documents += count;
    options.log?.(`${name}: ${count} documents`);
  }
  const file = await open(join(destination, 'manifest.json'), 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(manifest, null, 2) + '\n'); }
  finally { await file.close(); }
  return { collections: collections.length, documents, folder: destination };
}

async function* lines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: 'utf8' });
  let parts: string[] = [];
  try {
    for await (const chunk of input) {
      const fragments = (chunk as string).split('\n');
      parts.push(fragments[0]);
      for (let i = 1; i < fragments.length; i++) {
        yield parts.join('');
        parts = [fragments[i]];
      }
    }
    if (parts.some(part => part.length)) yield parts.join('');
  } finally { input.destroy(); }
}
async function* documents(path: string): AsyncGenerator<{ document: Document; bytes: number }> {
  for await (const line of lines(path)) {
    let document: unknown;
    try { document = BSON.EJSON.parse(line, { relaxed: false }); }
    catch { throw new DatabaseBackupError('Backup contains invalid EJSON documents.'); }
    if (!document || typeof document !== 'object' || Array.isArray(document) || !Object.hasOwn(document, '_id')) {
      throw new DatabaseBackupError('Backup contains invalid MongoDB documents.');
    }
    yield { document: document as Document, bytes: Buffer.byteLength(line) };
  }
}
function restoreIndexes(indexes: Document[]): IndexDescription[] {
  return indexes.map(index => {
    let decoded: Document;
    try { decoded = BSON.EJSON.deserialize(index, { relaxed: false }); }
    catch { throw new DatabaseBackupError('Backup contains invalid index definitions.'); }
    if (!decoded || typeof decoded.name !== 'string' || decoded.name === '_id_' || !decoded.key || typeof decoded.key !== 'object' || Array.isArray(decoded.key)) {
      throw new DatabaseBackupError('Backup contains invalid index definitions.');
    }
    const { ns: _namespace, v: version, ...definition } = decoded;
    return { ...definition, ...(version === undefined ? {} : { version: Number(version) }) } as IndexDescription;
  });
}

export async function restoreDatabase(database: RestoreDatabase, folder: string, options: { batchSize?: number; log?: (message: string) => void } = {}) {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new DatabaseBackupError('Restore batch size must be a positive integer.');
  const source = await realpath(folder);
  let manifest: BackupManifest;
  try { manifest = manifestSchema.parse(JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))); }
  catch { throw new DatabaseBackupError('Backup manifest is missing or invalid.'); }
  validateNames(manifest.collections.map(collection => collection.name));
  // Validate files, counts and indexes without retaining the archive in memory.
  // No target collection is created until every preflight has passed.
  const indexes = new Map<string, IndexDescription[]>();
  for (const entry of manifest.collections) {
    indexes.set(entry.name, restoreIndexes(entry.indexes));
    const path = join(source, entry.name + '.ejson');
    if (!(await lstat(path)).isFile()) throw new DatabaseBackupError('Backup collection files must be regular files.');
    let count = 0;
    for await (const _document of documents(path)) count++;
    if (count !== entry.count) throw new DatabaseBackupError('Backup document count does not match its manifest.');
  }
  const existing = await database.listCollections({}, { nameOnly: true }).toArray();
  for (const { name } of existing) {
    if (await database.collection(name).countDocuments() !== 0) throw new DatabaseBackupError('Restore target database already holds data; nothing was written.');
    if ((await database.collection(name).listIndexes().toArray()).some(index => index.name !== '_id_')) {
      throw new DatabaseBackupError('Restore target has non-default indexes; use a fresh database. Nothing was written.');
    }
  }
  const names = new Set(existing.map(collection => collection.name));
  let total = 0;
  for (const entry of manifest.collections) {
    if (!names.has(entry.name)) await database.createCollection(entry.name);
    const collection = database.collection(entry.name);
    let batch: Document[] = [], bytes = 0, inserted = 0;
    const flush = async () => {
      if (!batch.length) return;
      const result = await collection.insertMany(batch, { ordered: true, writeConcern: { w: 'majority' } });
      if (!result.acknowledged || result.insertedCount !== batch.length) throw new DatabaseBackupError('Restore insert count was not confirmed.');
      inserted += result.insertedCount; batch = []; bytes = 0;
    };
    for await (const item of documents(join(source, entry.name + '.ejson'))) {
      if (batch.length && (batch.length >= batchSize || bytes + item.bytes > 8 * 1024 * 1024)) await flush();
      batch.push(item.document); bytes += item.bytes;
    }
    await flush();
    const definitions = indexes.get(entry.name)!;
    if (definitions.length) await collection.createIndexes(definitions);
    if (inserted !== entry.count) throw new DatabaseBackupError('Restored document count does not match its manifest.');
    total += inserted;
    options.log?.(`${entry.name}: ${inserted} documents`);
  }
  // Compare all collections after all writes and index creation, including TTL.
  for (const entry of manifest.collections) {
    if (await database.collection(entry.name).countDocuments() !== entry.count) throw new DatabaseBackupError('Restored document count does not match its manifest.');
  }
  return { collections: manifest.collections.length, documents: total, database: database.databaseName };
}
