import { supabasePublic } from './supabase-public.js';

const sb = supabasePublic;
const SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';

function resolveCoverUrl(value) {
  if (!value) return '/assets/img/شعار نشرة الحاسوبي باللون الازرق.png';
  if (/^https?:\/\//i.test(value)) return value;
  let path = String(value).replace(/^\/+/, '');
  path = path.replace(/^newsletter-media\//, '');
  const encoded = path.split('/').map((s) => encodeURIComponent(s)).join('/');
  return `${SUPABASE_URL}/storage/v1/object/public/newsletter-media/${encoded}`;
}

function normalizeNewsletter(nl, locale) {
  const isEn = locale === 'en';
  return {
    id: nl.id,
    number: nl.edition_number ?? nl.issue_number ?? '-',
    title: isEn
      ? (nl.title_en || 'Untitled')
      : (nl.title_ar || nl.title_en || 'بدون عنوان'),
    category: isEn
      ? ((nl.categories && (nl.categories.name_en || nl.categories.name_ar)) || 'Uncategorized')
      : ((nl.categories && (nl.categories.name_ar || nl.categories.name_en)) || 'غير مصنف'),
    cover: resolveCoverUrl(nl.cover_image_url)
  };
}

async function fetchNewsletters(locale) {
  // Primary query: current schema
  let query = sb
    .from('newsletters')
    .select('id,edition_number,title_ar,title_en,cover_image_url,status,has_translation,categories(name_ar,name_en),created_at')
    .eq('status', 'published');

  // Filter by has_translation=true for English locale
  if (locale === 'en') {
    query = query.eq('has_translation', true).not('title_en', 'is', null);
  }

  let res = await query.order('created_at', { ascending: false });

  // Fallback A: current schema without translation columns
  if (res.error && res.error.code === '42703') {
    if (locale === 'en') {
      // Do not show Arabic-only issues on English page when translation schema is missing.
      return { data: [], error: null };
    }

    let fallbackCurrent = sb
      .from('newsletters')
      .select('id,edition_number,title_ar,title_en,cover_image_url,status,categories(name_ar,name_en),created_at')
      .eq('status', 'published');

    // If has_translation does not exist, do not filter by it.
    res = await fallbackCurrent.order('created_at', { ascending: false });
  }

  // Fallback query: legacy schema compatibility
  if (res.error) {
    res = await sb
      .from('newsletters')
      .select('id,issue_number,cover_image_url,is_published,categories(name_ar,name_en),newsletter_locales(*)')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (!res.error) {
      let rows = res.data || [];
      if (locale === 'en') {
        rows = rows.filter((nl) => (nl.newsletter_locales || []).some((r) => r.locale === 'en'));
      }

      const mapped = rows.map((nl) => {
        const localeRow = (nl.newsletter_locales || []).find((r) => r.locale === locale) || (nl.newsletter_locales || [])[0] || {};
        return {
          id: nl.id,
          number: nl.issue_number ?? '-',
          title: localeRow.article_main_title || (locale === 'en' ? 'Untitled' : 'بدون عنوان'),
          category: (nl.categories && (nl.categories.name_ar || nl.categories.name_en)) || (locale === 'en' ? 'Uncategorized' : 'غير مصنف'),
          cover: resolveCoverUrl(nl.cover_image_url)
        };
      });
      return { data: mapped, error: null };
    }
  }

  if (res.error) return { data: null, error: res.error };
  return { data: (res.data || []).map((nl) => normalizeNewsletter(nl, locale)), error: null };
}

export async function renderNewslettersGrid(targetSelector, locale = 'ar') {
  const container = document.querySelector(targetSelector);
  if (!container) return;
  container.innerHTML = '<p class="center muted padded">جاري تحميل النشرات...</p>';

  if (!sb) {
    container.innerHTML = '<p class="center error">تعذر تهيئة عميل قاعدة البيانات.</p>';
    return;
  }

  const { data, error } = await fetchNewsletters(locale);

  if (error) {
    console.error('خطأ في جلب النشرات:', error);
    container.innerHTML = '<p class="center error">فشل تحميل النشرات.</p>';
    return;
  }

  container.innerHTML = '';
  (data || []).forEach(nl => {
    const card = document.createElement('a');
    card.className = 'episode-card';
    card.href = `single-episode.html?id=${nl.id}&lang=${locale}`;
    card.innerHTML = `
      <div class="card-image-container">
        <img src="${nl.cover}" alt="غلاف العدد ${nl.number}" loading="lazy">
      </div>
      <div class="card-details">
        <h4 class="card-title">${escapeHtml(nl.title)}</h4>
        <div class="card-footer">
          <span class="episode-number">العدد ${nl.number}</span>
          <span class="publisher-name">${escapeHtml(nl.category)}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Auto-run for pages that include this module and set window.NEWSLETTERS_LOCALE
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('episodes-grid') || document.getElementById('latest-episodes-grid');
  if (!container) return;
  const pageLocale = window.NEWSLETTERS_LOCALE || 'ar';
  renderNewslettersGrid('#' + container.id, pageLocale);
});
