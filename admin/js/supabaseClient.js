// Admin supabase client — uses the global `createClient` provided by Supabase CDN
const url = window.__SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL || '';
const key = window.__SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

if (!url || !key) console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in environment');

export const supabase = (typeof createClient === 'function') ? createClient(url, key) : null;

export function youtubeThumbnailFromUrl(url) {
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
