import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FfSXeg7MY_fQvuot_uIdWQ_eot3x8jr';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  try {
    const { data, error } = await sb.from('issues').select('id').limit(1);
    if (error) {
      console.error('Query error (issues):', error.message || error);
      process.exit(2);
    }
    console.log('issues table reachable. rows:', (data||[]).length);
    process.exit(0);
  } catch (e) {
    console.error('Unexpected error:', e.message || e);
    process.exit(3);
  }
}

run();
