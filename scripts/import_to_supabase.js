/**
 * Migration Import Script
 * JSON으로 내보낸 시트 데이터를 Supabase에 Import
 * 
 * Usage: node import_to_supabase.js
 * 
 * 환경 변수 필요:
 *   SUPABASE_URL      - Supabase 프로젝트 URL
 *   SUPABASE_SERVICE_KEY - Service Role Key (RLS 우회)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const DATA_DIR = '/home/synkm/YSNEW/SummarizerPYM/server/migration_data';

// Column name mapping from sheet header → DB column
const VID_COL_MAP = {
  'ID': 'id', 'Title': 'title', 'ChannelName': 'channel_name',
  'VideoURL': 'video_url', 'PublishDate': 'publish_date', 'Duration': 'duration',
  'ProcessDate': 'processed_at', 'Read': 'read', 'Favorite': 'favorite',
  'Summary': 'summary', 'Insights': 'insights', 'Implications': 'implications',
  'Keywords': 'keywords', 'Analysis': 'analysis', 'Transcript': 'transcript',
  'ShowTranscript': 'show_transcript', 'Image_URL': 'image_url',
  'Plus_Key': 'plus_key', 'Category': 'category', 'Model': 'model',
  'Timeline': 'timeline',
};

const MIX_COL_MAP = {
  'type': 'type', 'url': 'url', 'sourceIds': 'source_ids', 'title': 'title',
};

function mapRow(row, colMap, extra = {}) {
  const obj = { ...extra };
  for (const [sheetKey, dbKey] of Object.entries(colMap)) {
    if (row[sheetKey] !== undefined) {
      obj[dbKey] = row[sheetKey];
    }
  }
  return obj;
}

async function importTable(table, dataFile, colMap, batchSize = 50) {
  const filePath = path.join(DATA_DIR, dataFile);
  if (!fs.existsSync(filePath)) {
    console.log(`[${table}] ${dataFile} not found, skipping.`);
    return 0;
  }
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!rows || rows.length === 0) {
    console.log(`[${table}] No data rows to import.`);
    return 0;
  }

  console.log(`[${table}] Importing ${rows.length} rows...`);
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
      .map(r => mapRow(r, colMap));

    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      console.error(`[${table}] Batch error at row ${i}:`, error.message);
      errors++;
    } else {
      imported += batch.length;
      process.stdout.write(`\r  ${imported}/${rows.length} imported...`);
    }
  }

  console.log(`\n[${table}] Done: ${imported} imported, ${errors} errors.`);
  return imported;
}

async function importNotebookLMMixes(dataFile) {
  const filePath = path.join(DATA_DIR, dataFile);
  if (!fs.existsSync(filePath)) {
    console.log(`[notebooklm_mixes] ${dataFile} not found, skipping.`);
    return 0;
  }
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  if (!rows || rows.length === 0) {
    console.log(`[notebooklm_mixes] No data rows to import.`);
    return 0;
  }

  console.log(`[notebooklm_mixes] Importing ${rows.length} rows...`);
  const inserts = rows.map(r => ({
    created_at: r.generatedAt || r.created_at || new Date().toISOString(),
    type: r.type || '',
    url: r.url || '',
    source_ids: r.sourceIds || r.source_ids || '',
    title: r.title || '',
  })).filter(r => r.url);

  if (inserts.length === 0) {
    console.log('[notebooklm_mixes] No valid rows to import.');
    return 0;
  }

  const { error } = await supabase
    .from('notebooklm_mixes')
    .insert(inserts);

  if (error) {
    console.error('[notebooklm_mixes] Import error:', error.message);
    return 0;
  }

  console.log(`[notebooklm_mixes] Done: ${inserts.length} imported.`);
  return inserts.length;
}

async function main() {
  console.log('=== Supabase Migration Import ===\n');
  console.log(`Supabase URL: ${SUPABASE_URL}\n`);

  await importTable('videos', 'main.json', VID_COL_MAP);
  await importTable('github_repos', 'github.json', VID_COL_MAP);
  await importNotebookLMMixes('notebooklm_mix.json');

  // Count verification
  console.log('\n=== Verification ===');
  for (const table of ['videos', 'github_repos', 'notebooklm_mixes']) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`  ${table}: Error - ${error.message}`);
    } else {
      console.log(`  ${table}: ${count} rows`);
    }
  }

  console.log('\n=== Migration Complete ===');
}

main().catch(console.error);
