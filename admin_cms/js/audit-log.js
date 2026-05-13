// admin_cms/js/audit-log.js — audit log viewer.
// Pulls from view `v_audit_dashboard`, supports filter chips, stat cards,
// live realtime stream, and expandable row detail.

import { supabase } from '../supabase-client.js';

let auditData = [];
let auditChannel = null;
let filters = { table: 'all', action: 'all', search: '' };
let containerEl = null;

export async function loadAuditLog(contentArea, pageTitle) {
  containerEl = contentArea;
  const headerActions = document.querySelector('.header-actions, #page-actions');
  if (headerActions) headerActions.innerHTML = '';
  if (pageTitle) pageTitle.textContent = 'سجل التدقيق';

  contentArea.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'audit-panel';

  /* Filters */
  const filtersWrap = document.createElement('div');
  filtersWrap.className = 'audit-filters';
  filtersWrap.innerHTML = `
    <select id="filter-table" class="input">
      <option value="all">كل الجداول</option>
      <option value="categories">categories</option>
      <option value="section_types">section_types</option>
      <option value="newsletters">newsletters</option>
      <option value="newsletter_sections">newsletter_sections</option>
      <option value="newsletter_editors">newsletter_editors</option>
      <option value="section_illumination">section_illumination</option>
      <option value="section_inspiring">section_inspiring</option>
      <option value="section_news_items">section_news_items</option>
      <option value="section_article_items">section_article_items</option>
      <option value="section_podcast">section_podcast</option>
      <option value="join_requests">join_requests</option>
    </select>
    <select id="filter-action" class="input">
      <option value="all">كل الإجراءات</option>
      <option value="INSERT">إضافة (INSERT)</option>
      <option value="UPDATE">تعديل (UPDATE)</option>
      <option value="DELETE">حذف (DELETE)</option>
    </select>
    <input id="filter-search" type="search" class="input" placeholder="بحث بالإيميل…">
    <button id="filter-clear" class="btn">مسح الفلاتر</button>
  `;
  panel.appendChild(filtersWrap);

  /* Stats */
  const statsWrap = document.createElement('div');
  statsWrap.className = 'audit-stats';
  statsWrap.innerHTML = `
    <div class="stat-card stat-primary"><div class="muted">إجمالي المعروض</div><div id="stat-total" class="stat-value">0</div></div>
    <div class="stat-card stat-success"><div class="muted">إضافات اليوم</div><div id="stat-inserts" class="stat-value">0</div></div>
    <div class="stat-card stat-warning"><div class="muted">تعديلات اليوم</div><div id="stat-updates" class="stat-value">0</div></div>
    <div class="stat-card stat-danger"><div class="muted">محذوفات اليوم</div><div id="stat-deletes" class="stat-value">0</div></div>
  `;
  panel.appendChild(statsWrap);

  /* Table container */
  const tableHolder = document.createElement('div');
  tableHolder.id = 'audit-table-container';
  tableHolder.className = 'card';
  tableHolder.style.overflowX = 'auto';
  tableHolder.innerHTML = `<div class="card-body"><p class="muted">جاري تحميل السجل…</p></div>`;
  panel.appendChild(tableHolder);

  contentArea.appendChild(panel);

  /* Wire filters */
  document.getElementById('filter-table').addEventListener('change', (e) => { filters.table = e.target.value; renderTable(); });
  document.getElementById('filter-action').addEventListener('change', (e) => { filters.action = e.target.value; renderTable(); });
  document.getElementById('filter-search').addEventListener('input', (e) => { filters.search = e.target.value; renderTable(); });
  document.getElementById('filter-clear').addEventListener('click', () => {
    document.getElementById('filter-table').value = 'all';
    document.getElementById('filter-action').value = 'all';
    document.getElementById('filter-search').value = '';
    filters = { table: 'all', action: 'all', search: '' };
    renderTable();
  });

  /* Load data */
  try {
    const { data, error } = await supabase
      .from('v_audit_dashboard')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    auditData = data || [];
    renderTable();
    setupRealtime();
  } catch (err) {
    tableHolder.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">تعذر تحميل السجل</div><p class="empty-state-text">${err.message || err}</p></div>`;
  }
}

export function destroyAuditLog() {
  if (auditChannel) { supabase.removeChannel(auditChannel); auditChannel = null; }
}

function actionBadge(action) {
  if (action === 'INSERT') return `<span class="badge badge-success">إضافة</span>`;
  if (action === 'UPDATE') return `<span class="badge badge-warning">تعديل</span>`;
  if (action === 'DELETE') return `<span class="badge badge-danger">حذف</span>`;
  return `<span class="badge badge-muted">${action || '—'}</span>`;
}

function renderTable() {
  const holder = document.getElementById('audit-table-container');
  if (!holder) return;

  const filtered = auditData.filter(row => {
    if (filters.table !== 'all' && row.table_name !== filters.table) return false;
    if (filters.action !== 'all' && row.action !== filters.action) return false;
    if (filters.search) {
      const a = (row.actor || row.user_email || '').toLowerCase();
      if (!a.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  });

  const today = new Date().toDateString();
  let i = 0, u = 0, d = 0;
  filtered.forEach(r => {
    if (new Date(r.created_at).toDateString() !== today) return;
    if (r.action === 'INSERT') i++;
    else if (r.action === 'UPDATE') u++;
    else if (r.action === 'DELETE') d++;
  });
  document.getElementById('stat-total').textContent   = filtered.length;
  document.getElementById('stat-inserts').textContent = i;
  document.getElementById('stat-updates').textContent = u;
  document.getElementById('stat-deletes').textContent = d;

  if (!filtered.length) {
    holder.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">لا توجد سجلات مطابقة</div><p class="empty-state-text">جرّب تغيير الفلاتر أو إزالتها.</p></div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'data-table data-table-responsive';
  table.innerHTML = `
    <thead>
      <tr>
        <th>الوقت</th>
        <th>الجدول</th>
        <th>الإجراء</th>
        <th>المستخدم</th>
        <th>المعرف</th>
        <th>الحقول المعدلة</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (row._isNew) {
      tr.classList.add('audit-row--new');
      setTimeout(() => tr.classList.remove('audit-row--new'), 3000);
      delete row._isNew;
    }
    const timeStr = new Date(row.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'medium' });
    const actor = row.actor || row.user_email || 'نظام';
    const changed = row.changed_fields ? row.changed_fields.join('، ') : '—';
    const shortChanged = changed.length > 40 ? changed.slice(0, 40) + '…' : changed;
    const shortId = row.record_id ? row.record_id.slice(0, 8) + (row.record_id.length > 8 ? '…' : '') : '—';

    tr.innerHTML = `
      <td data-label="الوقت" style="white-space:nowrap; font-size:13px; direction:ltr;">${timeStr}</td>
      <td data-label="الجدول"><code style="font-size:13px;">${row.table_name}</code></td>
      <td data-label="الإجراء">${actionBadge(row.action)}</td>
      <td data-label="المستخدم">${actor}</td>
      <td data-label="المعرف"><code style="font-size:13px;" title="${row.record_id || ''}">${shortId}</code></td>
      <td data-label="الحقول" title="${changed}">${shortChanged}</td>
    `;
    tbody.appendChild(tr);

    /* Detail row */
    const detailTr = document.createElement('tr');
    detailTr.style.display = 'none';
    const detailTd = document.createElement('td');
    detailTd.colSpan = 6;
    detailTd.style.background = 'var(--surface-2)';
    detailTd.appendChild(buildDetail(row));
    detailTr.appendChild(detailTd);
    tbody.appendChild(detailTr);

    tr.addEventListener('click', () => {
      const isOpen = detailTr.style.display !== 'none';
      tbody.querySelectorAll('tr').forEach((r, idx) => { if (idx % 2 === 1) r.style.display = 'none'; });
      if (!isOpen) detailTr.style.display = '';
    });
  });

  holder.innerHTML = '';
  holder.appendChild(table);
}

function buildDetail(row) {
  const wrap = document.createElement('div');
  wrap.style.padding = '12px';
  if (row.action === 'UPDATE' && row.diff) {
    const t = document.createElement('table');
    t.className = 'audit-detail';
    t.innerHTML = '<thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead>';
    const tb = document.createElement('tbody');
    for (const [k, v] of Object.entries(row.diff)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="k">${k}</td>
                      <td class="diff-old">${escapeJson(v.before ?? v.old)}</td>
                      <td class="diff-new">${escapeJson(v.after  ?? v.new)}</td>`;
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    wrap.appendChild(t);
    return wrap;
  }
  const payload = row.action === 'DELETE' ? row.old_data : row.new_data;
  if (!payload) {
    wrap.innerHTML = '<p class="muted">لا توجد تفاصيل إضافية</p>';
    return wrap;
  }
  const t = document.createElement('table');
  t.className = 'audit-detail';
  t.innerHTML = '<thead><tr><th>الحقل</th><th>القيمة</th></tr></thead>';
  const tb = document.createElement('tbody');
  for (const [k, v] of Object.entries(payload)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="k">${k}</td><td>${escapeJson(v)}</td>`;
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  wrap.appendChild(t);
  return wrap;
}

function escapeJson(v) {
  const s = JSON.stringify(v);
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setupRealtime() {
  if (auditChannel) return;
  auditChannel = supabase
    .channel('audit-log-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
      const r = payload.new;
      const mapped = { ...r, actor: r.user_email || 'نظام', _isNew: true };
      if (mapped.action === 'UPDATE' && mapped.changed_fields) {
        mapped.diff = {};
        mapped.changed_fields.forEach(f => {
          mapped.diff[f] = { before: mapped.old_data?.[f] ?? null, after: mapped.new_data?.[f] ?? null };
        });
      }
      auditData.unshift(mapped);
      if (auditData.length > 200) auditData.pop();
      renderTable();
    })
    .subscribe();
}
