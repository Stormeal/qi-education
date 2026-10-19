import { parseArgs } from 'node:util';
import { backupDatabase, DatabaseBackupError, restoreDatabase, type BackupDatabase, type RestoreDatabase } from './databaseBackup.js';

type Command = 'backup' | 'restore';
export type DatabaseCommandSettings = { mode: 'isolated' | 'shared' | 'hosted'; sharedServices?: string; uri?: string; database?: string };
export type DatabaseCommandConnection = { database: BackupDatabase & RestoreDatabase; close(): Promise<void> };
type Dependencies = {
  connect(uri: string, database: string): Promise<DatabaseCommandConnection>;
  log?: (message: string) => void; error?: (message: string) => void;
};
function validDatabase(name: string | undefined): name is string {
  return Boolean(name && Buffer.byteLength(name) <= 63 && !/[\s/\\.\x00"$<>:|?*]/.test(name));
}

export async function runDatabaseCommand(command: Command, args: string[], settings: DatabaseCommandSettings, dependencies: Dependencies): Promise<number> {
  const log = dependencies.log ?? console.log, error = dependencies.error ?? console.error;
  try {
    if (settings.sharedServices !== '1' || settings.mode !== 'shared') {
      throw new DatabaseBackupError('Database commands require USE_SHARED_SERVICES=1 in shared local mode.');
    }
    let values: { out?: string; from?: string; into?: string };
    try {
      const parsed = parseArgs({ args, strict: true, allowPositionals: false, tokens: true,
        options: command === 'backup' ? { out: { type: 'string' } } : { from: { type: 'string' }, into: { type: 'string' } } });
      const seen = new Set<string>();
      for (const token of parsed.tokens ?? []) {
        if (token.kind !== 'option') continue;
        if (seen.has(token.name)) throw new Error('Duplicate option');
        seen.add(token.name);
      }
      values = parsed.values as typeof values;
    } catch { throw new DatabaseBackupError(command === 'backup' ? 'Usage: db:backup -- --out <folder>' : 'Usage: db:restore -- --from <folder> --into <database>'); }
    const folder = command === 'backup' ? values.out : values.from;
    if (!folder?.trim()) throw new DatabaseBackupError(command === 'backup' ? 'A backup --out folder is required.' : 'A restore --from folder is required.');
    if (!settings.uri?.trim() || !validDatabase(settings.database)) throw new DatabaseBackupError('Valid MONGODB_URI and MONGODB_DB_NAME settings are required.');
    if (command === 'restore' && !validDatabase(values.into)) throw new DatabaseBackupError('A valid --into database name is required.');
    const connection = await dependencies.connect(settings.uri, command === 'backup' ? settings.database : values.into!);
    let success: string;
    try {
      if (command === 'backup') {
        const result = await backupDatabase(connection.database, folder, { log });
        success = `Backup complete: ${result.collections} collections, ${result.documents} documents in ${result.folder}`;
      } else {
        const result = await restoreDatabase(connection.database, folder, { log });
        success = `Restore verified: ${result.collections} collections, ${result.documents} documents into ${connection.database.databaseName}`;
      }
    } finally { await connection.close(); }
    log(success);
    return 0;
  } catch (failure) {
    error(failure instanceof DatabaseBackupError ? failure.message : 'Database command failed. Check MongoDB access, backup files and available disk space.');
    return 1;
  }
}

// Config is loaded only inside this guarded boundary. Tests call the runner
// with synthetic settings and a double; they never opt into shared services.
export async function runConfiguredDatabaseCommand(command: Command, args: string[]): Promise<number> {
  try {
    const { apiConfig, getServicesMode } = await import('./config.js');
    return await runDatabaseCommand(command, args, {
      mode: getServicesMode(), sharedServices: process.env.USE_SHARED_SERVICES,
      uri: apiConfig.MONGODB_URI, database: apiConfig.MONGODB_DB_NAME,
    }, {
      async connect(uri, name) {
        const { createMongoClient } = await import('./mongo.js');
        const client = createMongoClient(uri);
        try {
          await client.connect();
          return { database: client.db(name), close: () => client.close() };
        } catch (failure) { await client.close().catch(() => {}); throw failure; }
      },
    });
  } catch {
    console.error('Database command failed. Check the local MongoDB configuration.');
    return 1;
  }
}
