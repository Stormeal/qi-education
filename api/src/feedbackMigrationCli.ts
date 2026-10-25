import { pathToFileURL } from 'node:url';
import { FeedbackMigrationError, migrateFeedbackRows, type FeedbackMigrationResult } from './feedbackMigration.js';

type Dependencies = { migrate(apply: boolean): Promise<FeedbackMigrationResult>; report(message: string): void };

export async function runFeedbackMigrationCli(
  args: string[], environment: Record<string, string | undefined>, dependencies: Dependencies,
): Promise<FeedbackMigrationResult> {
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw new FeedbackMigrationError('Unknown or duplicate argument. Usage: feedback:migrate -- [--apply]');
  if (environment.USE_SHARED_SERVICES !== '1' || environment.NODE_ENV === 'test' || environment.NODE_ENV === 'production' || environment.VERCEL !== undefined) {
    throw new FeedbackMigrationError('Migration requires USE_SHARED_SERVICES=1 in shared local mode.');
  }
  const apply = args.includes('--apply');
  if (apply && environment.FEEDBACK_STORE_READ_ONLY !== '1') throw new FeedbackMigrationError('Apply requires FEEDBACK_STORE_READ_ONLY=1 and all source writers frozen.');
  const result = await dependencies.migrate(apply);
  dependencies.report(`${apply ? 'Apply' : 'Dry run'}: source=${result.sourceCount}, imported=${result.imported}, identical=${result.skipped}, pending=${result.pending}, verified=${result.verified}`);
  return result;
}

async function main(): Promise<void> {
  // Capture explicit opt-in before loading .env; normal isolated startup remains unchanged.
  const environment = { ...process.env };
  try {
    await runFeedbackMigrationCli(process.argv.slice(2), environment, {
      report: message => console.log(message),
      async migrate(apply) {
        const { apiConfig, hasGoogleSheetsConfig, hasMongoConfig } = await import('./config.js');
        if (!hasGoogleSheetsConfig() || !hasMongoConfig()) throw new FeedbackMigrationError('Migration requires complete legacy Sheets and MongoDB configuration.');
        const { google } = await import('googleapis');
        // Deliberately use a read-only scope; never call legacy header repair/append/update.
        const auth = new google.auth.JWT({ email: apiConfig.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          key: apiConfig.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
        const sheets = google.sheets({ version: 'v4', auth });
        const title = apiConfig.GOOGLE_SHEETS_FEEDBACK_RANGE.split('!')[0];
        const source = await sheets.spreadsheets.values.get({ spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID, range: `${title}!A:Q` });
        const { MongoFeedbackRepository } = await import('./feedbackRepository.js');
        const { getMongoDatabase, closeMongoClient } = await import('./mongo.js');
        try {
          const db = await getMongoDatabase();
          const collection = db.collection<import('./feedbackRepository.js').FeedbackDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_feedback`);
          // Dry runs must not create an index. The target is read directly until apply.
          const repository = new MongoFeedbackRepository(async () => collection);
          return await migrateFeedbackRows(source.data.values ?? [], {
            async findFeedbackById(id) { const doc = await collection.findOne({ _id: id }); if (!doc) return null; const { _id, ...entry } = doc; return entry; },
            importFeedback: entry => repository.importFeedback(entry),
          }, { apply });
        } finally { await closeMongoClient(); }
      },
    });
  } catch (error) {
    console.error(error instanceof FeedbackMigrationError ? error.message : 'Feedback migration failed. Check provider access and configuration.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
