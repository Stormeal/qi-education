import { protectCourseWrite } from './courseMutationLock.js';
import type { sheets_v4 } from 'googleapis';
import { apiConfig } from './config.js';

const sheetsScope = 'https://www.googleapis.com/auth/spreadsheets';
// X8 F9: googleapis adds about 90 MiB, so it loads on first Sheets use, not when the API starts.
// The pending promise is shared, so callers that start together still get one client.
let sharedClient: Promise<sheets_v4.Sheets> | undefined;

export function createSheetsClient(): Promise<sheets_v4.Sheets> {
  return sharedClient ??= loadSheetsClient().catch((error: unknown) => { sharedClient = undefined; throw error; });
}

async function loadSheetsClient(): Promise<sheets_v4.Sheets> {
  const { google } = await import('googleapis');
  const auth = new google.auth.JWT({
    email: apiConfig.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: apiConfig.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: [sheetsScope]
  });

  return google.sheets({ version: 'v4', auth });
}

export async function ensureWorksheetHeaders(range: string, headers: string[]) {
  const sheetTitle = range.split('!')[0];

  if (!sheetTitle) {
    return;
  }

  const sheets = await createSheetsClient();
  const spreadsheetId = apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID;
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))'
  });
  const sheetExists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === sheetTitle);

  if (!sheetExists) {
    await protectCourseWrite(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle
              }
            }
          }
        ]
      }
    }));
  }

  const headerRange = `${sheetTitle}!A1:${toColumnName(headers.length)}1`;
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange
  });
  const existingHeaders = (headerResponse.data.values?.[0] as string[] | undefined) ?? [];
  const headersMatch = headers.every((header, index) => (existingHeaders[index] ?? '') === header);

  if (existingHeaders.length < headers.length || !headersMatch) {
    await protectCourseWrite(() => sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRange,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    }));
  }
}

function toColumnName(index: number) {
  let remaining = index;
  let columnName = '';

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    columnName = String.fromCharCode(65 + offset) + columnName;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return columnName;
}
