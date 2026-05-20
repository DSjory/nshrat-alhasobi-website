// admin_cms/editor.js — Per-newsletter editor.
//
// Layout: three tabs (Overview · Contributors · Sections) inside a single
// editor shell.  Section editing happens in a side drawer so the user keeps
// the section list visible.  Bilingual fields render side-by-side.
//
// Data layer is unchanged — every Supabase call below mirrors the previous
// implementation; only the presentation has been reorganised.

import { initSupabase, uploadFileWithProgress } from './supabase-client.js';
import { showToast, showConfirm, openDrawer, bindMobileSidebar } from './ui.js';
import { createRichTextField } from './js/rich-text-field.js';

// Reuse the client created by auth-guard.js. Calling reinit here used to spawn
// a fresh client whose session wasn't yet restored from localStorage, causing
// the very first `.from(...)` query to fire as `anon` — which RLS rejects for
// draft rows, surfacing as an empty editor form.
let supabase = await initSupabase();

/* ─── Utilities ───────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('loading', !!isLoading);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── State ───────────────────────────────────────────────────────────────── */
const state = {
  newsletter: null,
  newsletterId: new URLSearchParams(window.location.search).get('id'),
  sections: [],
  sectionTypes: [],
  categories: [],
  contributors: null,
  dirty: false,
};

function markDirty() {
  if (state.dirty) return;
  state.dirty = true;
  const badge = $('save-status');
  if (badge) {
    badge.style.display = '';
    badge.className = 'badge badge-warning';
    badge.textContent = '● تغييرات غير محفوظة';
  }
}
function markClean() {
  state.dirty = false;
  const badge = $('save-status');
  if (badge) {
    badge.style.display = '';
    badge.className = 'badge badge-success';
    badge.textContent = '✓ تم الحفظ';
    setTimeout(() => { if (!state.dirty) badge.style.display = 'none'; }, 2000);
  }
}
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ─── Mobile sidebar ──────────────────────────────────────────────────────── */
bindMobileSidebar($('editor-sidebar'), $('hamburger'));

/* ─── Tab switching ───────────────────────────────────────────────────────── */
function activateTab(name) {
  document.querySelectorAll('.tab[data-tab], .nav-item[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.style.display = p.dataset.panel === name ? '' : 'none';
  });
}
document.querySelectorAll('.tab[data-tab], .nav-item[data-tab]').forEach(b => {
  b.addEventListener('click', () => activateTab(b.dataset.tab));
});

/* ─── Init ────────────────────────────────────────────────────────────────── */
// Every step is independent — a failure in one (e.g. RLS on section_types)
// must NOT prevent the rest of the editor from rendering. Each step logs to
// the console and surfaces a toast on failure so production issues are
// diagnosable without source-level debugging.
async function init() {
  try { await loadSectionTypes(); }
  catch (e) { console.error('[editor.init] loadSectionTypes failed:', e); }

  try { await loadCategories(); }
  catch (e) { console.error('[editor.init] loadCategories failed:', e); }

  try { buildOverviewTab(); }
  catch (e) {
    console.error('[editor.init] buildOverviewTab failed:', e);
    showToast('فشل في بناء نموذج التحرير: ' + (e.message || e), 'error');
  }

  try { buildContributorsTab(); }
  catch (e) { console.error('[editor.init] buildContributorsTab failed:', e); }

  if (state.newsletterId) {
    try { await loadNewsletter(state.newsletterId); }
    catch (e) {
      console.error('[editor.init] loadNewsletter failed:', e);
      showToast('فشل تحميل بيانات النشرة: ' + (e.message || e), 'error');
    }
  }
}

async function loadSectionTypes() {
  const { data, error } = await supabase.from('section_types').select('*').order('sort_order', { ascending: true });
  if (error) { console.error(error); showToast('فشل في جلب أنواع الأقسام', 'error'); return; }
  state.sectionTypes = data || [];
  const sel = $('add-section-type');
  sel.innerHTML = '';
  state.sectionTypes.forEach(st => sel.append(new Option(`${st.icon || ''} ${st.name_ar}`, st.id)));
}

async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
  if (error) { console.error(error); return; }
  state.categories = data || [];
  const sel = overview.category;
  if (sel) {
    const current = state.newsletter?.category_id || '';
    sel.innerHTML = '<option value="">— اختر —</option>';
    state.categories.forEach(c => {
      const o = new Option(c.name_ar || c.name_en, c.id);
      if (c.id === current) o.selected = true;
      sel.append(o);
    });
  }
}

/* ─── Overview tab ────────────────────────────────────────────────────────── */
const overview = {}; // refs to the field elements

function buildOverviewTab() {
  const root = $('overview-form');
  if (!root) { console.error('[editor] #overview-form not found in DOM'); return; }
  root.innerHTML = '';

  // Each field-builder is wrapped so a single failure (e.g. Quill barfing on
  // an unusual environment) cannot prevent the remaining fields from rendering.
  const safeAppend = (label, fn) => {
    try {
      const node = fn();
      if (node) root.appendChild(node);
    } catch (e) {
      console.error(`[editor.buildOverviewTab] field "${label}" failed:`, e);
      // Visible breadcrumb so admins know something went wrong with this field
      const warn = document.createElement('div');
      warn.className = 'field-error';
      warn.style.padding = '8px';
      warn.style.marginBottom = '12px';
      warn.style.background = 'var(--danger-soft)';
      warn.style.borderRadius = 'var(--r-sm)';
      warn.textContent = `تعذر بناء حقل "${label}" — تحقق من وحدة التحكم`;
      root.appendChild(warn);
    }
  };

  safeAppend('title', () => makeBilingualText('title', 'عنوان النشرة', {
    required: true, placeholderAr: 'مثال: نشرة شهر أبريل', placeholderEn: 'e.g. April Newsletter',
  }));

  safeAppend('edition + date', () => {
    const meta = document.createElement('div');
    meta.className = 'field-row';
    meta.appendChild(makeField({ name: 'edition_number', label: 'رقم الإصدار', type: 'number', min: 1 }));
    meta.appendChild(makeField({ name: 'issue_date',     label: 'تاريخ الإصدار', type: 'date' }));
    return meta;
  });

  safeAppend('toggles', () => {
    const toggles = document.createElement('div');
    toggles.className = 'field-row';
    toggles.appendChild(makeCheckbox('has_translation', 'يحتوي على ترجمة إنجليزية'));
    toggles.appendChild(makeCheckbox('is_published', 'منشور (متاح للعامة)'));
    return toggles;
  });

  safeAppend('reading_time', () => makeBilingualText('reading_time', 'وقت القراءة', {
    placeholderAr: '5 دقائق', placeholderEn: '5 mins',
  }));

  safeAppend('welcome (rich-text)', () => makeBilingualRich('welcome', 'رسالة الترحيب', {
    placeholderAr: 'اهلا بك في نشرة الحاسوبي',
    placeholderEn: 'Welcome to the Hasoobi newsletter…',
  }));

  safeAppend('category', () => makeField({
    name: 'category', label: 'التصنيف', type: 'select',
    options: [{ value: '', label: '— اختر —' }, ...state.categories.map(c => ({ value: c.id, label: c.name_ar || c.name_en }))],
  }));

  safeAppend('cover uploader', () => makeCoverUploader());

  root.querySelectorAll('input, textarea, select').forEach(el => el.addEventListener('input', markDirty));

  if (overview.has_translation) {
    overview.has_translation.addEventListener('change', toggleEnglishFields);
  }
  try { toggleEnglishFields(); } catch (e) { console.error(e); }
}

function toggleEnglishFields() {
  const showEn = overview.has_translation?.checked;
  document.querySelectorAll('[data-panel="overview"] .bilingual, [data-panel="contributors"] .bilingual')
    .forEach(b => b.classList.toggle('hide-en', !showEn));
}

function makeField({ name, label, type = 'text', placeholder, min, max, options, defaultValue }) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  if (label) {
    const lbl = document.createElement('label'); lbl.className = 'field-label'; lbl.textContent = label;
    wrap.appendChild(lbl);
  }
  let el;
  if (type === 'select') {
    el = document.createElement('select'); el.className = 'input';
    (options || []).forEach(o => { const op = new Option(o.label, o.value); if (String(defaultValue) === String(o.value)) op.selected = true; el.append(op); });
  } else if (type === 'textarea') {
    el = document.createElement('textarea'); el.className = 'input'; el.rows = 4;
    if (defaultValue) el.value = defaultValue;
  } else {
    el = document.createElement('input'); el.type = type; el.className = 'input';
    if (placeholder) el.placeholder = placeholder;
    if (min != null) el.min = min;
    if (max != null) el.max = max;
    if (defaultValue != null) el.value = defaultValue;
  }
  el.name = name;
  wrap.appendChild(el);
  overview[name] = el;
  return wrap;
}

function makeCheckbox(name, label) {
  const wrap = document.createElement('label');
  wrap.className = 'check-row field';
  wrap.style.marginTop = '24px';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.name = name;
  const span = document.createElement('span'); span.textContent = label;
  wrap.append(cb, span);
  overview[name] = cb;
  return wrap;
}

function makeBilingualText(name, label, { required, placeholderAr, placeholderEn } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'bilingual';

  const arSide = document.createElement('div'); arSide.className = 'bilingual-side'; arSide.dataset.lang = 'ar';
  const arLabel = document.createElement('label'); arLabel.className = 'field-label'; arLabel.textContent = `${label} (عربي)`;
  if (required) arLabel.classList.add('field-required');
  const arInput = document.createElement('input'); arInput.type = 'text'; arInput.className = 'input'; arInput.name = `${name}_ar`;
  if (placeholderAr) arInput.placeholder = placeholderAr;
  arSide.append(arLabel, arInput);

  const enSide = document.createElement('div'); enSide.className = 'bilingual-side'; enSide.dataset.lang = 'en';
  const enLabel = document.createElement('label'); enLabel.className = 'field-label'; enLabel.textContent = `${label} (EN)`;
  const enInput = document.createElement('input'); enInput.type = 'text'; enInput.className = 'input'; enInput.name = `${name}_en`;
  if (placeholderEn) enInput.placeholder = placeholderEn;
  enSide.append(enLabel, enInput);

  wrap.append(arSide, enSide);
  overview[`${name}_ar`] = arInput;
  overview[`${name}_en`] = enInput;
  return wrap;
}

function makeBilingualRich(name, label, { placeholderAr, placeholderEn } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'bilingual';

  const arSide = document.createElement('div'); arSide.className = 'bilingual-side'; arSide.dataset.lang = 'ar';
  const arLabel = document.createElement('label'); arLabel.className = 'field-label'; arLabel.textContent = `${label} (عربي)`;
  const arRt = createRichTextField({ dir: 'rtl', placeholder: placeholderAr || '' });
  arSide.append(arLabel, arRt.el);

  const enSide = document.createElement('div'); enSide.className = 'bilingual-side'; enSide.dataset.lang = 'en';
  const enLabel = document.createElement('label'); enLabel.className = 'field-label'; enLabel.textContent = `${label} (EN)`;
  const enRt = createRichTextField({ dir: 'ltr', placeholder: placeholderEn || '' });
  enSide.append(enLabel, enRt.el);

  wrap.append(arSide, enSide);
  overview[`${name}_rt_ar`] = arRt;
  overview[`${name}_rt_en`] = enRt;
  [arRt, enRt].forEach(rt => rt.editor.addEventListener('input', markDirty));
  return wrap;
}

function makeCoverUploader() {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = `<label class="field-label">صورة الغلاف</label>`;
  const drop = document.createElement('div');
  drop.className = 'uploader';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.id = 'cover-file';
  const preview = document.createElement('div'); preview.id = 'cover-preview';
  preview.innerHTML = `<div class="muted">اسحب صورة هنا أو انقر للاختيار</div>`;
  const status = document.createElement('div'); status.id = 'cover-status'; status.className = 'uploader-hint';
  drop.append(input, preview, status);
  wrap.appendChild(drop);
  overview._coverFile = input;
  overview._coverPreview = preview;
  overview._coverStatus = status;

  input.addEventListener('change', () => uploadCover(input.files?.[0]));
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('drag-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadCover(f); });
  return wrap;
}

async function uploadCover(file) {
  if (!file) return;
  const preview = overview._coverPreview;
  const status  = overview._coverStatus;
  let pbar = preview.querySelector('progress');
  if (!pbar) { pbar = document.createElement('progress'); pbar.max = 1; pbar.value = 0; pbar.style.width = '100%'; preview.appendChild(pbar); }
  status.textContent = 'جاري الرفع…';
  const note = showToast('جاري رفع صورة الغلاف…', 'pending', 0);
  try {
    const url = await uploadFileWithProgress(file, `newsletters/${state.newsletter?.id || 'temp'}`, (r) => {
      if (r >= 0 && r <= 1) { pbar.value = r; status.textContent = `جاري الرفع ${Math.round(r * 100)}%`; }
    });
    pbar.value = 1;
    preview.innerHTML = `<img src="${url}" alt="" style="max-width:260px;border-radius:var(--r-sm)">`;
    status.textContent = 'تم الرفع';
    if (state.newsletter?.id) {
      const { error } = await supabase.from('newsletters').update({ cover_image_url: url }).eq('id', state.newsletter.id);
      if (error) throw error;
      state.newsletter.cover_image_url = url;
    } else {
      state.newsletter = state.newsletter || {};
      state.newsletter.cover_image_url = url;
    }
    note.dismiss();
    showToast('تم تحديث صورة الغلاف');
  } catch (e) {
    note.dismiss();
    status.textContent = '';
    showToast(e.message || e, 'error');
  }
}

/* ─── Contributors tab ────────────────────────────────────────────────────── */
const contribRoles = [
  { key: 'article_writer',     label: 'كاتب المقالة',  labelEn: 'Article Writer' },
  { key: 'news_hunters',       label: 'صائدي الأخبار', labelEn: 'News Hunters' },
  { key: 'content_writers',    label: 'كتاب المحتوى',  labelEn: 'Content Writers' },
  { key: 'designers',          label: 'المصممين',      labelEn: 'Designers' },
  { key: 'member_affairs',     label: 'شؤون الأعضاء',  labelEn: 'Member Affairs' },
  { key: 'newsletter_leader',  label: 'قائدة النشرة', labelEn: 'Newsletter Leader' },
  { key: 'newsletter_deputy',  label: 'نائبة النشرة', labelEn: 'Newsletter Deputy' },
];
const contributorsInputs = {};

function buildContributorsTab() {
  const root = $('contributors-form');
  root.innerHTML = '';
  contribRoles.forEach(role => {
    const wrap = document.createElement('div');
    wrap.className = 'bilingual';
    ['ar', 'en'].forEach(lang => {
      const side = document.createElement('div'); side.className = 'bilingual-side'; side.dataset.lang = lang;
      const label = document.createElement('label'); label.className = 'field-label';
      label.textContent = lang === 'ar' ? role.label : role.labelEn;
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'input';
      inp.dataset.role = role.key; inp.dataset.lang = lang;
      side.append(label, inp);
      wrap.append(side);
      contributorsInputs[`${role.key}_${lang}`] = inp;
      inp.addEventListener('input', markDirty);
    });
    root.appendChild(wrap);
  });
}

/* ─── Load existing newsletter ────────────────────────────────────────────── */
async function loadNewsletter(id) {
  console.log('[editor.loadNewsletter] fetching id=', id);
  let data;
  try {
    const res = await supabase.from('newsletters').select('*').eq('id', id).maybeSingle();
    if (res.error) throw res.error;
    data = res.data;
  } catch (e) {
    console.error('[editor.loadNewsletter] query failed:', e);
    showToast('تعذّر قراءة بيانات النشرة من الخادم: ' + (e.message || e), 'error');
    return;
  }

  if (!data) {
    console.warn('[editor.loadNewsletter] no row returned for id=', id);
    showToast('العدد غير موجود (تحقق من تسجيل الدخول والصلاحيات)', 'error');
    return;
  }

  console.log('[editor.loadNewsletter] received', { id: data.id, title_ar: data.title_ar, status: data.status });
  state.newsletter = data;

  // Populate each field independently. A missing form-field ref (because
  // buildOverviewTab partially failed) must NOT abort the rest of the load.
  const setVal = (key, value) => {
    const el = overview[key];
    if (!el) { console.warn('[editor.loadNewsletter] missing field', key); return; }
    if ('checked' in el && typeof value === 'boolean') el.checked = value;
    else el.value = value ?? '';
  };
  const setRich = (key, html) => {
    const rt = overview[key];
    if (!rt || typeof rt.setHtml !== 'function') {
      console.warn('[editor.loadNewsletter] missing rich-text field', key);
      return;
    }
    try { rt.setHtml(html || ''); }
    catch (e) { console.error('[editor.loadNewsletter] setHtml failed for', key, e); }
  };

  setVal('title_ar',         data.title_ar);
  setVal('title_en',         data.title_en);
  setVal('edition_number',   data.edition_number ?? '');
  setVal('issue_date',       data.issue_date);
  setVal('has_translation',  !!data.has_translation);
  setVal('is_published',     data.status === 'published');
  setVal('reading_time_ar',  data.reading_time);
  setVal('reading_time_en',  data.reading_time_en);
  setRich('welcome_rt_ar',   data.welcome_message);
  setRich('welcome_rt_en',   data.welcome_message_en);

  try { await loadCategories(); }
  catch (e) { console.error('[editor.loadNewsletter] loadCategories failed:', e); }

  if (data.cover_image_url && overview._coverPreview && overview._coverStatus) {
    overview._coverPreview.innerHTML = `<img src="${data.cover_image_url}" alt="" style="max-width:260px;border-radius:var(--r-sm)">`;
    overview._coverStatus.textContent = 'يوجد صورة غلاف محفوظة';
  }

  const title = data.title_ar || data.title_en || 'محرر النشرة';
  $('editor-title').textContent = title;
  document.title = `تحرير: ${title} — لوحة الإدارة`;

  try { toggleEnglishFields(); } catch (e) { console.error(e); }

  try { await loadNewsletterEditors(id); }
  catch (e) { console.error('[editor.loadNewsletter] loadNewsletterEditors failed:', e); }

  try { await loadNewsletterSections(id); }
  catch (e) { console.error('[editor.loadNewsletter] loadNewsletterSections failed:', e); }

  markClean();
}

async function loadNewsletterEditors(nlId) {
  const { data, error } = await supabase
    .from('newsletter_editors').select('*')
    .eq('newsletter_id', nlId).order('created_at', { ascending: true }).limit(1);
  if (error) { console.error(error); return; }
  state.contributors = data?.[0] || null;
  bindContributors(state.contributors);
}

function bindContributors(row = null) {
  Object.keys(contributorsInputs).forEach(k => {
    contributorsInputs[k].value = row?.[k] || '';
  });
}

function buildContributorsPayload() {
  const payload = { newsletter_id: state.newsletter.id };
  contribRoles.forEach(role => {
    payload[`${role.key}_ar`] = contributorsInputs[`${role.key}_ar`].value?.trim() || null;
    payload[`${role.key}_en`] = overview.has_translation.checked
      ? (contributorsInputs[`${role.key}_en`].value?.trim() || null)
      : null;
  });
  return payload;
}

async function persistContributors() {
  if (!state.newsletter?.id) return;
  const payload = buildContributorsPayload();
  try {
    if (state.contributors?.id) {
      const { error } = await supabase.from('newsletter_editors').update(payload).eq('id', state.contributors.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('newsletter_editors').insert(payload).select('*').single();
      if (error) throw error;
      state.contributors = data;
    }
  } catch (e) { console.error(e); showToast('فشل حفظ بيانات معدّي النشرة', 'error'); }
}

/* ─── Sections list ───────────────────────────────────────────────────────── */
async function loadNewsletterSections(nlId) {
  const { data, error } = await supabase
    .from('newsletter_sections').select('*, section_types(*)')
    .eq('newsletter_id', nlId).order('sort_order', { ascending: true });
  if (error) { console.error(error); return; }
  state.sections = data || [];
  renderSectionsList();
}

function renderSectionsList() {
  const root = $('sections'); root.innerHTML = '';
  if (!state.sections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📚</div>
      <div class="empty-state-title">لم تتم إضافة أي قسم بعد</div>
      <p class="empty-state-text">اختر نوع القسم من الأعلى ثم اضغط "إضافة قسم".</p>
    `;
    root.appendChild(empty); return;
  }
  state.sections.forEach(sec => {
    const tile = document.createElement('div');
    tile.className = 'section-tile'; tile.draggable = true; tile.dataset.sid = sec.id;
    const handle = document.createElement('span');
    handle.className = 'section-tile-handle'; handle.textContent = '⋮⋮';
    handle.title = 'اسحب لإعادة الترتيب';
    const info = document.createElement('div'); info.className = 'section-tile-info';
    const slug = sec.section_types?.slug || '';
    info.innerHTML = `<strong>${sec.section_types?.icon || ''} ${escapeHtml(sec.section_types?.name_ar || slug)}</strong>
                      <small>${sec.is_visible ? '👁 مرئي' : '🚫 مخفي'}</small>`;
    const actions = document.createElement('div'); actions.className = 'section-tile-actions';

    const edit = document.createElement('button'); edit.className = 'btn btn-sm'; edit.textContent = 'تحرير';
    edit.addEventListener('click', () => openSectionDrawer(sec));

    const visToggle = document.createElement('button');
    visToggle.className = 'btn btn-sm';
    visToggle.textContent = sec.is_visible ? 'إخفاء' : 'إظهار';
    visToggle.addEventListener('click', async () => {
      const { error } = await supabase.from('newsletter_sections').update({ is_visible: !sec.is_visible }).eq('id', sec.id);
      if (error) return showToast(error.message, 'error');
      showToast('تم التحديث');
      loadNewsletterSections(state.newsletter.id);
    });

    const del = document.createElement('button'); del.className = 'btn btn-sm btn-danger'; del.textContent = 'حذف';
    del.addEventListener('click', async () => {
      const ok = await showConfirm('حذف هذا القسم وجميع محتواه؟', 'حذف قسم', { okLabel: 'حذف', danger: true });
      if (!ok) return;
      const { error } = await supabase.from('newsletter_sections').delete().eq('id', sec.id);
      if (error) return showToast(error.message, 'error');
      showToast('تم حذف القسم');
      loadNewsletterSections(state.newsletter.id);
    });

    actions.append(edit, visToggle, del);
    tile.append(handle, info, actions);

    tile.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/section-id', String(sec.id)); tile.classList.add('dragging'); });
    tile.addEventListener('dragend',   () => tile.classList.remove('dragging'));
    tile.addEventListener('dragover',  (ev) => { ev.preventDefault(); tile.classList.add('drag-over'); });
    tile.addEventListener('dragleave', () => tile.classList.remove('drag-over'));
    tile.addEventListener('drop', async (ev) => {
      ev.preventDefault(); tile.classList.remove('drag-over');
      const draggedId = ev.dataTransfer.getData('text/section-id');
      if (!draggedId || draggedId === String(sec.id)) return;
      const fromIdx = state.sections.findIndex(x => String(x.id) === draggedId);
      const toIdx   = state.sections.findIndex(x => x.id === sec.id);
      if (fromIdx === -1 || toIdx === -1) return;
      const [it] = state.sections.splice(fromIdx, 1);
      state.sections.splice(toIdx, 0, it);
      await persistSectionOrder();
      renderSectionsList();
      showToast('تم إعادة ترتيب الأقسام');
    });
    root.appendChild(tile);
  });
}

async function persistSectionOrder() {
  try {
    for (let i = 0; i < state.sections.length; i++) {
      const s = state.sections[i];
      await supabase.from('newsletter_sections').update({ sort_order: i + 1 }).eq('id', s.id);
    }
  } catch (e) { console.error(e); showToast('فشل حفظ ترتيب الأقسام', 'error'); }
}

$('btn-add-section').addEventListener('click', async () => {
  const stId = $('add-section-type').value;
  if (!stId) return showToast('اختر نوع القسم', 'error');
  if (!state.newsletter?.id) return showToast('احفظ بيانات النشرة أولاً', 'error');
  try {
    const payload = { newsletter_id: state.newsletter.id, section_type_id: stId, is_visible: true, sort_order: (state.sections.length || 0) + 1 };
    const { error } = await supabase.from('newsletter_sections').insert(payload);
    if (error) throw error;
    await loadNewsletterSections(state.newsletter.id);
    showToast('تم إضافة القسم');
  } catch (e) { showToast(e.message || 'خطأ', 'error'); }
});

/* ─── Section drawer ──────────────────────────────────────────────────────── */
async function openSectionDrawer(section) {
  const slug = section.section_types?.slug;
  const sectionName = section.section_types?.name_ar || 'القسم';
  const drawer = openDrawer({ title: `تحرير: ${sectionName}`, content: document.createElement('div') });

  const body = drawer.body;
  body.innerHTML = '<div class="muted">جاري التحميل…</div>';

  let builder;
  if (slug === 'illumination' || slug === 'inspiring') builder = await buildRichBodySection(section, slug);
  else if (slug === 'news')     builder = await buildNewsSection(section);
  else if (slug === 'articles') builder = await buildArticlesSection(section);
  else if (slug === 'podcast')  builder = await buildPodcastSection(section);
  else builder = { node: makeUnsupportedNotice(slug), save: async () => true };

  body.innerHTML = '';
  body.appendChild(buildHeaderImageBlock(section));
  body.appendChild(builder.node);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary'; saveBtn.textContent = 'حفظ القسم';
  saveBtn.addEventListener('click', async () => {
    setLoading(saveBtn, true);
    try { await builder.save(); showToast('تم حفظ القسم'); drawer.close(); loadNewsletterSections(state.newsletter.id); }
    catch (e) { showToast(e.message || e, 'error'); }
    finally { setLoading(saveBtn, false); }
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn'; cancelBtn.textContent = 'إغلاق';
  cancelBtn.addEventListener('click', drawer.close);
  const f = document.createElement('div'); f.style.display='flex'; f.style.gap='8px'; f.append(cancelBtn, saveBtn);
  drawer.setFoot(f);
}

function makeUnsupportedNotice(slug) {
  const n = document.createElement('div');
  n.className = 'empty-state';
  n.innerHTML = `<div class="empty-state-icon">⚠️</div><div class="empty-state-title">نوع القسم غير مدعوم: ${escapeHtml(slug || '')}</div>`;
  return n;
}

/* ── Header image (any section) ── */
function buildHeaderImageBlock(section) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginBottom = '20px';
  card.innerHTML = `<div class="card-head"><h3>صورة هيدر القسم</h3><span class="muted">اختياري — تظهر فوق محتوى القسم</span></div>`;
  const body = document.createElement('div'); body.className = 'card-body';
  const uploader = document.createElement('div'); uploader.className = 'uploader';
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*';
  const preview = document.createElement('div');
  preview.innerHTML = section.header_image_url
    ? `<img src="${section.header_image_url}" style="max-width:100%;max-height:200px;border-radius:var(--r-sm)">`
    : `<div class="muted">اسحب صورة هنا أو انقر للاختيار</div>`;
  uploader.append(fileInput, preview);
  body.appendChild(uploader);
  const clearBtn = document.createElement('button'); clearBtn.type = 'button'; clearBtn.className = 'btn btn-sm';
  clearBtn.textContent = 'حذف الصورة';
  if (!section.header_image_url) clearBtn.style.display = 'none';
  clearBtn.addEventListener('click', async () => {
    try {
      await saveSectionHeaderMeta(section, { header_image_url: null });
      section.header_image_url = null;
      preview.innerHTML = `<div class="muted">اسحب صورة هنا أو انقر للاختيار</div>`;
      clearBtn.style.display = 'none';
      showToast('تم حذف صورة الهيدر');
    } catch (e) { showToast(e.message || e, 'error'); }
  });
  body.appendChild(clearBtn);
  card.appendChild(body);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    setLoading(fileInput, true);
    const prog = document.createElement('progress'); prog.max = 1; prog.value = 0; prog.style.width = '100%';
    preview.appendChild(prog);
    const note = showToast('جاري الرفع…', 'pending', 0);
    try {
      const url = await uploadFileWithProgress(file, `sections/${section.id}`, (r) => { if (r >= 0) prog.value = r; });
      prog.value = 1; note.dismiss();
      await saveSectionHeaderMeta(section, { header_image_url: url });
      section.header_image_url = url;
      preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:200px;border-radius:var(--r-sm)">`;
      clearBtn.style.display = '';
      fileInput.value = '';
      showToast('تم رفع صورة الهيدر');
    } catch (e) { note.dismiss(); showToast(e.message || e, 'error'); }
    finally { setLoading(fileInput, false); }
  });
  return card;
}

async function saveSectionHeaderMeta(section, fields) {
  const { error } = await supabase.from('newsletter_sections').update(fields).eq('id', section.id);
  if (!error) return;
  if (error.code !== '42703') throw error;
  const slug = section.section_types?.slug;
  let legacy = null;
  if (slug === 'illumination') legacy = 'section_illumination';
  else if (slug === 'inspiring') legacy = 'section_inspiring';
  if (!legacy) throw new Error('هذا القسم يتطلب تحديث قاعدة البيانات لحفظ صورة الهيدر.');
  const legacyPayload = {};
  if ('header_image_url' in fields) legacyPayload.header_image_url = fields.header_image_url;
  const { data: existing, error: findError } = await supabase.from(legacy).select('id').eq('newsletter_section_id', section.id).maybeSingle();
  if (findError) throw findError;
  if (existing?.id) {
    const { error: updateErr } = await supabase.from(legacy).update(legacyPayload).eq('id', existing.id);
    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await supabase.from(legacy).insert({ newsletter_section_id: section.id, ...legacyPayload });
    if (insertErr) throw insertErr;
  }
}

/* ── Illumination / Inspiring (rich-text body) ── */
async function buildRichBodySection(section, slug) {
  const table = slug === 'illumination' ? 'section_illumination' : 'section_inspiring';
  const { data } = await supabase.from(table).select('*').eq('newsletter_section_id', section.id).maybeSingle();
  const node = document.createElement('div');
  const wrap = document.createElement('div'); wrap.className = 'bilingual';

  const arSide = document.createElement('div'); arSide.className = 'bilingual-side'; arSide.dataset.lang = 'ar';
  arSide.innerHTML = `<label class="field-label">المحتوى (عربي)</label>`;
  const arRt = createRichTextField({ dir: 'rtl', initialHtml: data?.body_ar || '', placeholder: 'اكتب أو الصق المحتوى هنا…', minHeight: '12em' });
  arSide.appendChild(arRt.el);

  const enSide = document.createElement('div'); enSide.className = 'bilingual-side'; enSide.dataset.lang = 'en';
  enSide.innerHTML = `<label class="field-label">Content (EN)</label>`;
  const enRt = createRichTextField({ dir: 'ltr', initialHtml: data?.body_en || '', placeholder: 'Paste or type content here…', minHeight: '12em' });
  enSide.appendChild(enRt.el);

  if (!overview.has_translation.checked) wrap.classList.add('hide-en');

  wrap.append(arSide, enSide);
  node.appendChild(wrap);

  return {
    node,
    save: async () => {
      const payload = {
        newsletter_section_id: section.id,
        body_ar: arRt.getHtml(),
        body_en: overview.has_translation.checked ? (enRt.getHtml() || null) : null,
      };
      if (data) {
        const { error } = await supabase.from(table).update(payload).eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
    },
  };
}

/* ── News items (repeating) ── */
async function buildNewsSection(section) {
  const { data: items } = await supabase.from('section_news_items')
    .select('*').eq('newsletter_section_id', section.id).order('sort_order', { ascending: true });
  const node = document.createElement('div');
  const list = document.createElement('div'); list.className = 'repeat-list';
  node.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm';
  addBtn.style.marginTop = '12px';
  addBtn.textContent = '+ إضافة خبر';
  addBtn.addEventListener('click', () => list.appendChild(newsItemRow(null, section)));
  node.appendChild(addBtn);

  (items || []).forEach(it => list.appendChild(newsItemRow(it, section)));

  return { node, save: async () => {} };
}

function newsItemRow(item, section) {
  const row = document.createElement('div'); row.className = 'repeat-item';

  const titleBi = document.createElement('div'); titleBi.className = 'bilingual';
  const titleAr = inputField('عنوان الخبر (عربي)', item?.title_ar || '');
  const titleEn = inputField('News title (EN)', item?.title_en || '', 'en');
  titleBi.append(titleAr.wrap, titleEn.wrap);
  if (!overview.has_translation.checked) titleBi.classList.add('hide-en');

  const sumBi = document.createElement('div'); sumBi.className = 'bilingual';
  const sumAr = textareaField('ملخص الخبر (عربي)', item?.summary_ar || '');
  const sumEn = textareaField('Summary (EN)', item?.summary_en || '', 'en');
  sumBi.append(sumAr.wrap, sumEn.wrap);
  if (!overview.has_translation.checked) sumBi.classList.add('hide-en');

  const srcBi = document.createElement('div'); srcBi.className = 'bilingual';
  const srcAr = inputField('اسم المصدر (عربي)', item?.source_name_ar || '');
  const srcEn = inputField('Source name (EN)', item?.source_name_en || '', 'en');
  srcBi.append(srcAr.wrap, srcEn.wrap);
  if (!overview.has_translation.checked) srcBi.classList.add('hide-en');

  const url = inputField('رابط المصدر', item?.source_url || '');
  url.input.placeholder = 'https://...';
  url.input.dir = 'ltr';

  const actions = document.createElement('div'); actions.className = 'row row-end'; actions.style.marginTop = '8px';
  const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary btn-sm'; saveBtn.textContent = 'حفظ الخبر';
  const delBtn  = document.createElement('button'); delBtn.className = 'btn btn-sm btn-danger'; delBtn.textContent = 'حذف';
  actions.append(delBtn, saveBtn);

  saveBtn.addEventListener('click', async () => {
    if (!titleAr.input.value.trim()) return showToast('العنوان مطلوب', 'error');
    setLoading(saveBtn, true);
    try {
      const payload = {
        newsletter_section_id: section.id,
        title_ar: titleAr.input.value.trim(),
        title_en: overview.has_translation.checked ? (titleEn.input.value || null) : null,
        summary_ar: sumAr.input.value,
        summary_en: overview.has_translation.checked ? (sumEn.input.value || null) : null,
        source_name_ar: srcAr.input.value || null,
        source_name_en: overview.has_translation.checked ? (srcEn.input.value || null) : null,
        source_url: url.input.value,
        sort_order: 0,
      };
      if (item?.id) {
        const { error } = await supabase.from('section_news_items').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('section_news_items').insert(payload).select().single();
        if (error) throw error;
        item = data;
      }
      showToast('تم حفظ الخبر');
    } catch (e) { showToast(e.message || e, 'error'); }
    finally { setLoading(saveBtn, false); }
  });
  delBtn.addEventListener('click', async () => {
    if (!item?.id) { row.remove(); return; }
    const ok = await showConfirm('حذف الخبر؟', 'حذف', { okLabel: 'حذف', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('section_news_items').delete().eq('id', item.id);
    if (error) return showToast(error.message, 'error');
    row.remove(); showToast('تم الحذف');
  });

  row.append(titleBi, sumBi, srcBi, url.wrap, actions);
  return row;
}

/* ── Article items (repeating) ── */
async function buildArticlesSection(section) {
  const { data: items } = await supabase.from('section_article_items')
    .select('*').eq('newsletter_section_id', section.id).order('sort_order', { ascending: true });
  const node = document.createElement('div');
  const list = document.createElement('div'); list.className = 'repeat-list';
  node.appendChild(list);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm';
  addBtn.style.marginTop = '12px';
  addBtn.textContent = '+ إضافة مقال';
  addBtn.addEventListener('click', () => list.appendChild(articleItemRow(null, section)));
  node.appendChild(addBtn);

  (items || []).forEach(it => list.appendChild(articleItemRow(it, section)));

  return { node, save: async () => {} };
}

function articleItemRow(item, section) {
  const row = document.createElement('div'); row.className = 'repeat-item';

  const titleBi = document.createElement('div'); titleBi.className = 'bilingual';
  const titleAr = inputField('عنوان المقال (عربي)', item?.title_ar || '');
  const titleEn = inputField('Article title (EN)', item?.title_en || '', 'en');
  titleBi.append(titleAr.wrap, titleEn.wrap);
  if (!overview.has_translation.checked) titleBi.classList.add('hide-en');

  const authBi = document.createElement('div'); authBi.className = 'bilingual';
  const authAr = inputField('اسم الكاتب (عربي)', item?.author_name_ar || '');
  const authEn = inputField('Author (EN)', item?.author_name_en || '', 'en');
  authBi.append(authAr.wrap, authEn.wrap);
  if (!overview.has_translation.checked) authBi.classList.add('hide-en');

  const exBi = document.createElement('div'); exBi.className = 'bilingual';
  const exAr = textareaField('المقتطف (عربي)', item?.excerpt_ar || '');
  const exEn = textareaField('Excerpt (EN)', item?.excerpt_en || '', 'en');
  exBi.append(exAr.wrap, exEn.wrap);
  if (!overview.has_translation.checked) exBi.classList.add('hide-en');

  const url = inputField('رابط المقال', item?.article_url || '');
  url.input.placeholder = 'https://...';
  url.input.dir = 'ltr';

  const actions = document.createElement('div'); actions.className = 'row row-end'; actions.style.marginTop = '8px';
  const saveBtn = document.createElement('button'); saveBtn.className = 'btn btn-primary btn-sm'; saveBtn.textContent = 'حفظ المقال';
  const delBtn  = document.createElement('button'); delBtn.className = 'btn btn-sm btn-danger'; delBtn.textContent = 'حذف';
  actions.append(delBtn, saveBtn);

  saveBtn.addEventListener('click', async () => {
    if (!titleAr.input.value.trim()) return showToast('العنوان مطلوب', 'error');
    setLoading(saveBtn, true);
    try {
      const payload = {
        newsletter_section_id: section.id,
        title_ar: titleAr.input.value.trim(),
        title_en: overview.has_translation.checked ? (titleEn.input.value || null) : null,
        author_name_ar: authAr.input.value,
        author_name_en: overview.has_translation.checked ? (authEn.input.value || null) : null,
        excerpt_ar: exAr.input.value,
        excerpt_en: overview.has_translation.checked ? (exEn.input.value || null) : null,
        article_url: url.input.value || null,
        sort_order: 0,
      };
      if (item?.id) {
        const { error } = await supabase.from('section_article_items').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('section_article_items').insert(payload).select().single();
        if (error) throw error;
        item = data;
      }
      showToast('تم حفظ المقال');
    } catch (e) { showToast(e.message || e, 'error'); }
    finally { setLoading(saveBtn, false); }
  });
  delBtn.addEventListener('click', async () => {
    if (!item?.id) { row.remove(); return; }
    const ok = await showConfirm('حذف المقال؟', 'حذف', { okLabel: 'حذف', danger: true });
    if (!ok) return;
    const { error } = await supabase.from('section_article_items').delete().eq('id', item.id);
    if (error) return showToast(error.message, 'error');
    row.remove(); showToast('تم الحذف');
  });

  row.append(titleBi, authBi, exBi, url.wrap, actions);
  return row;
}

/* ── Podcast (single) ── */
async function buildPodcastSection(section) {
  const { data } = await supabase.from('section_podcast').select('*').eq('newsletter_section_id', section.id).maybeSingle();
  let podcastImageUrl = data?.podcast_image_url || data?.cover_image_url || null;

  function isMissingPodcastImageColumn(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
    return error?.code === '42703' || error?.code === 'PGRST204' || /podcast_image_url/i.test(text);
  }

  const node = document.createElement('div');

  const titleBi = document.createElement('div'); titleBi.className = 'bilingual';
  const titleAr = inputField('عنوان البودكاست (عربي)', data?.title_ar || '');
  const titleEn = inputField('Podcast title (EN)', data?.title_en || '', 'en');
  titleBi.append(titleAr.wrap, titleEn.wrap);
  if (!overview.has_translation.checked) titleBi.classList.add('hide-en');

  const descBi = document.createElement('div'); descBi.className = 'bilingual';
  const descAr = textareaField('الوصف (عربي)', data?.description_ar || '');
  const descEn = textareaField('Description (EN)', data?.description_en || '', 'en');
  descBi.append(descAr.wrap, descEn.wrap);
  if (!overview.has_translation.checked) descBi.classList.add('hide-en');

  const imgWrap = document.createElement('div'); imgWrap.className = 'field';
  imgWrap.innerHTML = `<label class="field-label">صورة البودكاست</label>`;
  const imgUploader = document.createElement('div'); imgUploader.className = 'uploader';
  const imgFile = document.createElement('input'); imgFile.type = 'file'; imgFile.accept = 'image/*';
  const imgPrev = document.createElement('div');
  imgPrev.innerHTML = podcastImageUrl
    ? `<img src="${podcastImageUrl}" style="max-width:100%;max-height:200px;border-radius:var(--r-sm)">`
    : `<div class="muted">اسحب صورة هنا أو انقر للاختيار</div>`;
  imgUploader.append(imgFile, imgPrev);
  imgWrap.appendChild(imgUploader);

  const clearImgBtn = document.createElement('button'); clearImgBtn.type = 'button'; clearImgBtn.className = 'btn btn-sm';
  clearImgBtn.textContent = 'حذف الصورة';
  if (!podcastImageUrl) clearImgBtn.style.display = 'none';
  clearImgBtn.addEventListener('click', () => {
    podcastImageUrl = null; imgFile.value = '';
    imgPrev.innerHTML = `<div class="muted">اسحب صورة هنا أو انقر للاختيار</div>`;
    clearImgBtn.style.display = 'none';
  });
  imgWrap.appendChild(clearImgBtn);

  imgFile.addEventListener('change', async () => {
    const file = imgFile.files?.[0];
    if (!file) return;
    setLoading(imgFile, true);
    const prog = document.createElement('progress'); prog.max = 1; prog.value = 0; prog.style.width = '100%';
    imgPrev.appendChild(prog);
    const note = showToast('جاري الرفع…', 'pending', 0);
    try {
      const url = await uploadFileWithProgress(file, `sections/${section.id}`, (r) => { if (r >= 0) prog.value = r; });
      prog.value = 1; note.dismiss();
      podcastImageUrl = url;
      imgPrev.innerHTML = `<img src="${url}" style="max-width:100%;max-height:200px;border-radius:var(--r-sm)">`;
      clearImgBtn.style.display = '';
      imgFile.value = '';
      showToast('تم الرفع');
    } catch (e) { note.dismiss(); showToast(e.message || e, 'error'); }
    finally { setLoading(imgFile, false); }
  });

  node.append(titleBi, descBi, imgWrap);

  return {
    node,
    save: async () => {
      const payload = {
        newsletter_section_id: section.id,
        title_ar: titleAr.input.value,
        title_en: overview.has_translation.checked ? (titleEn.input.value || null) : null,
        description_ar: descAr.input.value,
        description_en: overview.has_translation.checked ? (descEn.input.value || null) : null,
        audio_url: data?.audio_url || '',
        podcast_image_url: podcastImageUrl,
      };
      const upsert = data
        ? supabase.from('section_podcast').update(payload).eq('id', data.id)
        : supabase.from('section_podcast').insert(payload);
      const { error } = await upsert;
      if (!error) return;
      if (!isMissingPodcastImageColumn(error)) throw error;
      const legacy = { ...payload, cover_image_url: podcastImageUrl }; delete legacy.podcast_image_url;
      const fb = data
        ? supabase.from('section_podcast').update(legacy).eq('id', data.id)
        : supabase.from('section_podcast').insert(legacy);
      const { error: err2 } = await fb;
      if (err2) throw err2;
      showToast('تم الحفظ مع وضع التوافق. يفضّل تشغيل migration لإضافة podcast_image_url.', 'warning');
    },
  };
}

/* ── Small field factories used by news/article/podcast rows ── */
function inputField(label, value = '', lang = 'ar') {
  const wrap = document.createElement('div'); wrap.className = 'bilingual-side'; wrap.dataset.lang = lang;
  const lbl = document.createElement('label'); lbl.className = 'field-label'; lbl.textContent = label;
  const input = document.createElement('input'); input.type = 'text'; input.className = 'input'; input.value = value;
  wrap.append(lbl, input);
  return { wrap, input };
}
function textareaField(label, value = '', lang = 'ar') {
  const wrap = document.createElement('div'); wrap.className = 'bilingual-side'; wrap.dataset.lang = lang;
  const lbl = document.createElement('label'); lbl.className = 'field-label'; lbl.textContent = label;
  const input = document.createElement('textarea'); input.className = 'input'; input.rows = 3; input.value = value;
  wrap.append(lbl, input);
  return { wrap, input };
}

/* ─── Save metadata ───────────────────────────────────────────────────────── */
async function saveMetadata() {
  if (!overview.title_ar.value.trim()) return showToast('عنوان النشرة مطلوب', 'error');
  setLoading($('save-meta'), true);
  try {
    const payload = {
      title_ar: overview.title_ar.value.trim(),
      title_en: overview.has_translation.checked ? (overview.title_en.value || null) : null,
      edition_number: overview.edition_number.value ? Number(overview.edition_number.value) : null,
      issue_date: overview.issue_date.value || null,
      reading_time: overview.reading_time_ar.value || null,
      reading_time_en: overview.has_translation.checked ? (overview.reading_time_en.value || null) : null,
      welcome_message: overview.welcome_rt_ar.getHtml() || null,
      welcome_message_en: overview.has_translation.checked ? (overview.welcome_rt_en.getHtml() || null) : null,
      has_translation: overview.has_translation.checked,
      translated_content: null,
      status: overview.is_published.checked ? 'published' : 'draft',
      category_id: overview.category?.value || null,
      cover_image_url: state.newsletter?.cover_image_url || null,
    };
    const fallback = { ...payload };
    delete fallback.has_translation;
    delete fallback.translated_content;
    delete fallback.reading_time_en;
    delete fallback.welcome_message_en;

    if (state.newsletter?.id) {
      const { error } = await supabase.from('newsletters').update(payload).eq('id', state.newsletter.id);
      if (error) {
        if (error.code === '42703') {
          const { error: e2 } = await supabase.from('newsletters').update(fallback).eq('id', state.newsletter.id);
          if (e2) throw e2;
          showToast('تم التحديث (بدون حقول الترجمة - يلزم تشغيل ترحيل قاعدة البيانات)');
        } else throw error;
      } else showToast('تم تحديث بيانات النشرة');
    } else {
      const { data, error } = await supabase.from('newsletters').insert(payload).select().maybeSingle();
      if (error) {
        if (error.code === '42703') {
          const { data: d2, error: e2 } = await supabase.from('newsletters').insert(fallback).select().maybeSingle();
          if (e2) throw e2;
          state.newsletter = d2;
          history.replaceState(null, '', `?id=${state.newsletter.id}`);
          showToast('تم الإنشاء (بدون حقول الترجمة - يلزم تشغيل ترحيل قاعدة البيانات)');
        } else throw error;
      } else {
        state.newsletter = data;
        history.replaceState(null, '', `?id=${state.newsletter.id}`);
        showToast('تم إنشاء النشرة');
      }
    }
    $('editor-title').textContent = overview.title_ar.value || overview.title_en.value || 'محرر النشرة';
    await persistContributors();
    if (state.newsletter?.id) await loadNewsletterSections(state.newsletter.id);
    markClean();
  } catch (e) { showToast(e.message || e, 'error'); }
  finally { setLoading($('save-meta'), false); }
}

$('save-meta').addEventListener('click', saveMetadata);
$('publish-all').addEventListener('click', async () => {
  if (!state.newsletter?.id) return saveMetadata();
  await saveMetadata();
});

/* ─── Delete ─────────────────────────────────────────────────────────────── */
$('delete-news').addEventListener('click', async () => {
  if (!state.newsletter?.id) return showToast('لا يوجد عدد للحذف', 'error');
  const ok = await showConfirm('حذف هذا العدد وكل أقسامه؟ لا يمكن التراجع.', 'حذف العدد', { okLabel: 'حذف نهائي', danger: true });
  if (!ok) return;
  const { error } = await supabase.from('newsletters').delete().eq('id', state.newsletter.id);
  if (error) return showToast(error.message, 'error');
  state.dirty = false;
  showToast('تم حذف العدد');
  setTimeout(() => window.location.href = '/admin_cms/dashboard.html', 700);
});

/* ─── Ctrl+S / Cmd+S ──────────────────────────────────────────────────────── */
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveMetadata();
  }
});

/* ─── Go ──────────────────────────────────────────────────────────────────── */
init();
