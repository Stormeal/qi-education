import { randomUUID } from 'node:crypto';
import { apiConfig, hasGoogleSheetsConfig } from './config.js';
import {
  type CreateFeedbackInput,
  type FeedbackEntry,
  feedbackSheetHeaders,
  feedbackToSheetRow,
} from './feedback.js';
import type { AuthenticatedUser } from './auth.js';
import { createSheetsClient, ensureWorksheetHeaders } from './googleSheets.js';

export interface FeedbackRepository {
  createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry>;
}

export class GoogleSheetsFeedbackRepository implements FeedbackRepository {
  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    const sheets = createSheetsClient();

    await ensureWorksheetHeaders(apiConfig.GOOGLE_SHEETS_FEEDBACK_RANGE, [...feedbackSheetHeaders]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: apiConfig.GOOGLE_SHEETS_FEEDBACK_RANGE,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [feedbackToSheetRow(feedback)],
      },
    });

    return feedback;
  }
}

export class InMemoryFeedbackRepository implements FeedbackRepository {
  private readonly feedback: FeedbackEntry[] = [];

  async createFeedback(input: CreateFeedbackInput, user: AuthenticatedUser): Promise<FeedbackEntry> {
    const feedback = createFeedbackEntry(input, user);
    this.feedback.push(feedback);
    return feedback;
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
