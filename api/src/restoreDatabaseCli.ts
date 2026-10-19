import { runConfiguredDatabaseCommand } from './databaseBackupCommand.js';

process.exitCode = await runConfiguredDatabaseCommand('restore', process.argv.slice(2));
