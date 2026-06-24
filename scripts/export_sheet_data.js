/**
 * Google Sheets에서 모든 데이터를 추출하여 JSON 파일로 저장
 * 사용법: cd /home/synkm/YSNEW/SummarizerPYM/server && node ../../ysnew2/scripts/export_sheet_data.js
 */
import { google } from 'googleapis';
import { getSheetsAuthClient } from '../src/services/auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../SummarizerPYM/.env') });

const SPREADSHEET_ID = '1ou-Nz0NNChhH4HZ3lq-MwnbuRacbY7MF8IzCya5Ndcg';
const sheets = google.sheets('v4');
const auth = getSheetsAuthClient();

async function exportSheet(tabName) {
  console.log(`Exporting sheet: ${tabName}...`);
  const response = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:Z`,
  });
  
  const rows = response.data.values;
  if (!rows || rows.length < 2) {
    console.log(`  -> ${tabName}: No data`);
    return [];
  }
  
  const headers = rows[0];
  const data = rows.slice(1).map((row, idx) => {
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => {
      if (h) {
        let val = row[i] !== undefined ? row[i] : '';
        // Normalize boolean strings
        if (val === 'TRUE') val = true;
        else if (val === 'FALSE') val = false;
        obj[h] = val;
      }
    });
    return obj;
  }).filter(item => item.ID && String(item.ID).trim() !== '');
  
  console.log(`  -> ${data.length} rows exported`);
  return data;
}

async function main() {
  const exportDir = path.join(__dirname, '../migration_data');
  fs.mkdirSync(exportDir, { recursive: true });
  
  const mainData = await exportSheet('main');
  fs.writeFileSync(path.join(exportDir, 'main.json'), JSON.stringify(mainData, null, 2));
  
  const githubData = await exportSheet('github');
  fs.writeFileSync(path.join(exportDir, 'github.json'), JSON.stringify(githubData, null, 2));
  
  const mixData = await exportSheet('NotebookLM_Mix');
  fs.writeFileSync(path.join(exportDir, 'notebooklm_mix.json'), JSON.stringify(mixData, null, 2));
  
  console.log('\n=== Export Complete ===');
  console.log(`main: ${mainData.length} rows`);
  console.log(`github: ${githubData.length} rows`);
  console.log(`notebooklm_mix: ${mixData.length} rows`);
  console.log(`Files saved to: ${exportDir}`);
}

main().catch(console.error);
