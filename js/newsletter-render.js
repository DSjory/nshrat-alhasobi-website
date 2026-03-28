// js/newsletter-render.js
// Public newsletter page renderer.
// Requires: window.supabase, newsletter-data.js

async function initNewsletterPage(idParam = 'id') {
  const params        = new URLSearchParams(location.search);
  const newsletterId  = params.get(idParam);
  const lang          = params.get('lang') || 'ar';
  window._nlLang      = lang; // globally available for rendering
  const container     = document.getElementById('newsletter-sections');

  const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newsletterId);
  if (!newsletterId || !isValidUUID) {
    if (container) container.innerHTML = '<p class="nl-error">رابط النشرة غير صحيح (404).</p>';
    return;
  }

  try {
    const result = await window.newsletterData.fetchPublishedNewsletter(newsletterId);
    if (!result) {
      if (container) container.innerHTML = '<p class="nl-error">النشرة غير موجودة أو غير منشورة.</p>';
      return;
    }

    const { newsletter } = result;
    const sections = (result.sections || []).filter((sec) => sec?.section_type?.slug !== 'translation');

    const displayTitle = lang === 'en' && newsletter.title_en ? newsletter.title_en : newsletter.title_ar;
    document.title = displayTitle || document.title;

    const h1 = document.querySelector('.newsletter-title');
    if (h1) h1.textContent = displayTitle;

    // Hide cover image in single-episode view (comment out or remove existing cover display)
    const cover = document.querySelector('.newsletter-cover');
    if (cover) {
      cover.classList.add('hidden');
    }

    const welcomeText = (lang === 'en' && newsletter.has_translation)
      ? (newsletter.welcome_message_en || newsletter.welcome_message)
      : newsletter.welcome_message;

    // Render welcome message if available
    if (container && welcomeText) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.className = 'newsletter-welcome';
      welcomeDiv.style.marginBottom = '20px';
      welcomeDiv.innerHTML = `<p style="font-style: italic; color: var(--muted-color);">${htmlEsc(welcomeText)}</p>`;
      container.appendChild(welcomeDiv);
    }

    const readingText = (lang === 'en' && newsletter.has_translation)
      ? (newsletter.reading_time_en || newsletter.reading_time)
      : newsletter.reading_time;

    // Render reading time if available
    if (container && readingText) {
      const readingDiv = document.createElement('div');
      readingDiv.className = 'newsletter-reading-time';
      readingDiv.style.marginBottom = '20px';
      readingDiv.innerHTML = `<p style="color: var(--muted-color); font-size: 0.9rem;">⏱️ ${htmlEsc(readingText)}</p>`;
      container.appendChild(readingDiv);
    }

    buildNav(newsletter.nav_type || 'filter', sections);
    if (container) sections.forEach(sec => container.appendChild(renderSection(sec)));

  } catch (err) {
    console.error(err);
    if (container) container.innerHTML = '<p class="nl-error">حدث خطأ أثناء تحميل النشرة.</p>';
  }
}

function buildNav(navType, sections) {
  if (navType === 'tabs') buildTabsNav(sections);
  else                     buildFilterNav(sections);
}

function buildTabsNav(sections) {
  const nav = document.querySelector('.newsletter-nav');
  if (!nav) return;
  nav.innerHTML = '';

  const allBtn = makeEl('button', 'tab active', 'كل النشرة');
  allBtn.dataset.target = 'all';
  nav.appendChild(allBtn);
  sections.forEach(s => {
    const btn = makeEl('button', 'tab', `${s.section_type.icon} ${s.section_type.name_ar}`);
    btn.dataset.target = s.id;
    nav.appendChild(btn);
  });

  nav.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    nav.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    document.querySelectorAll('.newsletter-section').forEach(sec => {
      sec.hidden = target !== 'all' && sec.id !== `sec-${target}`;
    });
  });
}

function buildFilterNav(sections) {
  const bar = document.querySelector('.filter-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const allPill = makeEl('button', 'filter-pill active', 'الكل');
  allPill.dataset.target = 'all';
  bar.appendChild(allPill);
  sections.forEach(s => {
    const pill = makeEl('button', 'filter-pill', `${s.section_type.icon} ${s.section_type.name_ar}`);
    pill.dataset.target = s.id;
    bar.appendChild(pill);
  });

  bar.addEventListener('click', e => {
    const pill = e.target.closest('.filter-pill');
    if (!pill) return;
    bar.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const target = pill.dataset.target;
    document.querySelectorAll('.newsletter-section').forEach(sec => {
      sec.style.display = target === 'all' || sec.id === `sec-${target}` ? '' : 'none';
    });
    if (target !== 'all') {
      document.getElementById(`sec-${target}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function renderSection(sec) {
  const lang = window._nlLang || 'ar';
  const el = document.createElement('section');
  el.id        = `sec-${sec.id}`;
  el.className = `newsletter-section section-${sec.section_type.slug}`;
  el.dir       = 'rtl';

  const sectionTitle = lang === 'en'
    ? (sec.section_type.name_en || sec.section_type.name_ar)
    : (sec.section_type.name_ar || sec.section_type.name_en);

  el.innerHTML = `
    <div class="section-header">
      <span class="section-icon">${sec.section_type.icon}</span>
      <h2 class="section-title">${htmlEsc(sectionTitle)}</h2>
      <button class="section-toggle-btn" type="button" aria-expanded="true">إخفاء</button>
    </div>`;

  const body = document.createElement('div');
  body.className = 'section-body';

  const slug = sec.section_type.slug;
  const c    = sec.content || {};

  // Render section header image (applies to all section types)
  if (sec.header_image_url) {
    body.innerHTML += `<img src="${resolveMediaUrl(sec.header_image_url)}" alt="${htmlEsc(sec.section_type.name_ar || 'صورة هيدر القسم')}" class="section-header-banner" loading="lazy">`;
  }

  switch (slug) {
    case 'illumination':
    case 'inspiring':
      if (c.header_image_url)
        body.innerHTML += `<img src="${resolveMediaUrl(c.header_image_url)}" alt="${htmlEsc(c.header_image_alt_ar)}" class="section-hero-img" loading="lazy">`;
      {
        const bodyText = lang === 'en' ? (c.body_en || c.body_ar) : (c.body_ar || c.body_en);
        if (bodyText) body.innerHTML += `<div class="section-text">${bodyText}</div>`;
      }
      break;

    case 'news':
      (c.items || []).forEach(item => {
        const titleText = lang === 'en' ? (item.title_en || item.title_ar) : (item.title_ar || item.title_en);
        const sourceName = lang === 'en' ? (item.source_name_en || item.source_name_ar) : (item.source_name_ar || item.source_name_en);
        const summaryText = lang === 'en' ? (item.summary_en || item.summary_ar) : (item.summary_ar || item.summary_en);
        body.innerHTML += `
          <div class="news-item">
            ${item.image_url ? `<img src="${resolveMediaUrl(item.image_url)}" class="news-thumb" loading="lazy" alt="">` : ''}
            <div class="news-item-body">
              <h3 class="news-title">${item.source_url
                ? `<a href="${htmlEsc(item.source_url)}" target="_blank" rel="noopener">${htmlEsc(titleText)}</a>`
                : htmlEsc(titleText)}</h3>
              ${sourceName ? `<span class="news-source">${htmlEsc(sourceName)}</span>` : ''}
              ${summaryText ? `<p class="news-summary">${htmlEsc(summaryText)}</p>` : ''}
            </div>
          </div>`;
      });
      break;

    case 'articles':
      (c.items || []).forEach(item => {
        const titleText = lang === 'en' ? (item.title_en || item.title_ar) : (item.title_ar || item.title_en);
        const authorText = lang === 'en' ? (item.author_name_en || item.author_name_ar) : (item.author_name_ar || item.author_name_en);
        const excerptText = lang === 'en' ? (item.excerpt_en || item.excerpt_ar) : (item.excerpt_ar || item.excerpt_en);
        body.innerHTML += `
          <div class="article-item">
            ${item.image_url ? `<img src="${resolveMediaUrl(item.image_url)}" class="article-thumb" loading="lazy" alt="">` : ''}
            <div class="article-item-body">
              <h3 class="article-title">${item.article_url
                ? `<a href="${htmlEsc(item.article_url)}" target="_blank" rel="noopener">${htmlEsc(titleText)}</a>`
                : htmlEsc(titleText)}</h3>
              ${authorText ? `<span class="article-author">${htmlEsc(authorText)}</span>` : ''}
              ${excerptText ? `<p class="article-excerpt">${htmlEsc(excerptText)}</p>` : ''}
            </div>
          </div>`;
      });
      break;

    case 'podcast':
      if (c.audio_url) {
        const podcastTitle = lang === 'en' ? (c.title_en || c.title_ar) : (c.title_ar || c.title_en);
        const podcastDesc = lang === 'en' ? (c.description_en || c.description_ar) : (c.description_ar || c.description_en);
        const durationLabel = lang === 'en' ? 'min' : 'دقيقة';
        body.innerHTML += `
          <div class="podcast-player">
            ${c.cover_image_url ? `<img src="${resolveMediaUrl(c.cover_image_url)}" class="podcast-cover" loading="lazy" alt="">` : ''}
            <div class="podcast-info">
              <h3 class="podcast-title">${htmlEsc(podcastTitle)}</h3>
              ${podcastDesc ? `<p class="podcast-desc">${htmlEsc(podcastDesc)}</p>` : ''}
              ${c.duration_seconds ? `<span class="podcast-dur">${Math.floor(c.duration_seconds/60)} ${durationLabel}</span>` : ''}
            </div>
            <audio controls src="${htmlEsc(resolveMediaUrl(c.audio_url) || c.audio_url)}" class="podcast-audio"></audio>
            ${c.external_link ? `<a href="${htmlEsc(c.external_link)}" class="podcast-ext-link" target="_blank" rel="noopener">${lang === 'en' ? 'Listen on platform' : 'استمع على المنصة'}</a>` : ''}
          </div>`;
      }
      break;

    case 'translation':
      if (c.header_image_url)
        body.innerHTML += `<img src="${resolveMediaUrl(c.header_image_url)}" alt="${htmlEsc(c.header_image_alt_ar)}" class="section-hero-img" loading="lazy">`;
      if (c.original_title) {
        body.innerHTML += `<p class="translation-source">${c.original_url
          ? `<a href="${htmlEsc(c.original_url)}" target="_blank" rel="noopener">${htmlEsc(c.original_title)}</a>`
          : htmlEsc(c.original_title)}${c.original_author ? ` — ${htmlEsc(c.original_author)}` : ''}</p>`;
      }
      if (c.translated_body_ar)
        body.innerHTML += `<div class="section-text">${c.translated_body_ar}</div>`;
      if (c.translator_note_ar)
        body.innerHTML += `<aside class="translator-note">${htmlEsc(c.translator_note_ar)}</aside>`;
      break;
  }

  el.appendChild(body);
  const toggleBtn = el.querySelector('.section-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = body.style.display === 'none';
      body.style.display = isHidden ? '' : 'none';
      toggleBtn.textContent = isHidden ? 'إخفاء' : 'إظهار';
      toggleBtn.setAttribute('aria-expanded', String(isHidden));
      el.classList.toggle('collapsed', !isHidden);
    });
  }
  return el;
}

function findFirstSectionImage(sections) {
  for (const sec of (sections || [])) {
    const c = sec.content || {};
    if (c.header_image_url) return c.header_image_url;
    if (c.cover_image_url) return c.cover_image_url;
    if (Array.isArray(c.items)) {
      const withImage = c.items.find((x) => x?.image_url);
      if (withImage?.image_url) return withImage.image_url;
    }
  }
  return null;
}

function resolveMediaUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const base = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
  let path = String(value).replace(/^\/+/, '');
  path = path.replace(/^newsletter-media\//, '');
  const encoded = path.split('/').map((s) => encodeURIComponent(s)).join('/');
  return `${base}/storage/v1/object/public/newsletter-media/${encoded}`;
}

function htmlEsc(str) {
  return (str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  el.className   = className;
  el.textContent = text;
  return el;
}

window.initNewsletterPage = initNewsletterPage;
