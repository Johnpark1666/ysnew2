/**
 * Supabase Import Script (REST API 직접 사용 - WebSocket 불필요)
 * JSON 데이터를 Supabase REST API로 직접 Import
 * 
 * Usage: SUPABASE_URL=http://... SUPABASE_SERVICE_KEY=... node import_via_rest.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = '/home/synkm/YSNEW/SummarizerPYM/server/migration_data';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required.');
  process.exit(1);
}

async function supabaseUpsert(table, rows, batchSize = 50) {
  if (!rows || rows.length === 0) return 0;
  let imported = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(batch)
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[${table}] Error at row ${i}: HTTP ${resp.status} - ${err.substring(0, 200)}`);
    } else {
      imported += batch.length;
      process.stdout.write(`\r  ${table}: ${imported}/${rows.length}`);
    }
  }
  console.log(`\n[${table}] Done: ${imported} imported.`);
  return imported;
}

// Column mapping
const VID_COL_MAP = {
  'ID':'id','Title':'title','ChannelName':'channel_name','VideoURL':'video_url',
  'PublishDate':'publish_date','Duration':'duration','ProcessDate':'processed_at',
  'Read':'read','Favorite':'favorite','Summary':'summary','Insights':'insights',
  'Implications':'implications','Keywords':'keywords','Analysis':'analysis',
  'Transcript':'transcript','ShowTranscript':'show_transcript','Image_URL':'image_url',
  'Plus_Key':'plus_key','Category':'category','Model':'model','Timeline':'timeline',
};

function mapRow(row, colMap) {
  const obj = {};
  for (const [sk, dk] of Object.entries(colMap)) {
    if (row[sk] !== undefined) {
      let val = row[sk];
      // Convert boolean fields
      if (['read', 'favorite', 'show_transcript'].includes(dk)) {
        val = (val === true || val === 'TRUE');
      }
      obj[dk] = val;
    }
  }
  return obj;
}

async function main() {
  console.log('=== Supabase REST Import ===\n');

  // Import videos (main)
  const mainPath = path.join(DATA_DIR, 'main.json');
  if (fs.existsSync(mainPath)) {
    const data = JSON.parse(fs.readFileSync(mainPath, 'utf-8'));
    const rows = data.filter(r => r.ID && r.ID !== '!!BRIEFING_LATEST!!').map(r => mapRow(r, VID_COL_MAP));
    await supabaseUpsert('videos', rows);
  }

  // Import github_repos
  const ghPath = path.join(DATA_DIR, 'github.json');
  if (fs.existsSync(ghPath)) {
    const data = JSON.parse(fs.readFileSync(ghPath, 'utf-8'));
    const rows = data.filter(r => r.ID).map(r => mapRow(r, VID_COL_MAP));
    await supabaseUpsert('github_repos', rows);
  }

  // Import notebooklm_mixes
  const mixPath = path.join(DATA_DIR, 'notebooklm_mix.json');
  if (fs.existsSync(mixPath)) {
    const data = JSON.parse(fs.readFileSync(mixPath, 'utf-8'));
    const rows = data.filter(r => r.url).map(r => ({
      created_at: r.generatedAt || r.created_at || new Date().toISOString(),
      type: r.type || '',
      url: r.url || '',
      source_ids: r.sourceIds || r.source_ids || '',
      title: r.title || '',
    }));
    await supabaseUpsert('notebooklm_mixes', rows);
  }

  // Verify
  console.log('\n=== Verification ===');
  for (const table of ['videos', 'github_repos', 'notebooklm_mixes']) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'count=exact'
      }
    });
    const count = resp.headers.get('content-range') || '?';
    console.log(`  ${table}: ${count} rows`);
  }

  console.log('\n=== Migration Complete ===');
}

main().catch(console.error);
