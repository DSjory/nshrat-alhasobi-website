// admin/newsletter-editor.js
// Requires: window.supabase, newsletter-data.js, admin-auth.js

const S = {
  id:            null,
  sectionIds:    {},
  typeIds:       {},
  activeOpening: 'illumination',
};

document.addEventListener('DOMContentLoaded', async () => {
  try { await (await import('/admin/js/admin-auth.js')).requireAdminAuth(); } catch(e) { return; }

  const types = await window.newsletterData.fetchSectionTypes();
  types.forEach(t => { S.typeIds[t.slug] = t.id; });

  const editId = new URLSearchParams(location.search).get('id');
  if (editId) {
    S.id = editId;
    document.getElementById('page-title').textContent = 'تعديل النشرة';
    await loadForEditing(editId);
  }

  enableSaveButtons();
  bindAllEvents();
});

async function loadForEditing(id) {
  showToast('جاري التحميل…', 'info');
  try {
    const { newsletter, sections } = await window.newsletterData.fetchNewsletterForEditing(id);
    fillMetadata(newsletter);
    sections.forEach(sec => fillSection(sec));
    hideToast();
  } catch (err) {
    showToast('فشل التحميل: ' + err.message, 'error');
  }
}

function fillMetadata(nl) {
  val('f-title-ar', nl.title_ar);
  val('f-title-en', nl.title_en);
  val('f-edition',  nl.edition_number);
  val('f-date',     nl.issue_date);
  val('f-cover-url',nl.cover_image_url);
  if (nl.cover_image_url) setPreview('cover-preview', 'cover-ph', nl.cover_image_url);
  document.querySelectorAll('input[name="nav"]').forEach(r => {
    r.checked = r.value === (nl.nav_type || 'filter');
  });
}

function fillSection(sec) {
  const slug = sec.section_type.slug;
  S.sectionIds[slug] = sec.id;
  const c = sec.content || {};

  switch (slug) {
    case 'illumination':
      if (!sec.is_visible) return;
      setSecImage('illumination', c.header_image_url);
      val('illum-body', c.body_ar);
      break;

    case 'inspiring':
      if (!sec.is_visible) return;
      activateOpening('inspiring');
      setSecImage('inspiring', c.header_image_url);
      val('insp-body', c.body_ar);
      break;

    case 'news':
      checked('tog-news', sec.is_visible);
      toggleBody('body-news', sec.is_visible);
      renderNewsItems(c.items || []);
      break;

    case 'articles':
      checked('tog-articles', sec.is_visible);
      toggleBody('body-articles', sec.is_visible);
      renderArticleItems(c.items || []);
      break;

    case 'podcast':
      checked('tog-podcast', sec.is_visible);
      toggleBody('body-podcast', sec.is_visible);
      val('pod-title',     c.title_ar);
      val('pod-desc',      c.description_ar);
      val('pod-audio-url', c.audio_url);
      val('pod-ext',       c.external_link);
      if (c.audio_url) document.getElementById('pod-audio-name').textContent = 'ملف صوتي محمّل ✓';
      break;

    case 'translation':
      checked('tog-translation', sec.is_visible);
      toggleBody('body-translation', sec.is_visible);
      val('tr-orig-title',  c.original_title);
      val('tr-orig-author', c.original_author);
      val('tr-orig-url',    c.original_url);
      val('tr-body',        c.translated_body_ar);
      val('tr-note',        c.translator_note_ar);
      setSecImage('translation', c.header_image_url);
      break;
  }
}

function collectFormData() {
  const titleAr = g('f-title-ar').value.trim();
  if (!titleAr) { showToast('العنوان العربي مطلوب', 'error'); return null; }

  return {
    id:              S.id,
    title_ar:        titleAr,
    title_en:        g('f-title-en').value.trim() || null,
    edition_number:  parseInt(g('f-edition').value) || null,
    issue_date:      g('f-date').value || null,
    cover_image_url: g('f-cover-url').value || null,
    nav_type:        document.querySelector('input[name="nav"]:checked')?.value || 'filter',
    sections: [
      {
        id: S.sectionIds.illumination || null,
        section_type_id: S.typeIds.illumination,
        slug: 'illumination',
        is_visible: S.activeOpening === 'illumination',
        sort_order: 1,
        content: {
          header_image_url: getSecImgUrl('illumination'),
          body_ar: g('illum-body').value,
        },
      },
      {
        id: S.sectionIds.inspiring || null,
        section_type_id: S.typeIds.inspiring,
        slug: 'inspiring',
        is_visible: S.activeOpening === 'inspiring',
        sort_order: 2,
        content: {
          header_image_url: getSecImgUrl('inspiring'),
          body_ar: g('insp-body').value,
        },
      },
      {
        id: S.sectionIds.news || null,
        section_type_id: S.typeIds.news,
        slug: 'news',
        is_visible: g('tog-news').checked,
        sort_order: 3,
        content: { items: collectNewsItems() },
      },
      {
        id: S.sectionIds.articles || null,
        section_type_id: S.typeIds.articles,
        slug: 'articles',
        is_visible: g('tog-articles').checked,
        sort_order: 4,
        content: { items: collectArticleItems() },
      },
      {
        id: S.sectionIds.podcast || null,
        section_type_id: S.typeIds.podcast,
        slug: 'podcast',
        is_visible: g('tog-podcast').checked,
        sort_order: 5,
        content: {
          title_ar:       g('pod-title').value,
          description_ar: g('pod-desc').value,
          audio_url:      g('pod-audio-url').value,
          external_link:  g('pod-ext').value || null,
        },
      },
      {
        id: S.sectionIds.translation || null,
        section_type_id: S.typeIds.translation,
        slug: 'translation',
        is_visible: g('tog-translation').checked,
        sort_order: 6,
        content: {
          header_image_url:   getSecImgUrl('translation'),
          original_title:     g('tr-orig-title').value  || null,
          original_author:    g('tr-orig-author').value || null,
          original_url:       g('tr-orig-url').value    || null,
          translated_body_ar: g('tr-body').value,
          translator_note_ar: g('tr-note').value || null,
        },
      },
    ],
  };
}

async function handleSave(publishAfterSave) {
  const formData = collectFormData();
  if (!formData) return;

  disableSaveButtons(true);
  showToast('جاري الحفظ…', 'info');

  try {
    const id = await window.newsletterData.saveNewsletter(formData);
    S.id = id;

    const { sections } = await window.newsletterData.fetchNewsletterForEditing(id);
    sections.forEach(sec => { S.sectionIds[sec.section_type.slug] = sec.id; });

    if (publishAfterSave) await window.newsletterData.setNewsletterStatus(id, 'published');

    history.replaceState({}, '', `?id=${id}`);
    document.getElementById('page-title').textContent = 'تعديل النشرة';
    showToast(publishAfterSave ? 'تم النشر ✓' : 'تم الحفظ ✓', 'success');
  } catch (err) {
    console.error(err);
    showToast('خطأ: ' + err.message, 'error');
  } finally {
    disableSaveButtons(false);
  }
}

function renderNewsItems(items) {
  const list = document.getElementById('news-list');
  list.innerHTML = '';
  items.forEach((item, i) => list.appendChild(buildNewsItemEl(item, i)));
}

function buildNewsItemEl(item = {}, idx = 0) {
  const d = document.createElement('div');
  d.className = 'repeat-item';
  d.innerHTML = `
    <div class="repeat-head">
      <span class="repeat-label">خبر ${idx + 1}</span>
      <button type="button" class="btn-rm" title="حذف">✕</button>
    </div>
    <div class="field-row">
      <label class="field-label">العنوان <span class="req">*</span></label>
      <input type="text" class="field-input ni-title" value="${e(item.title_ar)}" dir="rtl">
    </div>
    <div class="field-split">
      <div class="field-col">
        <label class="field-label">المصدر</label>
        <input type="text" class="field-input ni-source" value="${e(item.source_name_ar)}" dir="rtl">
      </div>
      <div class="field-col">
        <label class="field-label">الرابط</label>
        <input type="url" class="field-input ni-url" value="${e(item.source_url)}" dir="ltr" placeholder="https://…">
      </div>
    </div>
    <div class="field-row">
      <label class="field-label">الملخص</label>
      <textarea class="field-textarea ni-summary" rows="2" dir="rtl">${e(item.summary_ar)}</textarea>
    </div>`;
  d.querySelector('.btn-rm').addEventListener('click', () => d.remove());
  return d;
}

function collectNewsItems() {
  return [...document.querySelectorAll('#news-list .repeat-item')].map(el => ({
    title_ar:       el.querySelector('.ni-title').value.trim(),
    source_name_ar: el.querySelector('.ni-source').value.trim() || null,
    source_url:     el.querySelector('.ni-url').value.trim()    || null,
    summary_ar:     el.querySelector('.ni-summary').value.trim()|| null,
  }));
}

function renderArticleItems(items) {
  const list = document.getElementById('articles-list');
  list.innerHTML = '';
  items.forEach((item, i) => list.appendChild(buildArticleItemEl(item, i)));
}

function buildArticleItemEl(item = {}, idx = 0) {
  const d = document.createElement('div');
  d.className = 'repeat-item';
  d.innerHTML = `
    <div class="repeat-head">
      <span class="repeat-label">مقال ${idx + 1}</span>
      <button type="button" class="btn-rm" title="حذف">✕</button>
    </div>
    <div class="field-row">
      <label class="field-label">العنوان <span class="req">*</span></label>
      <input type="text" class="field-input ai-title" value="${e(item.title_ar)}" dir="rtl">
    </div>
    <div class="field-split">
      <div class="field-col">
        <label class="field-label">الكاتب</label>
        <input type="text" class="field-input ai-author" value="${e(item.author_name_ar)}" dir="rtl">
      </div>
      <div class="field-col">
        <label class="field-label">رابط المقال</label>
        <input type="url" class="field-input ai-url" value="${e(item.article_url)}" dir="ltr" placeholder="https://…">
      </div>
    </div>
    <div class="field-row">
      <label class="field-label">مقتطف</label>
      <textarea class="field-textarea ai-excerpt" rows="2" dir="rtl">${e(item.excerpt_ar)}</textarea>
    </div>`;
  d.querySelector('.btn-rm').addEventListener('click', () => d.remove());
  return d;
}

function collectArticleItems() {
  return [...document.querySelectorAll('#articles-list .repeat-item')].map(el => ({
    title_ar:      el.querySelector('.ai-title').value.trim(),
    author_name_ar:el.querySelector('.ai-author').value.trim() || null,
    article_url:   el.querySelector('.ai-url').value.trim()    || null,
    excerpt_ar:    el.querySelector('.ai-excerpt').value.trim()|| null,
  }));
}

function bindUpload(fileInput, previewEl, phEl, hiddenInput, prefix) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    phEl.textContent = 'جاري الرفع…';
    try {
      const url = await window.newsletterData.uploadFile(file, prefix);
      hiddenInput.value = url;
      previewEl.src = url;
      previewEl.classList.remove('hidden');
      phEl.classList.add('hidden');
    } catch (err) {
      phEl.textContent = 'فشل الرفع — حاول مرة أخرى';
      console.error(err);
    }
  });
}

function getSecImgUrl(sec) {
  return document.querySelector(`.sec-img-url[data-sec="${sec}"]`)?.value || null;
}

function setSecImage(sec, url) {
  if (!url) return;
  const img = document.querySelector(`.sec-img-preview[data-sec="${sec}"]`);
  const ph  = document.querySelector(`.sec-img-file[data-sec="${sec}"]`)
                        ?.closest('.upload-zone')
                        ?.querySelector('.upload-ph');
  const hid = document.querySelector(`.sec-img-url[data-sec="${sec}"]`);
  if (img) { img.src = url; img.classList.remove('hidden'); }
  if (ph)  { ph.classList.add('hidden'); }
  if (hid) { hid.value = url; }
}

function activateOpening(slug) {
  S.activeOpening = slug;
  document.querySelectorAll('.type-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.slug === slug));
  document.getElementById('panel-illumination').classList.toggle('hidden', slug !== 'illumination');
  document.getElementById('panel-inspiring').classList.toggle('hidden',    slug !== 'inspiring');
}

function bindAllEvents() {
  g('btn-draft').addEventListener('click',       () => handleSave(false));
  g('btn-publish').addEventListener('click',     () => handleSave(true));
  g('btn-draft-bot').addEventListener('click',   () => handleSave(false));
  g('btn-publish-bot').addEventListener('click', () => handleSave(true));

  document.querySelectorAll('.type-btn').forEach(btn =>
    btn.addEventListener('click', () => activateOpening(btn.dataset.slug)));

  [
    ['tog-news',        'body-news'],
    ['tog-articles',    'body-articles'],
    ['tog-podcast',     'body-podcast'],
    ['tog-translation', 'body-translation'],
  ].forEach(([togId, bodyId]) =>
    g(togId).addEventListener('change', e => toggleBody(bodyId, e.target.checked)));

  g('add-news').addEventListener('click', () => {
    const list = document.getElementById('news-list');
    list.appendChild(buildNewsItemEl({}, list.querySelectorAll('.repeat-item').length));
  });
  g('add-article').addEventListener('click', () => {
    const list = document.getElementById('articles-list');
    list.appendChild(buildArticleItemEl({}, list.querySelectorAll('.repeat-item').length));
  });

  bindUpload(
    g('f-cover-file'),
    g('cover-preview'),
    g('cover-ph'),
    g('f-cover-url'),
    'covers'
  );

  document.querySelectorAll('.sec-img-file').forEach(fileInput => {
    const sec     = fileInput.dataset.sec;
    const zone    = fileInput.closest('.upload-zone');
    const preview = zone.querySelector('.upload-preview');
    const ph      = zone.querySelector('.upload-ph');
    const hidden  = document.querySelector(`.sec-img-url[data-sec="${sec}"]`);
    bindUpload(fileInput, preview, ph, hidden, sec);
  });

  g('pod-audio-file').addEventListener('change', async () => {
    const file = g('pod-audio-file').files[0];
    if (!file) return;
    g('pod-audio-name').textContent = 'جاري الرفع…';
    try {
      const url = await window.newsletterData.uploadFile(file, 'podcast');
      g('pod-audio-url').value = url;
      g('pod-audio-name').textContent = file.name + ' ✓';
    } catch (err) {
      g('pod-audio-name').textContent = 'فشل الرفع — حاول مرة أخرى';
    }
  });
}

const g   = id => document.getElementById(id);
const val = (id, v) => { const el = g(id); if (el) el.value = v ?? ''; };
const checked = (id, v) => { const el = g(id); if (el) el.checked = !!v; };

function e(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggleBody(bodyId, show) {
  g(bodyId)?.classList.toggle('hidden', !show);
}

function setPreview(imgId, phId, url) {
  const img = g(imgId); const ph = g(phId);
  if (img) { img.src = url; img.classList.remove('hidden'); }
  if (ph)  { ph.classList.add('hidden'); }
}

function enableSaveButtons() {
  ['btn-draft','btn-publish','btn-draft-bot','btn-publish-bot'].forEach(id => {
    const el = g(id); if (el) el.disabled = false;
  });
}

function disableSaveButtons(disabled) {
  ['btn-draft','btn-publish','btn-draft-bot','btn-publish-bot'].forEach(id => {
    const el = g(id); if (el) el.disabled = disabled;
  });
}

function showToast(msg, type = 'info') {
  const t = g('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  if (type !== 'info') setTimeout(hideToast, 3500);
}
function hideToast() {
  g('toast')?.classList.add('hidden');
}
