// admin_cms/main.js — Dashboard logic.
//
// Views (mapped by sidebar):
//   • newsletters  — list, search, status filter, unified create modal
//   • categories   — list with usage count, single-modal create/edit
//   • join         — list, single-row detail drawer (no raw JSON dumps)
//   • audit        — delegated to ./js/audit-log.js
//
// All mutations go through a single create/edit modal (showFormModal) so the
// editor never has to chain multiple prompts.

import { initSupabase, uploadFileWithProgress, uploadFileToBucket } from './supabase-client.js';
import { showToast, showConfirm, showFormModal, openDrawer, bindMobileSidebar } from './ui.js';
import { loadAuditLog, destroyAuditLog } from './js/audit-log.js';

await initSupabase();
const supabase = window.supabase;

async function ensureAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = '/admin_cms/';
    throw new Error('Not authenticated');
  }
}
await ensureAuth();

/* ─── DOM refs ────────────────────────────────────────────────────────────── */
const content    = document.getElementById('content-area');
const pageTitle  = document.getElementById('page-title');
const pageActions = document.getElementById('page-actions');

bindMobileSidebar(document.getElementById('admin-sidebar'), document.getElementById('hamburger'));

/* ─── State ───────────────────────────────────────────────────────────────── */
const state = {
  newsletters: [],
  newsletterFilter: { search: '', status: 'all', category: 'all' },
  categories: [],
  joinRequests: [],
};

/* ─── Skeleton + empty state helpers ─────────────────────────────────────── */
function renderSkeleton(rows = 5) {
  content.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'card';
  for (let i = 0; i < rows; i++) {
    const r = document.createElement('div');
    r.className = 'skeleton-row';
    const cells = ['46px', '60%', '20%', '10%'];
    cells.forEach((w) => {
      const c = document.createElement('div');
      c.className = 'skeleton';
      c.style.flex = '0 0 auto';
      c.style.width = w;
      c.style.height = '18px';
      r.appendChild(c);
    });
    wrap.appendChild(r);
  }
  content.appendChild(wrap);
}

function renderEmptyState({ icon = '📭', title, text, actionLabel, onAction }) {
  content.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${title}</div>
    <p class="empty-state-text">${text || ''}</p>
  `;
  if (actionLabel) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = actionLabel;
    btn.addEventListener('click', onAction);
    el.appendChild(btn);
  }
  content.appendChild(el);
}

function setPageActions(nodes) {
  pageActions.innerHTML = '';
  (Array.isArray(nodes) ? nodes : [nodes]).filter(Boolean).forEach(n => pageActions.appendChild(n));
}

/* ─── Generic responsive table renderer ─────────────────────────────────── */
function renderTable(columns, rows, { responsive = true } = {}) {
  const wrap = document.createElement('div');
  wrap.style.overflowX = 'auto';
  wrap.className = 'card';
  const t = document.createElement('table');
  t.className = 'data-table' + (responsive ? ' data-table-responsive' : '');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach(c => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  thead.appendChild(trh);
  t.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach((cell, i) => {
      const td = document.createElement('td');
      td.setAttribute('data-label', columns[i] || '');
      if (cell instanceof Node) td.appendChild(cell);
      else if (cell == null) td.textContent = '';
      else td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  wrap.appendChild(t);
  return wrap;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* CATEGORIES                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */
async function loadCategories() {
  pageTitle.textContent = 'التصنيفات';
  renderSkeleton(4);
  try {
    const [{ data: cats, error: catsErr }, { data: nls, error: nlsErr }] = await Promise.all([
      supabase.from('categories').select('*').order('created_at', { ascending: true }),
      supabase.from('newsletters').select('category_id'),
    ]);
    if (catsErr) throw catsErr;
    if (nlsErr) throw nlsErr;

    state.categories = cats || [];
    const usage = (nls || []).reduce((acc, r) => { if (r?.category_id) acc[r.category_id] = (acc[r.category_id] || 0) + 1; return acc; }, {});

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ تصنيف جديد';
    addBtn.addEventListener('click', () => openCategoryModal());
    setPageActions(addBtn);

    if (!state.categories.length) {
      renderEmptyState({
        icon: '🏷️',
        title: 'لا توجد تصنيفات بعد',
        text: 'أنشئ أول تصنيف لتنظيم أعداد النشرة.',
        actionLabel: '+ تصنيف جديد',
        onAction: () => openCategoryModal(),
      });
      return;
    }

    const rows = state.categories.map(cat => [
      cat.name_ar || '—',
      cat.name_en || '—',
      (() => {
        const b = document.createElement('span');
        b.className = 'badge badge-muted';
        b.textContent = String(usage[cat.id] || 0);
        return b;
      })(),
      (() => {
        const wrap = document.createElement('div');
        wrap.className = 'table-actions';
        const edit = document.createElement('button'); edit.className = 'btn btn-sm'; edit.textContent = 'تحرير';
        edit.addEventListener('click', () => openCategoryModal(cat));
        const del = document.createElement('button'); del.className = 'btn btn-sm btn-danger'; del.textContent = 'حذف';
        del.addEventListener('click', () => confirmDeleteCategory(cat));
        wrap.append(edit, del);
        return wrap;
      })(),
    ]);

    content.innerHTML = '';
    content.appendChild(renderTable(['الاسم (عربي)', 'الاسم (EN)', 'الاستخدام', ''], rows));
  } catch (e) {
    showToast(e.message || e, 'error');
    renderEmptyState({ icon: '⚠️', title: 'تعذر تحميل التصنيفات', text: e.message || '' });
  }
}

function openCategoryModal(existing = null) {
  return showFormModal({
    title: existing ? 'تحرير التصنيف' : 'إضافة تصنيف',
    submitLabel: existing ? 'حفظ التغييرات' : 'إضافة',
    fields: [
      {
        name: 'name',
        type: 'bilingual-text',
        label: 'اسم التصنيف',
        defaultValueAr: existing?.name_ar || '',
        defaultValueEn: existing?.name_en || '',
        required: true,
        full: true,
        placeholderAr: 'مثال: الذكاء الاصطناعي',
        placeholderEn: 'e.g. Artificial Intelligence',
        validate: (v) => {
          if (!v?.ar?.trim()) return 'الاسم العربي مطلوب';
          if (!v?.en?.trim()) return 'الاسم الإنجليزي مطلوب';
          return null;
        },
      },
    ],
    onSubmit: async (values) => {
      const payload = { name_ar: values.name.ar.trim(), name_en: values.name.en.trim() };
      const q = existing
        ? supabase.from('categories').update(payload).eq('id', existing.id)
        : supabase.from('categories').insert(payload);
      const { error } = await q;
      if (error) throw error;
      showToast(existing ? 'تم تحديث التصنيف' : 'تمت إضافة التصنيف');
      loadCategories();
    },
  });
}

async function confirmDeleteCategory(cat) {
  const ok = await showConfirm(
    `سيتم إلغاء ارتباط أي أعداد بهذا التصنيف "${cat.name_ar}" قبل الحذف. هل أنت متأكد؟`,
    'حذف التصنيف',
    { okLabel: 'حذف', danger: true }
  );
  if (!ok) return;
  const { error: clearErr } = await supabase.from('newsletters').update({ category_id: null }).eq('category_id', cat.id);
  if (clearErr) return showToast(clearErr.message, 'error');
  const { error } = await supabase.from('categories').delete().eq('id', cat.id);
  if (error) return showToast(error.message, 'error');
  showToast('تم حذف التصنيف');
  loadCategories();
}

/* ────────────────────────────────────────────────────────────────────────── */
/* JOIN REQUESTS                                                              */
/* ────────────────────────────────────────────────────────────────────────── */
async function loadJoinRequests() {
  pageTitle.textContent = 'طلبات الانضمام';
  renderSkeleton(5);
  setPageActions(null);
  try {
    const { data, error } = await supabase.from('join_requests').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    state.joinRequests = data || [];

    if (!state.joinRequests.length) {
      renderEmptyState({ icon: '✉️', title: 'لا توجد طلبات انضمام', text: 'سيتم عرض الطلبات هنا عند ورودها.' });
      return;
    }

    const rows = state.joinRequests.map(r => [
      r.name || '—',
      (() => { const a = document.createElement('span'); a.textContent = r.email || '—'; a.style.direction = 'ltr'; return a; })(),
      r.committee || '—',
      new Date(r.created_at).toLocaleDateString('ar-SA'),
      (() => {
        const b = document.createElement('button');
        b.className = 'btn btn-sm'; b.textContent = 'عرض التفاصيل';
        b.addEventListener('click', () => openJoinRequestDrawer(r));
        return b;
      })(),
    ]);
    content.innerHTML = '';
    content.appendChild(renderTable(['الاسم', 'البريد الإلكتروني', 'اللجنة', 'التاريخ', ''], rows));
  } catch (e) {
    showToast(e.message || e, 'error');
    renderEmptyState({ icon: '⚠️', title: 'تعذر تحميل الطلبات', text: e.message || '' });
  }
}

function openJoinRequestDrawer(req) {
  const labels = {
    name: 'الاسم', phone: 'الهاتف', email: 'البريد الإلكتروني',
    club_member: 'عضو في النادي؟', committee: 'اللجنة', tech_interest: 'اهتمام تقني',
    read_newsletter: 'يقرأ النشرة؟', attraction: 'ما يجذبه', skills: 'المهارات',
    commitment: 'الالتزام', motivation: 'الدافع', tech_field: 'المجال التقني',
    suggestion: 'اقتراح', confirmed: 'تم التأكيد', created_at: 'تاريخ الطلب',
  };
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.border = '0';
  wrap.style.boxShadow = 'none';
  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gridTemplateColumns = '1fr';
  list.style.gap = '10px';
  Object.entries(labels).forEach(([key, label]) => {
    let v = req[key];
    if (v == null || v === '') return;
    if (Array.isArray(v)) v = v.join('، ');
    if (typeof v === 'boolean') v = v ? 'نعم' : 'لا';
    if (key === 'created_at') v = new Date(v).toLocaleString('ar-SA');
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '140px 1fr';
    row.style.gap = '12px';
    row.style.padding = '10px';
    row.style.borderBottom = '1px solid var(--border)';
    row.innerHTML = `<div style="color:var(--text-muted);font-weight:600;font-size:13px">${label}</div>
                     <div style="color:var(--text);word-break:break-word">${escapeHtml(String(v))}</div>`;
    list.appendChild(row);
  });
  // Show metadata if there's anything left in metadata jsonb
  if (req.metadata && Object.keys(req.metadata).length) {
    const h = document.createElement('h4'); h.textContent = 'بيانات إضافية';
    h.style.marginTop = '16px';
    list.appendChild(h);
    const pre = document.createElement('pre');
    pre.className = 'ui-modal-pre';
    pre.textContent = JSON.stringify(req.metadata, null, 2);
    list.appendChild(pre);
  }
  wrap.appendChild(list);
  openDrawer({ title: `طلب من: ${req.name || '—'}`, content: wrap });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ────────────────────────────────────────────────────────────────────────── */
/* NEWSLETTERS                                                                */
/* ────────────────────────────────────────────────────────────────────────── */
async function loadNewsletters() {
  pageTitle.textContent = 'الأعداد';
  renderSkeleton(6);
  try {
    const [{ data: nls, error }, { data: cats }] = await Promise.all([
      supabase.from('newsletters').select('*').order('created_at', { ascending: false }),
      supabase.from('categories').select('*'),
    ]);
    if (error) throw error;
    state.newsletters = nls || [];
    state.categories = cats || [];

    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ عدد جديد';
    addBtn.addEventListener('click', () => openCreateNewsletterModal());
    setPageActions(addBtn);

    if (!state.newsletters.length) {
      renderEmptyState({
        icon: '📰',
        title: 'لم تنشر بعد أي عدد',
        text: 'أنشئ أول عدد للنشرة وابدأ في تحريره.',
        actionLabel: '+ عدد جديد',
        onAction: () => openCreateNewsletterModal(),
      });
      return;
    }

    renderNewslettersList();
  } catch (e) {
    showToast(e.message || e, 'error');
    renderEmptyState({ icon: '⚠️', title: 'تعذر تحميل الأعداد', text: e.message || '' });
  }
}

function renderNewslettersList() {
  content.innerHTML = '';

  /* Toolbar */
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <div class="toolbar-search">
      <input type="search" id="nl-search" placeholder="ابحث بالعنوان أو رقم الإصدار…" value="${escapeHtml(state.newsletterFilter.search)}">
    </div>
    <div class="toolbar-chips" role="tablist" aria-label="فلتر الحالة">
      <button class="chip ${state.newsletterFilter.status === 'all' ? 'active' : ''}"        data-status="all">الكل</button>
      <button class="chip ${state.newsletterFilter.status === 'published' ? 'active' : ''}"  data-status="published">منشور</button>
      <button class="chip ${state.newsletterFilter.status === 'draft' ? 'active' : ''}"      data-status="draft">مسودة</button>
      <button class="chip ${state.newsletterFilter.status === 'archived' ? 'active' : ''}"   data-status="archived">مؤرشف</button>
    </div>
  `;
  toolbar.querySelector('#nl-search').addEventListener('input', (e) => {
    state.newsletterFilter.search = e.target.value;
    renderNewslettersListBody();
  });
  toolbar.querySelectorAll('.chip[data-status]').forEach(chip => {
    chip.addEventListener('click', () => {
      state.newsletterFilter.status = chip.dataset.status;
      toolbar.querySelectorAll('.chip[data-status]').forEach(c => c.classList.toggle('active', c === chip));
      renderNewslettersListBody();
    });
  });
  content.appendChild(toolbar);

  const body = document.createElement('div');
  body.id = 'nl-list-body';
  content.appendChild(body);
  renderNewslettersListBody();
}

function renderNewslettersListBody() {
  const body = document.getElementById('nl-list-body');
  if (!body) return;
  const { search, status } = state.newsletterFilter;
  const q = (search || '').trim().toLowerCase();
  const filtered = state.newsletters.filter(n => {
    if (status !== 'all' && n.status !== status) return false;
    if (q) {
      const hay = `${n.title_ar || ''} ${n.title_en || ''} ${n.edition_number || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (!filtered.length) {
    body.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state-icon">🔎</div><div class="empty-state-title">لا توجد نتائج</div><p class="empty-state-text">جرّب تغيير كلمة البحث أو الفلتر.</p>';
    body.appendChild(empty);
    return;
  }

  const rows = filtered.map(n => [
    (() => {
      if (!n.cover_image_url) {
        const ph = document.createElement('span'); ph.className = 'thumb-placeholder'; ph.textContent = 'لا توجد صورة'; return ph;
      }
      const img = document.createElement('img');
      img.src = n.cover_image_url; img.alt = ''; img.className = 'cover-thumb'; img.loading = 'lazy';
      return img;
    })(),
    n.edition_number ?? '—',
    (() => {
      const wrap = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = n.title_ar || n.title_en || '—';
      title.style.fontWeight = '600'; title.style.color = 'var(--text-strong)';
      const sub = document.createElement('div');
      sub.className = 'muted';
      sub.style.fontSize = '12px';
      sub.textContent = n.issue_date ? new Date(n.issue_date).toLocaleDateString('ar-SA') : '';
      wrap.append(title); if (sub.textContent) wrap.append(sub);
      return wrap;
    })(),
    (() => {
      const map = { published: { cls: 'badge-success', txt: 'منشور' }, draft: { cls: 'badge-muted', txt: 'مسودة' }, archived: { cls: 'badge-info', txt: 'مؤرشف' } };
      const cfg = map[n.status] || { cls: 'badge-muted', txt: n.status || '—' };
      const b = document.createElement('span'); b.className = `badge ${cfg.cls}`; b.textContent = cfg.txt; return b;
    })(),
    (() => {
      const wrap = document.createElement('div'); wrap.className = 'table-actions';
      const edit = document.createElement('button'); edit.className = 'btn btn-sm'; edit.textContent = 'تحرير';
      edit.addEventListener('click', () => editNewsletter(n));
      const del = document.createElement('button'); del.className = 'btn btn-sm btn-danger'; del.textContent = 'حذف';
      del.addEventListener('click', () => confirmDeleteNewsletter(n));
      wrap.append(edit, del); return wrap;
    })(),
  ]);
  body.innerHTML = '';
  body.appendChild(renderTable(['الصورة', 'العدد', 'العنوان', 'الحالة', ''], rows));
}

function openCreateNewsletterModal() {
  const categoryOptions = [{ value: '', label: '— بدون تصنيف —' }, ...state.categories.map(c => ({ value: c.id, label: c.name_ar || c.name_en }))];
  return showFormModal({
    title: 'إنشاء عدد جديد',
    submitLabel: 'إنشاء وفتح المحرر',
    wide: true,
    fields: [
      {
        name: 'title',
        type: 'bilingual-text',
        label: 'عنوان النشرة',
        required: true,
        placeholderAr: 'مثال: نشرة شهر أبريل',
        placeholderEn: 'e.g. April Newsletter',
        full: true,
      },
      {
        name: 'edition_number',
        type: 'number',
        label: 'رقم الإصدار',
        placeholder: '12',
        min: 1,
        validate: (v) => (v && !Number.isFinite(Number(v))) ? 'رقم الإصدار يجب أن يكون رقمًا صحيحًا' : null,
      },
      {
        name: 'issue_date',
        type: 'date',
        label: 'تاريخ الإصدار',
        defaultValue: new Date().toISOString().slice(0, 10),
      },
      {
        name: 'category_id',
        type: 'select',
        label: 'التصنيف',
        options: categoryOptions,
        defaultValue: '',
      },
      {
        name: 'reading_time',
        type: 'text',
        label: 'وقت القراءة',
        placeholder: '5 دقائق',
      },
      {
        name: 'has_translation',
        type: 'checkbox',
        checkboxLabel: 'يحتوي على ترجمة إنجليزية',
        defaultValue: false,
        full: true,
      },
      {
        name: 'publish_now',
        type: 'checkbox',
        checkboxLabel: 'نشر فورًا (سيظهر للعامة)',
        defaultValue: false,
        full: true,
      },
    ],
    onSubmit: async (values) => {
      if (!values.title?.ar?.trim()) throw new Error('العنوان العربي مطلوب');
      const payload = {
        title_ar: values.title.ar.trim(),
        title_en: values.has_translation ? (values.title.en?.trim() || null) : null,
        edition_number: values.edition_number ? Number(values.edition_number) : null,
        issue_date: values.issue_date || null,
        category_id: values.category_id || null,
        reading_time: values.reading_time?.trim() || null,
        has_translation: !!values.has_translation,
        status: values.publish_now ? 'published' : 'draft',
      };
      const { data, error } = await supabase.from('newsletters').insert(payload).select().maybeSingle();
      if (error) throw error;
      showToast('تم إنشاء العدد — جاري فتح المحرر…');
      window.location.href = `/admin_cms/editor.html?id=${data.id}`;
      return true;
    },
  });
}

async function confirmDeleteNewsletter(n) {
  const ok = await showConfirm(
    `سيتم حذف العدد "${n.title_ar || n.title_en || ''}" وجميع أقسامه. لا يمكن التراجع عن هذا الإجراء.`,
    'حذف العدد',
    { okLabel: 'حذف نهائي', danger: true }
  );
  if (!ok) return;
  const { error } = await supabase.from('newsletters').delete().eq('id', n.id);
  if (error) return showToast(error.message, 'error');
  showToast('تم حذف العدد');
  loadNewsletters();
}

function editNewsletter(n) { window.location.href = `/admin_cms/editor.html?id=${n.id}`; }

/* ────────────────────────────────────────────────────────────────────────── */
/* NAV WIRING                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */
const navButtons = {
  news:       document.getElementById('nav-news-2'),
  categories: document.getElementById('nav-categories-2'),
  join:       document.getElementById('nav-join-2'),
  audit:      document.getElementById('nav-audit-2'),
};
function setActiveNav(key) {
  Object.entries(navButtons).forEach(([k, btn]) => btn && btn.classList.toggle('active', k === key));
}
navButtons.news      ?.addEventListener('click', () => { setActiveNav('news');       destroyAuditLog(); loadNewsletters(); });
navButtons.categories?.addEventListener('click', () => { setActiveNav('categories'); destroyAuditLog(); loadCategories(); });
navButtons.join      ?.addEventListener('click', () => { setActiveNav('join');       destroyAuditLog(); loadJoinRequests(); });
navButtons.audit     ?.addEventListener('click', () => { setActiveNav('audit');      loadAuditLog(content, pageTitle); });

/* Initial view */
loadNewsletters();

window._admin = { loadCategories, loadJoinRequests, loadNewsletters, uploadFileToBucket, uploadFileWithProgress };
