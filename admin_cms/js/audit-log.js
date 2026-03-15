import { supabase } from '../supabase-client.js';

let auditData = [];
let auditChannel = null;
let currentFilters = { table: 'all', action: 'all', search: '' };
let containerEl = null;

export async function loadAuditLog(contentArea, pageTitle) {
  containerEl = contentArea;

  const headerActions = document.querySelector('.header-actions');
  if(headerActions) headerActions.innerHTML = '';
  
  if (pageTitle) pageTitle.textContent = 'سجل التدقيق';
  
  contentArea.innerHTML = `
    <div class="audit-panel">
      <div class="audit-filters" style="display:flex; gap:10px; margin-bottom:16px; flex-wrap:wrap;">
        <select id="filter-table" class="input" style="flex:1; min-width:140px;">
          <option value="all">كل الجداول</option>
          <option value="categories">categories</option>
          <option value="section_types">section_types</option>
          <option value="newsletters">newsletters</option>
          <option value="newsletter_sections">newsletter_sections</option>
          <option value="section_illumination">section_illumination</option>
          <option value="section_inspiring">section_inspiring</option>
          <option value="section_news_items">section_news_items</option>
          <option value="section_article_items">section_article_items</option>
          <option value="section_podcast">section_podcast</option>
          <option value="section_translation">section_translation</option>
          <option value="join_requests">join_requests</option>
        </select>
        <select id="filter-action" class="input" style="flex:1; min-width:140px;">
          <option value="all">كل الإجراءات</option>
          <option value="INSERT">إضافة (INSERT)</option>
          <option value="UPDATE">تعديل (UPDATE)</option>
          <option value="DELETE">حذف (DELETE)</option>
        </select>
        <input id="filter-search" type="text" class="input" placeholder="بحث بالإيميل..." style="flex:2; min-width:200px;">
        <button id="filter-clear" class="btn">مسح الفلاتر</button>
      </div>
      
      <div class="audit-stats" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:16px;">
        <div class="stat-card" style="background:var(--card-bg); padding:16px; border-radius:8px; border:1px solid var(--border-color); text-align:center;">
          <div class="muted">إجمالي المعروض</div>
          <div id="stat-total" style="font-size:24px; font-weight:bold; color:var(--primary-color);">0</div>
        </div>
        <div class="stat-card" style="background:var(--card-bg); padding:16px; border-radius:8px; border:1px solid var(--border-color); text-align:center;">
          <div class="muted">إضافات اليوم</div>
          <div id="stat-inserts" style="font-size:24px; font-weight:bold; color:#0ea860;">0</div>
        </div>
        <div class="stat-card" style="background:var(--card-bg); padding:16px; border-radius:8px; border:1px solid var(--border-color); text-align:center;">
          <div class="muted">تعديلات اليوم</div>
          <div id="stat-updates" style="font-size:24px; font-weight:bold; color:#eab308;">0</div>
        </div>
        <div class="stat-card" style="background:var(--card-bg); padding:16px; border-radius:8px; border:1px solid var(--border-color); text-align:center;">
          <div class="muted">محذوفات اليوم</div>
          <div id="stat-deletes" style="font-size:24px; font-weight:bold; color:#dc2626;">0</div>
        </div>
      </div>
      
      <div id="audit-table-container" style="overflow-x:auto;">
        <p class="muted">جاري تحميل سجل التدقيق...</p>
      </div>
    </div>
  `;
  
  // Bind filters
  document.getElementById('filter-table').addEventListener('change', (e) => { currentFilters.table = e.target.value; renderTable(); });
  document.getElementById('filter-action').addEventListener('change', (e) => { currentFilters.action = e.target.value; renderTable(); });
  document.getElementById('filter-search').addEventListener('input', (e) => { currentFilters.search = e.target.value; renderTable(); });
  document.getElementById('filter-clear').addEventListener('click', () => {
    document.getElementById('filter-table').value = 'all';
    document.getElementById('filter-action').value = 'all';
    document.getElementById('filter-search').value = '';
    currentFilters = { table: 'all', action: 'all', search: '' };
    renderTable();
  });
  
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
    document.getElementById('audit-table-container').innerHTML = `<div class="ui-error" style="padding:12px; border-radius:8px; color:#fff;">حدث خطأ أثناء تحميل السجل: ${err.message}</div>`;
  }
}

export function destroyAuditLog() {
  if (auditChannel) {
    supabase.removeChannel(auditChannel);
    auditChannel = null;
  }
}

function renderTable() {
  if (!containerEl || !document.getElementById('audit-table-container')) return;
  
  const filtered = auditData.filter(row => {
    if (currentFilters.table !== 'all' && row.table_name !== currentFilters.table) return false;
    if (currentFilters.action !== 'all' && row.action !== currentFilters.action) return false;
    if (currentFilters.search) {
      const actor = row.actor || row.user_email || '';
      if (!actor.toLowerCase().includes(currentFilters.search.toLowerCase())) return false;
    }
    return true;
  });
  
  // Stats
  const todayStr = new Date().toDateString();
  let inserts = 0, updates = 0, deletes = 0, total = filtered.length;
  
  filtered.forEach(row => {
    const isToday = new Date(row.created_at).toDateString() === todayStr;
    if (isToday) {
      if (row.action === 'INSERT') inserts++;
      if (row.action === 'UPDATE') updates++;
      if (row.action === 'DELETE') deletes++;
    }
  });
  
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-inserts').textContent = inserts;
  document.getElementById('stat-updates').textContent = updates;
  document.getElementById('stat-deletes').textContent = deletes;
  
  if (filtered.length === 0) {
    document.getElementById('audit-table-container').innerHTML = '<p class="muted">لا توجد سجلات تطابق الفرز الحالي.</p>';
    return;
  }
  
  const table = document.createElement('table');
  table.className = 'table audit-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="min-width:90px;">الوقت</th>
        <th>الجدول</th>
        <th>الإجراء</th>
        <th>المستخدم</th>
        <th>معرف السجل</th>
        <th>الحقول المعدلة</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  
  const tbody = table.querySelector('tbody');
  
  filtered.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    if (row._isNew) {
      tr.className = 'audit-row--new';
      setTimeout(() => { tr.classList.remove('audit-row--new'); }, 3000);
      delete row._isNew;
    }
    
    const timeStr = new Date(row.created_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'medium' });
    const actor = row.actor || row.user_email || 'نظام (System)';
    
    let actionBadge = '';
    if (row.action === 'INSERT') actionBadge = '<span style="color:#0ea860; font-weight:bold; background:#e6fcf4; padding:2px 6px; border-radius:4px;">إضافة</span>';
    else if (row.action === 'UPDATE') actionBadge = '<span style="color:#eab308; font-weight:bold; background:#fef9c3; padding:2px 6px; border-radius:4px;">تعديل</span>';
    else if (row.action === 'DELETE') actionBadge = '<span style="color:#dc2626; font-weight:bold; background:#fef2f2; padding:2px 6px; border-radius:4px;">حذف</span>';
    
    let changedFields = row.changed_fields ? row.changed_fields.join(', ') : '-';
    if (changedFields.length > 30) changedFields = changedFields.substring(0, 30) + '...';
    
    tr.innerHTML = `
      <td style="white-space:nowrap; font-size:0.9em; direction:ltr; text-align:right;">${timeStr}</td>
      <td><code>${row.table_name}</code></td>
      <td>${actionBadge}</td>
      <td>${actor}</td>
      <td><code title="${row.record_id}">${(row.record_id || '').substring(0,8)}${row.record_id?.length>8?'...':''}</code></td>
      <td style="font-size:0.85em; max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${row.changed_fields ? row.changed_fields.join(', ') : ''}">${changedFields}</td>
    `;
    
    tbody.appendChild(tr);
    
    const detailTr = document.createElement('tr');
    detailTr.style.display = 'none';
    detailTr.style.backgroundColor = '#f8fafc';
    
    let detailHtml = '';
    if (row.action === 'UPDATE' && row.diff) {
      detailHtml = '<table style="width:100%; font-size:0.9em; background:#fff; margin:8px 0; border:1px solid #e2e8f0; border-collapse:collapse;"><tr><th style="padding:4px 8px; border:1px solid #e2e8f0; text-align:right;">الحقل</th><th style="padding:4px 8px; border:1px solid #e2e8f0; text-align:right;">القديم ➔ الجديد</th></tr>';
      for (const [k, v] of Object.entries(row.diff)) {
        detailHtml += `<tr><td style="padding:4px 8px; border:1px solid #e2e8f0; font-family:monospace;">${k}</td><td style="padding:4px 8px; border:1px solid #e2e8f0; font-family:monospace; color:#475569;"><span style="color:#dc2626;">${JSON.stringify(v.old)}</span> ➔ <span style="color:#0ea860;">${JSON.stringify(v.new)}</span></td></tr>`;
      }
      detailHtml += '</table>';
    } else {
      const payload = row.action === 'DELETE' ? row.old_data : row.new_data;
      if (payload) {
        detailHtml = '<table style="width:100%; font-size:0.9em; background:#fff; margin:8px 0; border:1px solid #e2e8f0; border-collapse:collapse;"><tr><th style="padding:4px 8px; border:1px solid #e2e8f0; text-align:right;">الحقل</th><th style="padding:4px 8px; border:1px solid #e2e8f0; text-align:right;">القيمة</th></tr>';
        for (const [k, v] of Object.entries(payload)) {
          detailHtml += `<tr><td style="padding:4px 8px; border:1px solid #e2e8f0; font-family:monospace;">${k}</td><td style="padding:4px 8px; border:1px solid #e2e8f0; font-family:monospace;">${JSON.stringify(v)}</td></tr>`;
        }
        detailHtml += '</table>';
      } else {
        detailHtml = '<p class="muted" style="margin:8px 0;">لا توجد تفاصيل إضافية</p>';
      }
    }
    
    detailTr.innerHTML = `<td colspan="6" style="padding:0 12px; border-bottom:2px solid #e2e8f0;">${detailHtml}</td>`;
    tbody.appendChild(detailTr);
    
    tr.addEventListener('click', () => {
      const isVisible = detailTr.style.display !== 'none';
      table.querySelectorAll('tr:nth-child(even)').forEach(r => r.style.display = 'none');
      if (!isVisible) detailTr.style.display = '';
    });
  });
  
  const container = document.getElementById('audit-table-container');
  container.innerHTML = '';
  container.appendChild(table);
}

function setupRealtime() {
  if (auditChannel) return;
  
  auditChannel = supabase
    .channel('audit-log-realtime')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'audit_logs'
    }, (payload) => {
      const newRow = payload.new;
      const mappedRow = {
        ...newRow,
        actor: newRow.user_email || 'نظام (System)',
        _isNew: true
      };
      
      if (mappedRow.action === 'UPDATE' && mappedRow.changed_fields) {
        mappedRow.diff = {};
        mappedRow.changed_fields.forEach(f => {
          mappedRow.diff[f] = {
            old: mappedRow.old_data ? mappedRow.old_data[f] : null,
            new: mappedRow.new_data ? mappedRow.new_data[f] : null
          };
        });
      }
      
      auditData.unshift(mappedRow);
      if (auditData.length > 200) auditData.pop();
      renderTable();
    })
    .subscribe();
}
