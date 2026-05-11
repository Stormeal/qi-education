import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
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
  createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry>;
  listFeedback(): Promise<FeedbackEntry[]>;
  updateFeedbackTriage(id: string, input: UpdateFeedbackTriageInput): Promise<FeedbackEntry | null>;
}

export class GoogleSheetsFeedbackRepository implements FeedbackRepository {
  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    const sheets = createSheetsClient();

    await ensureFeedbackHeaders();
    await sheets.spreadsheets.values.append({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: feedbackDataRange(),
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [feedbackToSheetRow(feedback)],
      },
    });

    return feedback;
  }

  async listFeedback(): Promise<FeedbackEntry[]> {
    const sheets = createSheetsClient();
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

  async updateFeedbackTriage(
    id: string,
    input: UpdateFeedbackTriageInput,
  ): Promise<FeedbackEntry | null> {
    const sheets = createSheetsClient();

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
      range: `${feedbackSheetTitle()}!J${rowNumber}:K${rowNumber}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[input.workStatus, input.priority ?? '']],
      },
    });

    const updatedRow = [...(rows[rowNumber - 1] as string[])];
    updatedRow[9] = input.workStatus;
    updatedRow[10] = input.priority ?? '';

    return feedbackFromSheetRow(updatedRow);
  }
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  private readonly feedback: FeedbackEntry[] = [];

  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    this.feedback.push(feedback);
    return feedback;
  }

  async listFeedback(): Promise<FeedbackEntry[]> {
    return [...this.feedback].reverse();
  }

  async updateFeedbackTriage(
    id: string,
    input: UpdateFeedbackTriageInput,
  ): Promise<FeedbackEntry | null> {
    const index = this.feedback.findIndex((entry) => entry.id === id);

    if (index === -1) {
      return null;
    }

    const updated = {
      ...this.feedback[index],
      workStatus: input.workStatus,
      priority: input.priority ?? undefined,
    };

    this.feedback[index] = updated;
    return updated;
  }
}

export function createFeedbackRepository(): FeedbackRepository {
  return hasGoogleSheetsConfig()
    ? new GoogleSheetsFeedbackRepository()
    : new InMemoryFeedbackRepository();
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
  const sheets = createSheetsClient();
  await ensureWorksheetHeaders(feedbackDataRange(), [...feedbackSheetHeaders]);
  await sheets.spreadsheets.values.update({
    spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
    range: `${feedbackSheetTitle()}!A1:K1`,
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
  return `${feedbackSheetTitle()}!A:K`;
}
