// Public Supabase client for frontend pages
// Uses the public (anon/publishable) key — safe for read-only operations
const SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FfSXeg7MY_fQvuot_uIdWQ_eot3x8jr';
const sbClient = (() => {
  if (typeof createClient === 'function') return createClient(SUPABASE_URL, SUPABASE_KEY);
  if (typeof supabase !== 'undefined' && supabase.createClient) return supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return null;
})();

function youtubeThumbnailFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    let id = null;
    if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
    else if (u.searchParams.has('v')) id = u.searchParams.get('v');
    else {
      const parts = u.pathname.split('/');
      id = parts.pop() || parts.pop();
    }
    if (!id) return null;
    id = id.split('?')[0].split('&')[0];
    return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
  } catch (e) {
    return null;
  }
}

export { sbClient as supabasePublic, youtubeThumbnailFromUrl };
