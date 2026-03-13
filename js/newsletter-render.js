// js/newsletter-render.js
// Public newsletter page renderer.
// Requires: window.supabase, newsletter-data.js

async function initNewsletterPage(idParam = 'id') {
  const params        = new URLSearchParams(location.search);
  const newsletterId  = params.get(idParam);
  const container     = document.getElementById('newsletter-sections');

  if (!newsletterId) {
    if (container) container.innerHTML = '<p class="nl-error">لم يتم تحديد النشرة.</p>';
    return;
  }

  try {
    const result = await window.newsletterData.fetchPublishedNewsletter(newsletterId);
    if (!result) {
      if (container) container.innerHTML = '<p class="nl-error">النشرة غير موجودة أو غير منشورة.</p>';
      return;
    }

    const { newsletter, sections } = result;

    document.title = newsletter.title_ar || document.title;

    const h1 = document.querySelector('.newsletter-title');
    if (h1) h1.textContent = newsletter.title_ar;

    const cover = document.querySelector('.newsletter-cover');
    if (cover && newsletter.cover_image_url) {
      cover.src = newsletter.cover_image_url;
      cover.classList.remove('hidden');
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
  const el = document.createElement('section');
  el.id        = `sec-${sec.id}`;
  el.className = `newsletter-section section-${sec.section_type.slug}`;
  el.dir       = 'rtl';

  el.innerHTML = `
    <div class="section-header">
      <span class="section-icon">${sec.section_type.icon}</span>
      <h2 class="section-title">${htmlEsc(sec.section_type.name_ar)}</h2>
    </div>`;

  const body = document.createElement('div');
  body.className = 'section-body';

  const slug = sec.section_type.slug;
  const c    = sec.content || {};

  switch (slug) {
    case 'illumination':
    case 'inspiring':
      if (c.header_image_url)
        body.innerHTML += `<img src="${c.header_image_url}" alt="${htmlEsc(c.header_image_alt_ar)}" class="section-hero-img" loading="lazy">`;
      if (c.body_ar)
        body.innerHTML += `<div class="section-text">${c.body_ar}</div>`;
      break;

    case 'news':
      (c.items || []).forEach(item => {
        body.innerHTML += `
          <div class="news-item">
            ${item.image_url ? `<img src="${item.image_url}" class="news-thumb" loading="lazy" alt="">` : ''}
            <div class="news-item-body">
              <h3 class="news-title">${item.source_url
                ? `<a href="${htmlEsc(item.source_url)}" target="_blank" rel="noopener">${htmlEsc(item.title_ar)}</a>`
                : htmlEsc(item.title_ar)}</h3>
              ${item.source_name_ar ? `<span class="news-source">${htmlEsc(item.source_name_ar)}</span>` : ''}
              ${item.summary_ar    ? `<p class="news-summary">${htmlEsc(item.summary_ar)}</p>`          : ''}
            </div>
          </div>`;
      });
      break;

    case 'articles':
      (c.items || []).forEach(item => {
        body.innerHTML += `
          <div class="article-item">
            ${item.image_url ? `<img src="${item.image_url}" class="article-thumb" loading="lazy" alt="">` : ''}
            <div class="article-item-body">
              <h3 class="article-title">${item.article_url
                ? `<a href="${htmlEsc(item.article_url)}" target="_blank" rel="noopener">${htmlEsc(item.title_ar)}</a>`
                : htmlEsc(item.title_ar)}</h3>
              ${item.author_name_ar ? `<span class="article-author">${htmlEsc(item.author_name_ar)}</span>` : ''}
              ${item.excerpt_ar     ? `<p class="article-excerpt">${htmlEsc(item.excerpt_ar)}</p>`          : ''}
            </div>
          </div>`;
      });
      break;

    case 'podcast':
      if (c.audio_url) {
        body.innerHTML += `
          <div class="podcast-player">
            ${c.cover_image_url ? `<img src="${c.cover_image_url}" class="podcast-cover" loading="lazy" alt="">` : ''}
            <div class="podcast-info">
              <h3 class="podcast-title">${htmlEsc(c.title_ar)}</h3>
              ${c.description_ar   ? `<p class="podcast-desc">${htmlEsc(c.description_ar)}</p>`                          : ''}
              ${c.duration_seconds ? `<span class="podcast-dur">${Math.floor(c.duration_seconds/60)} دقيقة</span>`       : ''}
            </div>
            <audio controls src="${htmlEsc(c.audio_url)}" class="podcast-audio"></audio>
            ${c.external_link ? `<a href="${htmlEsc(c.external_link)}" class="podcast-ext-link" target="_blank" rel="noopener">استمع على المنصة</a>` : ''}
          </div>`;
      }
      break;

    case 'translation':
      if (c.header_image_url)
        body.innerHTML += `<img src="${c.header_image_url}" alt="${htmlEsc(c.header_image_alt_ar)}" class="section-hero-img" loading="lazy">`;
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
  return el;
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
