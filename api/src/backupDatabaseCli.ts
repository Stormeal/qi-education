import { runConfiguredDatabaseCommand } from './databaseBackupCommand.js';

process.exitCode = await runConfiguredDatabaseCommand('backup', process.argv.slice(2));
