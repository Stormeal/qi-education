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
