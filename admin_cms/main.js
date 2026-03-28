// admin_cms/main.js — Full CRUD handlers (categories, join_requests, newsletters) + uploads
import { initSupabase, uploadFileWithProgress, uploadFileToBucket } from './supabase-client.js';
import { showToast, showConfirm, showPrompt, showMessage } from './ui.js';
import { loadAuditLog, destroyAuditLog } from './js/audit-log.js';

await initSupabase();
const supabase = window.supabase;

// Basic auth guard — redirect to login if not authenticated
async function ensureAuth() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    window.location.href = '/admin_cms/';
    throw new Error('Not authenticated');
  }
  return data.session;
}

await ensureAuth();

// DOM refs
const content = document.getElementById('content-area');
const pageTitle = document.getElementById('page-title');

// Simple dashboard progress UI helper
function showProgress(message = ''){
  let wrap = document.getElementById('dashboard-progress');
  if (!wrap){
    wrap = document.createElement('div'); wrap.id = 'dashboard-progress';
    wrap.style.position = 'relative'; wrap.style.width = '100%'; wrap.style.marginBottom = '8px';
    const bar = document.createElement('div'); bar.id = 'dashboard-progress-bar'; bar.style.height = '6px'; bar.style.background = 'var(--border-color)'; bar.style.borderRadius = '6px'; bar.style.overflow = 'hidden';
    const fill = document.createElement('div'); fill.id = 'dashboard-progress-fill'; fill.style.width = '0%'; fill.style.height = '100%'; fill.style.background = 'var(--primary-color)'; fill.style.transition = 'width 200ms';
    bar.appendChild(fill);
    const label = document.createElement('div'); label.id = 'dashboard-progress-label'; label.style.fontSize = '13px'; label.style.marginTop = '6px'; label.style.color = 'var(--secondary-color)';
    wrap.appendChild(bar); wrap.appendChild(label);
    content.prepend(wrap);
  }
  const label = document.getElementById('dashboard-progress-label'); const fill = document.getElementById('dashboard-progress-fill');
  if (label) label.textContent = message || '';
  return {
    set: (v)=>{ if (fill) fill.style.width = `${Math.max(0,Math.min(1,v))*100}%`; },
    done: ()=>{ const el = document.getElementById('dashboard-progress'); if (el) el.remove(); }
  };
}

// Navigation wiring (single sidebar now)
const navButtons = {
  news: document.getElementById('nav-news-2'),
  categories: document.getElementById('nav-categories-2'),
  join: document.getElementById('nav-join-2'),
  audit: document.getElementById('nav-audit-2')
};

function setActiveNav(activeKey) {
  Object.values(navButtons).forEach(btn => {
    if(btn) btn.classList.remove('active');
  });
  if(navButtons[activeKey]) navButtons[activeKey].classList.add('active');
}

if(navButtons.news) navButtons.news.addEventListener('click', () => { setActiveNav('news'); destroyAuditLog(); loadNewsletters(); });
if(navButtons.categories) navButtons.categories.addEventListener('click', () => { setActiveNav('categories'); destroyAuditLog(); loadCategories(); });
if(navButtons.join) navButtons.join.addEventListener('click', () => { setActiveNav('join'); destroyAuditLog(); loadJoinRequests(); });
if(navButtons.audit) navButtons.audit.addEventListener('click', () => { setActiveNav('audit'); loadAuditLog(content, pageTitle); });

// Generic table renderer
function renderTable(columns, rows) {
  const t = document.createElement('table');
  t.className = 'table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach(c => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  thead.appendChild(trh);
  t.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach(cell => {
      const td = document.createElement('td');
      if (cell instanceof Node) td.appendChild(cell); else td.textContent = (cell === null || cell === undefined) ? '' : cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  return t;
}

// ---------------- CATEGORIES ----------------
async function loadCategories() {
  pageTitle.textContent = 'التصنيفات';
  content.innerHTML = '<p class="muted">جاري التحميل…</p>';
  const prog = showProgress('جاري جلب التصنيفات…'); prog.set(0.15);
  try {
    const { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
    const { data: newsletters, error: newslettersError } = await supabase
      .from('newsletters')
      .select('category_id');
    prog.set(0.8);
    if (error) throw error;
    if (newslettersError) throw newslettersError;
    const usageByCategoryId = (newsletters || []).reduce((acc, row) => {
      if (!row?.category_id) return acc;
      acc[row.category_id] = (acc[row.category_id] || 0) + 1;
      return acc;
    }, {});
    const rows = (data || []).map(cat => [
      cat.name_ar || cat.name_en || '',
      usageByCategoryId[cat.id] || 0,
      new Date(cat.created_at).toLocaleString(),
      (() => {
        const edit = document.createElement('button'); edit.className = 'btn'; edit.textContent = 'تحرير'; edit.addEventListener('click', () => editCategory(cat));
        const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'حذف'; del.addEventListener('click', async () => {
          const ok = await showConfirm('حذف التصنيف؟'); if (!ok) return;
          // before deleting, unset category_id for newsletters that use it
          const { error: clearErr } = await supabase.from('newsletters').update({ category_id: null }).eq('category_id', cat.id);
          if (clearErr) return showToast(clearErr.message,'error');
          const { error } = await supabase.from('categories').delete().eq('id', cat.id);
          if (error) return showToast(error.message,'error');
          loadCategories();
        });
        const wrap = document.createElement('div'); 
        wrap.style.display = 'flex'; 
        wrap.style.gap = '8px'; 
        wrap.style.justifyContent = 'center';
        wrap.append(edit, del); 
        return wrap;
      })()
    ]);
    content.innerHTML = '';
    const headerActions = document.querySelector('.header-actions');
    if(headerActions) {
      headerActions.innerHTML = '';
      const add = document.createElement('button'); add.className = 'btn btn-primary'; add.textContent = 'إضافة تصنيف'; add.addEventListener('click', () => addCategory());
      headerActions.appendChild(add);
    }
    content.append(renderTable(['اسم التصنيف', 'عدد الاستخدام', 'أنشئ في', 'إجراءات'], rows));
    prog.done();
  } catch (e) {
    content.innerHTML = `<p class="muted">${e.message || e}</p>`;
    showToast(e.message||e,'error');
    try{ document.getElementById('dashboard-progress')?.remove(); }catch(_){}
  }
}

async function addCategory() {
  const name = await showPrompt('اسم التصنيف (عربي)');
  if (!name) return;
  const { error } = await supabase.from('categories').insert({ name_ar: name, name_en: name });
  if (error) return showToast(error.message,'error');
  loadCategories();
}

async function editCategory(cat) {
  const name = await showPrompt('تعديل اسم التصنيف', cat.name_ar || cat.name_en || '');
  if (!name) return;
  const { error } = await supabase.from('categories').update({ name_ar: name, name_en: name }).eq('id', cat.id);
  if (error) return showToast(error.message,'error');
  loadCategories();
}

// ---------------- JOIN REQUESTS ----------------
async function loadJoinRequests() {
  pageTitle.textContent = 'طلبات الانضمام';
  content.innerHTML = '<p class="muted">جاري التحميل…</p>';
  const prog = showProgress('جاري جلب طلبات الانضمام…'); prog.set(0.15);
  try {
    const { data, error } = await supabase.from('join_requests').select('*').order('created_at', { ascending: false });
    prog.set(0.8);
    if (error) throw error;
    const rows = (data || []).map(r => [
      r.name || '-',
      r.email || '-',
      r.committee || '-',
      new Date(r.created_at).toLocaleString(),
      (() => {
        const view = document.createElement('button'); view.className='btn'; view.textContent='عرض'; view.addEventListener('click', () => {
          const d = JSON.stringify(r, null, 2);
          showMessage(d, 'تفاصيل طلب الانضمام');
        });
        // Only allow viewing join requests from the admin UI — do not expose a delete action here.
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.gap = '8px';
        wrap.style.justifyContent = 'center';
        wrap.append(view);
        return wrap;
      })()
    ]);
    content.innerHTML = '';
    const headerActions = document.querySelector('.header-actions');
    if(headerActions) headerActions.innerHTML = ''; // Clear actions for join requests
    
    content.append(renderTable(['الاسم', 'الإيميل', 'اللجنة', 'تاريخ', 'إجراءات'], rows));
    prog.done();
  } catch (e) {
    content.innerHTML = `<p class="muted">${e.message || e}</p>`;
    showToast(e.message||e,'error');
    try{ document.getElementById('dashboard-progress')?.remove(); }catch(_){}
  }
}

// ---------------- NEWSLETTERS ----------------
async function loadNewsletters() {
  pageTitle.textContent = 'الأعداد';
  content.innerHTML = '<p class="muted">جاري التحميل…</p>';
  const prog = showProgress('جاري جلب الأعداد…'); prog.set(0.15);
  try {
    const { data, error } = await supabase.from('newsletters').select('*').order('created_at', { ascending: false });
    prog.set(0.7);
    if (error) throw error;
    const rows = (data || []).map(n => [
      (() => {
        if (!n.cover_image_url) {
          const span = document.createElement('span');
          span.className = 'muted';
          span.textContent = 'لا توجد صورة';
          return span;
        }
        const img = document.createElement('img');
        img.src = n.cover_image_url;
        img.alt = 'cover';
        img.className = 'cover-thumb';
        img.loading = 'lazy';
        return img;
      })(),
      n.edition_number || '-',
      n.title_ar || n.title_en || n.title || '-',
      n.status || '-',
      (() => {
        const edit = document.createElement('button'); edit.className = 'btn'; edit.textContent = 'تحرير'; edit.addEventListener('click', () => editNewsletter(n));
        const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'حذف'; del.addEventListener('click', async () => {
          const ok = await showConfirm('حذف العدد؟'); if (!ok) return;
          const p = showProgress('جاري حذف العدد…'); p.set(0.2);
          const { error } = await supabase.from('newsletters').delete().eq('id', n.id);
          if (error) { p.done(); return showToast(error.message,'error'); }
          p.set(1); p.done();
          loadNewsletters();
        });
        const wrap = document.createElement('div'); 
        wrap.style.display = 'flex'; 
        wrap.style.gap = '8px'; 
        wrap.style.justifyContent = 'center';
        wrap.append(edit, del); 
        return wrap;
      })()
    ]);
    content.innerHTML = '';
    const headerActions = document.querySelector('.header-actions');
    if(headerActions) {
      headerActions.innerHTML = '';
      const add = document.createElement('button'); add.className = 'btn btn-primary'; add.textContent = 'إنشاء عدد جديد'; add.addEventListener('click', () => createNewsletter());
      headerActions.appendChild(add);
    }
    content.append(renderTable(['الصورة', 'العدد', 'العنوان', 'الحالة', 'إجراءات'], rows));
    prog.done();
  } catch (e) {
    content.innerHTML = `<p class="muted">${e.message || e}</p>`;
    showToast(e.message||e,'error');
    try{ document.getElementById('dashboard-progress')?.remove(); }catch(_){}
  }
}

async function createNewsletter() {
  // gather minimal metadata via prompt (simple flow) — for a full editor, we'll expand later
  const title = await showPrompt('عنوان النشرة (عربي)');
  if (!title) return;
  const edition = await showPrompt('رقم الإصدار (رقم)') || null;
  const date = await showPrompt('تاريخ الإصدار (YYYY-MM-DD)') || null;
  const status = (await showConfirm('اجعلها منشورة الآن؟')) ? 'published' : 'draft';
  const editionNumber = edition ? Number(edition) : null;
  if (edition && Number.isNaN(editionNumber)) {
    return showToast('رقم الإصدار يجب أن يكون رقمًا صحيحًا', 'error');
  }
  try {
    const p = showProgress('جاري إنشاء النشرة…'); p.set(0.25);
    const payload = {
      title_ar: title.trim(),
      edition_number: editionNumber,
      issue_date: date || null,
      status
    };
    const { data, error } = await supabase.from('newsletters').insert(payload).select().maybeSingle();
    if (error) throw error;
    p.set(1); p.done();
    // redirect to editor
    window.location.href = `/admin_cms/editor.html?id=${data.id}`;
  } catch (e) {
    showToast(e.message || e, 'error');
    try{ document.getElementById('dashboard-progress')?.remove(); }catch(_){}
  }
}

function editNewsletter(n) {
  // open full editor page
  window.location.href = `/admin_cms/editor.html?id=${n.id}`;
}

// initial view
loadNewsletters();

// Expose functions for debugging in console
window._admin = { loadCategories, loadJoinRequests, loadNewsletters, uploadFileToBucket, uploadFileWithProgress };
