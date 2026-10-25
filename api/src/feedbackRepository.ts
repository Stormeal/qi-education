import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { apiConfig, hasMongoConfigValues } from './config.js';
import { getMongoDatabase } from './mongo.js';
import {
  type CreateFeedbackInput,
  type FeedbackEntry,
  type UpdateFeedbackTriageInput,
  feedbackFromSheetRow,
  feedbackSheetHeaders,
  feedbackToSheetRow,
} from './feedback.js';
import type { AuthenticatedUser } from './auth.js';
import { createSheetsClient, ensureWorksheetHeaders } from './googleSheets.js';

export interface FeedbackRepository {
  readonly storageType?: 'memory' | 'mongodb' | 'google-sheets' | 'unavailable';
  readonly readOnly?: boolean;
  createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry>;
  listFeedback(): Promise<FeedbackEntry[]>;
  findFeedbackById(id: string): Promise<FeedbackEntry | null>;
  updateFeedbackTriage(
    id: string,
    input: UpdateFeedbackTriageRecord,
  ): Promise<FeedbackEntry | null>;
}

export type UpdateFeedbackTriageRecord = UpdateFeedbackTriageInput & {
  githubIssueNumber?: number;
  githubIssueUrl?: string;
};

export class GoogleSheetsFeedbackRepository implements FeedbackRepository {
  readonly storageType = 'google-sheets' as const;
  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    const sheets = await createSheetsClient();

    await ensureFeedbackHeaders();
    await sheets.spreadsheets.values.append({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: feedbackDataRange(),
      valueInputOption: 'RAW',
      requestBody: {
        values: [feedbackToSheetRow(feedback)],
      },
    });

    return feedback;
  }

  async listFeedback(): Promise<FeedbackEntry[]> {
    const sheets = await createSheetsClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: feedbackDataRange(),
    });

    const rows = result.data.values ?? [];

    return rows
      .slice(1)
      .map((row) => feedbackFromSheetRow(row as string[]))
      .filter((entry) => entry.id)
      .reverse();
  }

  async findFeedbackById(id: string): Promise<FeedbackEntry | null> {
    const feedback = await this.listFeedback();
    return feedback.find((entry) => entry.id === id) ?? null;
  }

  async updateFeedbackTriage(
    id: string,
    input: UpdateFeedbackTriageRecord,
  ): Promise<FeedbackEntry | null> {
    const sheets = await createSheetsClient();

    await ensureFeedbackHeaders();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: feedbackDataRange(),
    });
    const rows = result.data.values ?? [];
    const rowIndex = rows.slice(1).findIndex((row) => row[0] === id);

    if (rowIndex === -1) {
      return null;
    }

    const rowNumber = rowIndex + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${feedbackSheetTitle()}!J${rowNumber}:M${rowNumber}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          input.workStatus,
          input.priority ?? '',
          input.githubIssueNumber?.toString() ?? '',
          input.githubIssueUrl ?? '',
        ]],
      },
    });

    const updatedRow = [...(rows[rowNumber - 1] as string[])];
    updatedRow[9] = input.workStatus;
    updatedRow[10] = input.priority ?? '';
    updatedRow[11] = input.githubIssueNumber?.toString() ?? '';
    updatedRow[12] = input.githubIssueUrl ?? '';

    return feedbackFromSheetRow(updatedRow);
  }
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  readonly storageType = 'memory' as const;
  readonly readOnly = false;
  private readonly feedback: FeedbackEntry[] = [];

  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    this.feedback.push(feedback);
    return feedback;
  }

  async listFeedback(): Promise<FeedbackEntry[]> {
    return [...this.feedback].reverse();
  }

  async findFeedbackById(id: string): Promise<FeedbackEntry | null> {
    return this.feedback.find((entry) => entry.id === id) ?? null;
  }

  async updateFeedbackTriage(
    id: string,
    input: UpdateFeedbackTriageRecord,
  ): Promise<FeedbackEntry | null> {
    const index = this.feedback.findIndex((entry) => entry.id === id);

    if (index === -1) {
      return null;
    }

    const updated = {
      ...this.feedback[index],
      workStatus: input.workStatus,
      priority: input.priority ?? undefined,
      githubIssueNumber: input.githubIssueNumber ?? this.feedback[index].githubIssueNumber,
      githubIssueUrl: input.githubIssueUrl ?? this.feedback[index].githubIssueUrl,
    };

    this.feedback[index] = updated;
    return updated;
  }
}

export class FeedbackStoreUnavailableError extends Error {
  constructor(cause?: unknown) { super('Feedback storage is unavailable. Try again shortly.', { cause }); this.name = 'FeedbackStoreUnavailableError'; }
}

export class FeedbackReadOnlyError extends Error {
  constructor() { super('Feedback is temporarily read-only for maintenance. Try again shortly.'); this.name = 'FeedbackReadOnlyError'; }
}

export class UnavailableFeedbackRepository implements FeedbackRepository {
  readonly storageType = 'unavailable' as const;
  readonly readOnly = false;
  async createFeedback(_input: CreateFeedbackInput, _user: AuthenticatedUser): Promise<FeedbackEntry> { throw new FeedbackStoreUnavailableError(); }
  async listFeedback(): Promise<FeedbackEntry[]> { throw new FeedbackStoreUnavailableError(); }
  async findFeedbackById(_id: string): Promise<FeedbackEntry | null> { throw new FeedbackStoreUnavailableError(); }
  async updateFeedbackTriage(_id: string, _input: UpdateFeedbackTriageRecord): Promise<FeedbackEntry | null> { throw new FeedbackStoreUnavailableError(); }
}

export type FeedbackDocument = FeedbackEntry & { _id: string };
export type FeedbackCollection = Pick<Collection<FeedbackDocument>, 'createIndex' | 'insertOne' | 'find' | 'findOne' | 'findOneAndUpdate'>;

export class MongoFeedbackRepository implements FeedbackRepository {
  readonly storageType = 'mongodb' as const;
  readonly readOnly = false;
  private ready?: Promise<FeedbackCollection>;
  constructor(private readonly provider: () => Promise<FeedbackCollection> = async () =>
    (await getMongoDatabase()).collection<FeedbackDocument>(`${apiConfig.MONGODB_COURSE_CONTENT_COLLECTION}_feedback`)) {}

  private collection(): Promise<FeedbackCollection> {
    if (!this.ready) {
      this.ready = (async () => {
        const collection = await this.provider();
        await collection.createIndex({ createdAt: -1, _id: -1 }, { name: 'feedback_newest_first' });
        return collection;
      })();
      this.ready.catch(() => { this.ready = undefined; });
    }
    return this.ready;
  }

  private async access<T>(operation: (collection: FeedbackCollection) => Promise<T>): Promise<T> {
    try { return await operation(await this.collection()); }
    catch (error) { throw new FeedbackStoreUnavailableError(error); }
  }

  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const entry = createFeedbackEntry(input, user);
    await this.importFeedback(entry);
    return entry;
  }

  /** Stable-ID insertion only: never replaces a target record during migration. */
  async importFeedback(entry: FeedbackEntry): Promise<void> {
    await this.access(async collection => {
      const document = Object.fromEntries(Object.entries({ ...entry, _id: entry.id }).filter(([, value]) => value !== undefined)) as FeedbackDocument;
      const result = await collection.insertOne(document, { writeConcern: { w: 'majority' } });
      if (!result.acknowledged) throw new Error('Feedback write was not acknowledged');
    });
  }

  async listFeedback(): Promise<FeedbackEntry[]> {
    return this.access(async collection => (await collection.find({}).sort({ createdAt: -1, _id: -1 }).toArray()).map(fromFeedbackDocument));
  }

  async findFeedbackById(id: string): Promise<FeedbackEntry | null> {
    return this.access(async collection => {
      const entry = await collection.findOne({ _id: id });
      return entry ? fromFeedbackDocument(entry) : null;
    });
  }

  async updateFeedbackTriage(id: string, input: UpdateFeedbackTriageRecord): Promise<FeedbackEntry | null> {
    return this.access(async collection => {
      const fields: Partial<FeedbackEntry> = { workStatus: input.workStatus };
      if (input.priority != null) fields.priority = input.priority;
      if (input.githubIssueNumber !== undefined) fields.githubIssueNumber = input.githubIssueNumber;
      if (input.githubIssueUrl !== undefined) fields.githubIssueUrl = input.githubIssueUrl;
      const entry = await collection.findOneAndUpdate({ _id: id }, {
        $set: fields,
        ...(input.priority == null ? { $unset: { priority: '' } } : {}),
      }, { returnDocument: 'after', includeResultMetadata: false, writeConcern: { w: 'majority' } });
      return entry ? fromFeedbackDocument(entry) : null;
    });
  }
}

const feedbackEntryFields = [
  'id', 'userId', 'userEmail', 'userRole', 'page', 'createdAt', 'type', 'summary',
  'rating', 'message', 'userAgent', 'path', 'reproductionSteps', 'expectedBehavior',
  'workStatus', 'priority', 'githubIssueNumber', 'githubIssueUrl', 'courseId',
  'componentId', 'lessonFeedbackKind', 'problemCategory',
] as const satisfies readonly (keyof FeedbackEntry)[];

function fromFeedbackDocument(document: FeedbackDocument): FeedbackEntry {
  return Object.fromEntries(feedbackEntryFields
    .filter(field => Object.hasOwn(document, field) && document[field] !== undefined)
    .map(field => [field, document[field]])) as FeedbackEntry;
}

export function feedbackWriteFreeze(repository: FeedbackRepository, enabled: boolean): FeedbackRepository {
  if (!enabled) return repository;
  return {
    storageType: repository.storageType,
    readOnly: true,
    async createFeedback() { throw new FeedbackReadOnlyError(); },
    async updateFeedbackTriage() { throw new FeedbackReadOnlyError(); },
    listFeedback: () => repository.listFeedback(),
    findFeedbackById: id => repository.findFeedbackById(id),
  };
}

export function createFeedbackRepository(settings = apiConfig): FeedbackRepository {
  const repository = settings.mode === 'isolated' ? new InMemoryFeedbackRepository()
    : hasMongoConfigValues(settings.MONGODB_URI, settings.MONGODB_DB_NAME, settings.MONGODB_COURSE_CONTENT_COLLECTION)
      ? new MongoFeedbackRepository() : new UnavailableFeedbackRepository();
  return feedbackWriteFreeze(repository, settings.FEEDBACK_STORE_READ_ONLY === '1');
}

function createFeedbackEntry(input: CreateFeedbackInput, user: AuthenticatedUser): FeedbackEntry {
  return {
    ...input,
    id: randomUUID(),
    userId: user.id,
    userEmail: user.email,
    userRole: user.role,
    createdAt: new Date().toISOString(),
  };
}

async function ensureFeedbackHeaders() {
  const sheets = await createSheetsClient();
  await ensureWorksheetHeaders(feedbackDataRange(), [...feedbackSheetHeaders]);
  await sheets.spreadsheets.values.update({
    spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${feedbackSheetTitle()}!A1:Q1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[...feedbackSheetHeaders]],
    },
  });
}

function feedbackSheetTitle(): string {
  return apiConfig.GOOGLE_SHEETS_FEEDBACK_RANGE.split('!')[0] || 'Feedback';
}

function feedbackDataRange(): string {
  return `${feedbackSheetTitle()}!A:Q`;
}
