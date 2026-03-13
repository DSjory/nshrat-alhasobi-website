// admin_cms/supabase-client.js — initializes Supabase client by fetching env.json
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

let supabase = null;
let SUPABASE_URL = null;
let SUPABASE_KEY = null;

export async function initSupabase() {
  if (supabase) return supabase;
  try {
    const res = await fetch('/admin_cms/env.json');
    const env = await res.json();
    const url = env.VITE_SUPABASE_URL;
    const key = env.VITE_SUPABASE_ANON_KEY;
    SUPABASE_URL = url;
    SUPABASE_KEY = key;
    supabase = createClient(url, key);
    // expose globally for convenience
    window.supabase = supabase;
    return supabase;
  } catch (e) {
    console.error('Failed to initialize Supabase:', e);
    throw e;
  }
}

// Upload helper for storage bucket 'newsletter-media'
export async function uploadFileToBucket(file, prefix = '', onProgress = null) {
  if (!file) return null;
  const bucket = 'newsletter-media';
  const filePath = (prefix ? `${prefix}/` : '') + `${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
  // Note: supabase-js storage.upload does not expose granular progress callbacks in all builds.
  // Keep the signature compatible and call optional onProgress with 0/1 lifecycle events.
  try {
    if (typeof onProgress === 'function') onProgress(0);
    const { data, error } = await supabase.storage.from(bucket).upload(filePath, file, { cacheControl: '3600', upsert: false });
    if (error) throw error;
    if (typeof onProgress === 'function') onProgress(1);
    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return publicData?.publicUrl || null;
  } catch (e) {
    if (typeof onProgress === 'function') onProgress(-1);
    throw e;
  }
}

// Upload using XMLHttpRequest to provide progress events.
export async function uploadFileWithProgress(file, prefix = '', onProgress = null) {
  if (!file) return null;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase not initialized');
  const bucket = 'newsletter-media';
  const safeName = file.name.replace(/\s+/g, '_').replace(/[^\w.\-\u0600-\u06FF]/g, '_');
  const filePath = (prefix ? `${prefix}/` : '') + `${Date.now()}_${safeName}`;
  // Encode path by segment to preserve folder separators.
  const encodedPath = filePath.split('/').map((s) => encodeURIComponent(s)).join('/');
  const uploadUrl = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodedPath}`;

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || null;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken || SUPABASE_KEY}`);
    // tell Supabase whether to upsert
    xhr.setRequestHeader('x-upsert', 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(e.loaded / e.total);
      }
    };
    xhr.onload = async function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try{
          const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
          resolve(publicData?.publicUrl || null);
        }catch(err){ resolve(null); }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = function() { reject(new Error('Network error during upload')); };
    xhr.send(file);
  });
}

export { supabase };
