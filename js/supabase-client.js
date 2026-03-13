// js/supabase-client.js
// Shared Supabase client for public & admin pages.
// If `window.supabase` already exists (e.g., loaded via CDN or other script), reuse it.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const PUBLIC_SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
const PUBLIC_SUPABASE_KEY = 'sb_publishable_FfSXeg7MY_fQvuot_uIdWQ_eot3x8jr';

const SUPABASE_URL =
  import.meta.env?.VITE_SUPABASE_URL ||
  window.__SUPABASE_URL ||
  PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env?.VITE_SUPABASE_ANON_KEY ||
  window.__SUPABASE_ANON_KEY ||
  PUBLIC_SUPABASE_KEY;

if (!window.supabase) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('js/supabase-client.js: SUPABASE_URL or SUPABASE_ANON_KEY missing');
  }
  window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export default window.supabase;
