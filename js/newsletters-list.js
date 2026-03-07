import { supabasePublic } from './supabase-public.js';

const sb = supabasePublic;

export async function renderNewslettersGrid(targetSelector, locale = 'ar') {
  const container = document.querySelector(targetSelector);
  if (!container) return;
  container.innerHTML = '<p class="center muted padded">جاري تحميل النشرات...</p>';

  const { data, error } = await sb
     .from('newsletters')
     .select('id,issue_number,category_id,cover_image_url,categories(label),newsletter_locales(*)')
    .eq('is_published', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('خطأ في جلب النشرات:', error);
    container.innerHTML = '<p class="center error">فشل تحميل النشرات.</p>';
    return;
  }

  container.innerHTML = '';
  (data || []).forEach(nl => {
    const localeRow = (nl.newsletter_locales || []).find(r => r.locale === locale) || (nl.newsletter_locales || [])[0] || {};
    const card = document.createElement('a');
    card.className = 'episode-card';
    card.href = `single-episode.html?id=${nl.id}&lang=${locale}`;
    card.innerHTML = `
      <div class="card-image-container">
        <img src="${nl.cover_image_url || 'assets/img/placeholder.png'}" alt="غلاف العدد ${nl.issue_number}" loading="lazy">
      </div>
      <div class="card-details">
        <h4 class="card-title">${(localeRow.article_title) ? escapeHtml(localeRow.article_title) : 'بدون عنوان'}</h4>
        <div class="card-footer">
          <span class="episode-number">العدد ${nl.issue_number}</span>
          <span class="publisher-name">${escapeHtml((nl.categories && nl.categories.label) || nl.category || 'غير مصنف')}</span>
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
