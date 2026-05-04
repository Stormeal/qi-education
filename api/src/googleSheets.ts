import { google } from 'googleapis';
import { apiConfig } from './config.js';

const sheetsScope = 'https://www.googleapis.com/auth/spreadsheets';

export function createSheetsClient() {
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

  const sheets = createSheetsClient();
  const spreadsheetId = apiConfig.GOOGLE_SHEETS_SPREADSHEET_ID;
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))'
  });
  const sheetExists = metadata.data.sheets?.some((sheet) => sheet.properties?.title === sheetTitle);

  if (!sheetExists) {
    await sheets.spreadsheets.batchUpdate({
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
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetTitle}!A1:${toColumnName(headers.length)}1`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [headers]
      }
    });
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
