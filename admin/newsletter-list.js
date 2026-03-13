// admin/newsletter-list.js

document.addEventListener('DOMContentLoaded', async () => {
  try { await (await import('/admin/js/admin-auth.js')).requireAdminAuth(); } catch(e) { return; }

  const tbody = document.getElementById('nl-tbody');

  let newsletters;
  try {
    newsletters = await window.newsletterData.fetchNewsletterList();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-cell">فشل التحميل: ${err.message}</td></tr>`;
    return;
  }

  if (!newsletters.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">لا توجد نشرات بعد.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  const statusAr = { draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };

  newsletters.forEach(nl => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nl.edition_number ?? '—'}</td>
      <td>${(nl.title_ar||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>
      <td>${nl.issue_date ? new Date(nl.issue_date).toLocaleDateString('ar-SA') : '—'}</td>
      <td><span class="badge badge-${nl.status}">${statusAr[nl.status] ?? nl.status}</span></td>
      <td class="actions">
        <a href="newsletter-editor.html?id=${nl.id}" class="btn btn-sm">تعديل</a>
        <button class="btn btn-sm btn-danger" data-id="${nl.id}">حذف</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.addEventListener('click', async e => {
    const deleteBtn = e.target.closest('[data-id]');
    if (!deleteBtn) return;
    if (!confirm('سيتم حذف هذه النشرة وكل محتواها نهائياً. هل أنت متأكد؟')) return;

    const id = deleteBtn.dataset.id;
    deleteBtn.disabled = true;

    const { error } = await window.supabase.from('newsletters').delete().eq('id', id);
    if (error) {
      showToast('فشل الحذف: ' + error.message, 'error');
      deleteBtn.disabled = false;
    } else {
      deleteBtn.closest('tr').remove();
    }
  });
});

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  setTimeout(() => t.classList.add('hidden'), 3500);
}
