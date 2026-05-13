#!/usr/bin/env node
// scripts/migrate-text-to-rich.mjs
//
// One-time migration: convert legacy plain-text content in rich-text columns
// to safe HTML so newlines and runs of spaces are preserved on render.
//
// Skips any row that already contains an HTML tag (idempotent).
//
// Usage:
//   Dry run (default, no writes):
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-text-to-rich.mjs
//
//   Apply changes:
//     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-text-to-rich.mjs --apply
//
// Requires the service-role key so RLS does not block updates. Do NOT commit
// the key — pass it via the environment at runtime.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToSafeHtml(plain) {
  if (plain == null) return '';
  return escapeHtml(String(plain))
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>')
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
    .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

function looksLikeHtml(value) {
  if (typeof value !== 'string') return false;
  return /<[a-z!\/][\s\S]*?>/i.test(value);
}

const targets = [
  { table: 'newsletters',           cols: ['welcome_message', 'welcome_message_en'] },
  { table: 'section_illumination',  cols: ['body_ar', 'body_en'] },
  { table: 'section_inspiring',     cols: ['body_ar', 'body_en'] },
  { table: 'section_news_items',    cols: ['summary_ar', 'summary_en'] },
  { table: 'section_article_items', cols: ['excerpt_ar', 'excerpt_en'] },
  { table: 'section_podcast',       cols: ['description_ar', 'description_en'] },
];

let totalChecked = 0;
let totalChanged = 0;
let totalSkippedHtml = 0;

for (const { table, cols } of targets) {
  const { data, error } = await supabase.from(table).select(['id', ...cols].join(','));
  if (error) {
    console.error(`[${table}] read error:`, error.message);
    continue;
  }

  for (const row of data) {
    totalChecked += 1;
    const patch = {};
    for (const c of cols) {
      const v = row[c];
      if (v == null || v === '') continue;
      if (typeof v !== 'string') continue;
      if (looksLikeHtml(v)) { totalSkippedHtml += 1; continue; }
      patch[c] = textToSafeHtml(v);
    }
    if (Object.keys(patch).length === 0) continue;

    totalChanged += 1;
    console.log(`[${table}] id=${row.id} → updating: ${Object.keys(patch).join(', ')}`);
    if (APPLY) {
      const { error: upErr } = await supabase.from(table).update(patch).eq('id', row.id);
      if (upErr) console.error(`  ✗ update failed:`, upErr.message);
    }
  }
}

console.log('');
console.log(`Mode:           ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
console.log(`Rows checked:   ${totalChecked}`);
console.log(`Rows to change: ${totalChanged}`);
console.log(`Skipped (already HTML): ${totalSkippedHtml}`);
if (!APPLY && totalChanged > 0) {
  console.log('\nRun again with --apply to commit changes.');
}
