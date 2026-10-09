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
  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    const sheets = createSheetsClient();

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

  async findFeedbackById(id: string): Promise<FeedbackEntry | null> {
    const feedback = await this.listFeedback();
    return feedback.find((entry) => entry.id === id) ?? null;
  }

  async updateFeedbackTriage(
    id: string,
    input: UpdateFeedbackTriageRecord,
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
    range: `${feedbackSheetTitle()}!A1:M1`,
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
  return `${feedbackSheetTitle()}!A:M`;
}
