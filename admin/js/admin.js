import { supabase, youtubeThumbnailFromUrl } from './supabaseClient.js';
import './animate-auto-attach.js';

const root = document.getElementById('admin-app');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

// Animation helper: add an animation class and remove it after animation ends (unless keep=true)
function animateMount(node, cls = 'admin-animate', keep = false) {
  if (!node) return;
  node.classList.add(cls);
  function cleanup() {
    if (!keep) node.classList.remove(cls);
    node.removeEventListener('animationend', cleanup);
  }
  node.addEventListener('animationend', cleanup);
}

function loginForm() {
  const card = el('div', 'newsletter-card auth-card');
  // logo + title
  const top = el('div', 'auth-top');
  const logoWrap = el('div', 'header-logo-main');
  const logo = document.createElement('img');
  logo.src = '/assets/img/شعار نشرة الحاسوبي باللون الازرق.png';
  logo.alt = 'شعار نشرة الحاسوبي';
  logo.style.height = '72px';
  logoWrap.appendChild(logo);
  top.appendChild(logoWrap);
  top.appendChild(el('h2', '', 'إدارة محتوى نشرة الحاسوبي'));

  const form = el('form', 'auth-form');
  form.addEventListener('submit', (e) => { e.preventDefault(); });

  const grp1 = el('div', 'form-group');
  const emailLabel = el('label', '', 'البريد الإلكتروني');
  const email = document.createElement('input'); email.placeholder = 'you@example.com'; email.type = 'email'; email.className = 'input';
  grp1.append(emailLabel, email);

  const grp2 = el('div', 'form-group');
  const passLabel = el('label', '', 'كلمة المرور');
  const pass = document.createElement('input'); pass.placeholder = '••••••••'; pass.type = 'password'; pass.className = 'input';
  grp2.append(passLabel, pass);

  const actions = el('div', 'auth-actions');
  const btn = el('button', 'submit-button', 'تسجيل الدخول');
  btn.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: pass.value });
    if (error) return showToast(error.message, 'error');
    renderDashboard();
  });
  actions.appendChild(btn);

  form.append(grp1, grp2, actions);
  card.append(top, form);
  animateMount(card);
  return card;
}

async function requireAuth() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function newsItemInputs(items = []) {
  const wrap = el('div', 'news-items');
  function addItem(value = { news_text: '', sources: [] }) {
    const row = el('div', 'news-row');
    const t = document.createElement('input'); t.placeholder = 'نص الخبر'; t.value = value.news_text || '';
    const s = document.createElement('input'); s.placeholder = 'المصادر (افصل بفواصل)'; s.value = (value.sources || []).join(',');
    const rem = el('button', '', 'إزالة');
    rem.addEventListener('click', () => row.remove());
    row.append(t, s, rem);
    wrap.appendChild(row);
  }
  const addBtn = el('button', '', 'إضافة عنصر خبر');
  addBtn.addEventListener('click', () => addItem());
  wrap.appendChild(addBtn);
  (items || []).forEach(it => addItem(it));
  return wrap;
}

async function renderDashboard() {
  root.innerHTML = '';
  const session = await requireAuth();
  if (!session) {
    root.appendChild(loginForm());
    return;
  }
  // build admin dashboard layout using semantic classes
  const wrapper = document.createElement('div');
  wrapper.className = 'admin-wrapper';
  const layout = document.createElement('div');
  layout.className = 'admin-layout';
  wrapper.appendChild(layout);
  root.appendChild(wrapper);
  animateMount(wrapper);

  // sidebar (right)
  const sidebar = document.createElement('aside');
  sidebar.className = 'admin-sidebar';

  // logo area
  const logoArea = document.createElement('div');
  logoArea.className = 'logo-area';
  const logoImg = document.createElement('img'); logoImg.src = '/assets/img/شعار نشرة الحاسوبي باللون الازرق.png'; logoImg.alt='logo'; logoImg.className='logo-img';
  logoArea.appendChild(logoImg);
  sidebar.appendChild(logoArea);
  animateMount(sidebar);

  // top view buttons (newsletters / subscribers)
  const viewNav = document.createElement('div'); viewNav.className = 'view-nav';
  const newsViewBtn = document.createElement('button'); newsViewBtn.className = 'btn btn-primary full'; newsViewBtn.textContent = 'الأعداد';
  const catsViewBtn = document.createElement('button'); catsViewBtn.className = 'btn btn-secondary full'; catsViewBtn.textContent = 'التصنيفات';
  const subsViewBtn = document.createElement('button'); subsViewBtn.className = 'btn btn-secondary full'; subsViewBtn.textContent = 'المشتركين';
  viewNav.append(newsViewBtn, catsViewBtn, subsViewBtn);
  sidebar.appendChild(viewNav);

  // categories: try to load from `categories` table in Supabase; fall back to built-in list
  const nav = document.createElement('nav'); nav.className='nav-list';
  let activeCategory = 'all';
  // cache categories locally for reuse
  let categoriesCache = [];
  let currentSection = 'newsletters';
  async function loadCategories(){
    nav.innerHTML = '';
    // default "all" entry
    const allBtn = document.createElement('button');
    allBtn.className = 'btn btn-primary full';
    allBtn.textContent = 'جميع النشرات';
    allBtn.addEventListener('click', ()=>{ activeCategory='all'; Array.from(nav.children).forEach(ch=>ch.className='btn btn-secondary full'); allBtn.className='btn btn-primary full'; titleEl.textContent='إدارة النشرات'; renderTable(); });
    nav.appendChild(allBtn);

    try {
      const { data: catsData, error } = await supabase.from('categories').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      categoriesCache = (catsData || []);
      // compute usage counts
      const newsRes = await supabase.from('newsletters').select('id,category_id');
      const counts = {};
      (newsRes.data || []).forEach(n=>{ if (n.category_id) counts[n.category_id] = (counts[n.category_id]||0) + 1; });
      if (categoriesCache && categoriesCache.length) {
        categoriesCache.forEach(cat => {
          const b = document.createElement('button');
          b.className = 'btn btn-secondary full';
          b.innerHTML = `<span>${cat.label}</span> <span class='small muted'>(${counts[cat.id]||0})</span>`;
          b.dataset.catId = cat.id;
          b.addEventListener('click', ()=>{
            activeCategory = cat.id; // filter by category_id
            Array.from(nav.children).forEach(ch=>ch.className='btn btn-secondary full');
            b.className = 'btn btn-primary full';
            titleEl.textContent = `إدارة النشرات — ${cat.label}`;
            renderTable();
          });
          nav.appendChild(b);
        });
      }
    } catch (e) {
      // fallback static categories if table missing or error
      const fallback = [ 'علم البيانات','الذكاء الاصطناعي','الامن السيبراني','هندسة الحاسب','هندسة البرمجيات','المجتمع التقني','الحوسبة' ];
      fallback.forEach(lbl=>{
      const b = document.createElement('button');
      b.className = 'btn btn-secondary full';
        b.textContent = lbl;
        b.addEventListener('click', ()=>{
          activeCategory = lbl;
            Array.from(nav.children).forEach(ch=>ch.className='btn btn-secondary full');
            b.className = 'btn btn-primary full';
          titleEl.textContent = `إدارة النشرات — ${lbl}`;
          renderTable();
        });
        nav.appendChild(b);
      });
    }
  }
  // do not append categories navigation to the sidebar — hide categories entirely
  // sidebar.appendChild(nav);

  // switch view helper
  function setActiveViewButtons(){
    newsViewBtn.className = 'btn btn-secondary full';
    subsViewBtn.className = 'btn btn-secondary full';
    catsViewBtn.className = 'btn btn-secondary full';
    if (currentSection === 'newsletters') newsViewBtn.className = 'btn btn-primary full';
    if (currentSection === 'subscribers') subsViewBtn.className = 'btn btn-primary full';
    if (currentSection === 'categories') catsViewBtn.className = 'btn btn-primary full';
  }
  newsViewBtn.addEventListener('click', ()=>{ currentSection = 'newsletters'; setActiveViewButtons(); titleEl && (titleEl.textContent='إدارة النشرات'); renderTable(); addBtn.textContent='إضافة عدد جديد'; });
  catsViewBtn.addEventListener('click', ()=>{ currentSection = 'categories'; setActiveViewButtons(); titleEl && (titleEl.textContent='إدارة التصنيفات'); renderCategories(); addBtn.textContent='إضافة تصنيف'; });
  // hide the categories button — categories are not shown in the sidebar
  catsViewBtn.style.display = 'none';
  subsViewBtn.addEventListener('click', ()=>{ currentSection = 'subscribers'; setActiveViewButtons(); titleEl && (titleEl.textContent='إدارة المشتركين'); renderSubscribers(); addBtn.textContent='إضافة مشترك'; });

  // divider
  const hr = document.createElement('div'); hr.className='divider'; sidebar.appendChild(hr);

  // bottom user box
  const userBox = document.createElement('div'); userBox.className='user-box';
  const userCard = document.createElement('div'); userCard.className='user-card';
  const userEmailDisplay = session?.user?.email || 'admin@alhasoubi.com';
  userCard.innerHTML = `<div class='muted small'>المستخدم:</div><div class='font-semibold'>${userEmailDisplay}</div>`;
  const logoutBtn = document.createElement('button'); logoutBtn.className='btn btn-secondary full mt-3'; logoutBtn.textContent='تسجيل خروج';
  logoutBtn.addEventListener('click', async ()=>{ await supabase.auth.signOut(); renderDashboard(); });
  userBox.appendChild(userCard); userBox.appendChild(logoutBtn);
  sidebar.appendChild(userBox);

  // main content (left)
  const main = document.createElement('main'); main.className='main-content';
  // append main first so sidebar appears on the right in RTL
  layout.appendChild(main);
  layout.appendChild(sidebar);
  const headerRow = document.createElement('div'); headerRow.className='header-row';
  const headerLeft = document.createElement('div'); headerLeft.className='header-left';
  const breadcrumbs = document.createElement('div'); breadcrumbs.className='breadcrumbs'; breadcrumbs.textContent='لوحة التحكم / جميع النشرات';
  const titleEl = document.createElement('h1'); titleEl.className='admin-page-title'; titleEl.textContent='إدارة النشرات';
  headerLeft.appendChild(breadcrumbs); headerLeft.appendChild(titleEl);
  const headerRight = document.createElement('div'); headerRight.className='header-actions';
  const addBtn = document.createElement('button'); addBtn.className='btn btn-primary'; addBtn.textContent='إضافة عدد جديد';
  addBtn.classList.add('admin-pulse');
  const saveLocal = document.createElement('button'); saveLocal.className='btn btn-secondary'; saveLocal.textContent='حفظ محلي';
  const syncBtn = document.createElement('button'); syncBtn.className='btn btn-primary'; syncBtn.textContent='مزامنة مع Supabase';
  headerRight.append(syncBtn, saveLocal, addBtn);
  headerRow.append(headerLeft, headerRight);
  main.appendChild(headerRow);
  animateMount(headerRow, 'admin-animate', true);

  // addBtn behaviour depends on currentSection
  addBtn.addEventListener('click', ()=>{
    if (currentSection === 'newsletters') showForm();
    else if (currentSection === 'subscribers') openSubscriberForm();
    else if (currentSection === 'categories') openCategoryModal();
  });

  async function updateCategory(id, label){
    try{
      const { error } = await supabase.from('categories').update({ label }).eq('id', id);
      if (error) throw error;
      await loadCategories(); renderCategories();
    }catch(e){ showToast('خطأ تحديث التصنيف: ' + (e.message||e), 'error'); }
  }

  // table container (no horizontal wrapper) — table sits directly in a card
  const tableCard = document.createElement('div'); tableCard.className = 'card panel';
  const table = document.createElement('table'); table.className = 'admin-table full';
  tableCard.appendChild(table);
  main.appendChild(tableCard);
  // helper to render a standard table header for newsletters
  function renderNewslettersHeader(){
    table.innerHTML = `
      <thead class='table-head'><tr>
        <th class='td-pad col-status'>حالة النشر</th>
        <th class='td-pad col-title'>رقم العدد / العنوان</th>
        <th class='td-pad col-cat'>التصنيف</th>
        <th class='td-pad col-trans'>الترجمة</th>
        <th class='td-pad col-actions'>الإجراءات</th>
      </tr></thead>
      <tbody id='admin-issues-body'></tbody>
    `;
  }
  layout.appendChild(main);

  // fetch data and render rows
  function hasEnglish(nl){
    return (nl.newsletter_locales||[]).some(x=>x.locale==='en' && (x.article_title||x.welcome_text));
  }

  async function renderTable(){
    renderNewslettersHeader();
    const tbody = document.getElementById('admin-issues-body'); tbody.innerHTML = '';
    const res = await supabase.from('newsletters').select('*, categories(label), newsletter_locales(*)').order('created_at', { ascending: false });
    const rows = res.data || [];
    const filtered = rows.filter(nl=>{
      if (activeCategory && activeCategory!=='all'){
        // activeCategory holds category id when using DB-managed categories
        return nl.category_id === activeCategory || (nl.category_id && nl.category_id === activeCategory);
      }
      return true;
    });
    filtered.forEach(nl=>{
      const tr = document.createElement('tr'); tr.className='table-row admin-animate-row';
      const statusTd = document.createElement('td'); statusTd.className='td-pad col-status';
      const status = document.createElement('span'); status.className = nl.is_published ? 'badge badge-success' : 'badge badge-muted';
      status.textContent = nl.is_published ? 'منشور' : 'مسودة'; statusTd.appendChild(status);

      const titleTd = document.createElement('td'); titleTd.className='td-pad col-title'; titleTd.textContent = `العدد ${nl.issue_number || '-'} - ${ (nl.newsletter_locales||[])[0]?.article_title || 'بدون عنوان' }`;
      const catTd = document.createElement('td'); catTd.className='td-pad col-cat';
      // prefer joined category label from categories relationship, fall back to category text
      const catLabel = (nl.categories && nl.categories.label) || nl.category || '-';
      catTd.textContent = catLabel;
      const transTd = document.createElement('td'); transTd.className='td-pad col-trans';
      const transBadge = document.createElement('span');
      if (hasEnglish(nl)) { transBadge.className='badge badge-success-outline'; transBadge.textContent='✓ EN'; }
      else { transBadge.className='badge badge-danger-outline'; transBadge.textContent='- EN'; }
      transTd.appendChild(transBadge);

      const actionsTd = document.createElement('td'); actionsTd.className='td-pad col-actions';
        const editBtn = document.createElement('button'); editBtn.className='btn btn-secondary small mx-1'; editBtn.textContent='تحرير المحتوى'; editBtn.addEventListener('click', ()=> showForm(nl));
        const transBtn = document.createElement('button'); transBtn.className='btn btn-secondary small mx-1'; transBtn.textContent='ترجمة (EN)'; transBtn.addEventListener('click', ()=> showToast('فتح محرر الترجمة (مؤقت)'));
        const delBtn = document.createElement('button'); delBtn.className='btn btn-danger small mx-1'; delBtn.textContent='حذف'; delBtn.addEventListener('click', async ()=>{
        const ok = await confirmModal('حذف العدد؟ هذا الإجراء نهائي.');
        if (!ok) return;
        const { error } = await supabase.from('newsletters').delete().eq('id', nl.id);
        if (error) return showToast(error.message, 'error');
        showToast('تم حذف العدد');
        renderTable();
      });
      actionsTd.append(editBtn, transBtn, delBtn);

      tr.append(statusTd, titleTd, catTd, transTd, actionsTd);
      tbody.appendChild(tr);
    });
  }

  // subscribers rendering
  async function renderSubscribers(){
    table.innerHTML = `
      <thead class='table-head'><tr>
        <th class='td-pad'>الاسم</th>
        <th class='td-pad'>البريد الإلكتروني</th>
        <th class='td-pad'>تاريخ الاشتراك</th>
        <th class='td-pad'>الإجراءات</th>
      </tr></thead>
      <tbody id='admin-subs-body'></tbody>
    `;
    const tbody = document.getElementById('admin-subs-body'); tbody.innerHTML = '';
    try{
      const res = await supabase.from('subscribers').select('*').order('created_at', { ascending: false });
      const rows = res.data || [];
      rows.forEach(s => {
        const tr = document.createElement('tr'); tr.className='table-row';
        tr.classList.add('admin-animate-row');
        const nameTd = document.createElement('td'); nameTd.className='td-pad col-title'; nameTd.textContent = s.name || '-';
        const emailTd = document.createElement('td'); emailTd.className='td-pad col-cat'; emailTd.textContent = s.email || '-';
        const dateTd = document.createElement('td'); dateTd.className='td-pad col-date'; dateTd.textContent = new Date(s.created_at).toLocaleString();
        const actionsTd = document.createElement('td'); actionsTd.className='td-pad col-actions';
        const del = document.createElement('button'); del.className='btn btn-danger small mx-1'; del.textContent='حذف';
        del.addEventListener('click', async ()=>{
          const ok = await confirmModal('حذف المشترك؟');
          if (!ok) return;
          const { error } = await supabase.from('subscribers').delete().eq('id', s.id);
          if (error) return showToast(error.message, 'error');
          showToast('تم حذف المشترك');
          renderSubscribers();
        });
        actionsTd.appendChild(del);
        tr.append(nameTd, emailTd, dateTd, actionsTd);
        tbody.appendChild(tr);
      });
    }catch(e){ tbody.innerHTML = `<tr><td colspan='4' class='td-pad small muted'>خطأ في جلب المشتركين أو جدول غير موجود.</td></tr>`; }
  }

  // render categories in the main table area (like subscribers)
  async function renderCategories(){
    table.innerHTML = `
      <thead class='table-head'><tr>
        <th class='td-pad'>التصنيف</th>
        <th class='td-pad'>تاريخ الإنشاء</th>
        <th class='td-pad'>عدد النشرات</th>
        <th class='td-pad'>الإجراءات</th>
      </tr></thead>
      <tbody id='admin-cats-body'></tbody>
    `;
    const tbody = document.getElementById('admin-cats-body'); tbody.innerHTML = '';
    try{
      const catsRes = await supabase.from('categories').select('*').order('created_at', { ascending: true });
      const newsRes = await supabase.from('newsletters').select('id,category_id');
      const counts = {};
      (newsRes.data || []).forEach(n => { if (n.category_id) counts[n.category_id] = (counts[n.category_id]||0)+1; });
      (catsRes.data || []).forEach(cat => {
        const tr = document.createElement('tr'); tr.className='table-row admin-animate-row';
        const lblTd = document.createElement('td'); lblTd.className='td-pad col-title'; lblTd.textContent = cat.label;
        const dateTd = document.createElement('td'); dateTd.className='td-pad col-date'; dateTd.textContent = cat.created_at ? new Date(cat.created_at).toLocaleString() : '-';
        const countTd = document.createElement('td'); countTd.className='td-pad col-cat'; countTd.textContent = counts[cat.id] || 0;
        const actionsTd = document.createElement('td'); actionsTd.className='td-pad col-actions';
        const edit = document.createElement('button'); edit.className='btn btn-secondary small mx-1'; edit.textContent='تحرير';
        const del = document.createElement('button'); del.className='btn btn-danger small mx-1'; del.textContent='حذف';
        edit.addEventListener('click', ()=>{ openCategoryModal(cat); });
        del.addEventListener('click', async ()=>{
          const used = counts[cat.id] || 0;
          let msg = 'حذف التصنيف؟';
          if (used > 0) msg = `هذا التصنيف مستخدم في ${used} نشرة. إزالة التصنيف ستترك هذه النشرات بدون تصنيف. هل تود المتابعة؟`;
          const ok = await confirmModal(msg, 'حذف', 'إلغاء');
          if (!ok) return;
          if (used > 0){
            const { error: clearErr } = await supabase.from('newsletters').update({ category_id: null }).eq('category_id', cat.id);
            if (clearErr) return showToast('خطأ عند تحديث النشرات: ' + clearErr.message, 'error');
          }
          const { error } = await supabase.from('categories').delete().eq('id', cat.id);
          if (error) return showToast(error.message, 'error');
          showToast('تم حذف التصنيف');
          renderCategories(); loadCategories();
        });
        actionsTd.append(edit, del);
        tr.append(lblTd, dateTd, countTd, actionsTd);
        tbody.appendChild(tr);
      });
    }catch(e){ tbody.innerHTML = `<tr><td colspan='4' class='td-pad small muted'>خطأ في جلب التصنيفات أو الجدول غير موجود.</td></tr>`; }
  }

  // initial render based on currentSection
  renderTable();
}

// --- Modal + Toast utilities ---
function showToast(msg, type = 'success', timeout = 3000){
  let container = document.getElementById('admin-toast-container');
  if (!container){
    container = document.createElement('div'); container.id = 'admin-toast-container';
    container.style.position = 'fixed'; container.style.top = '18px'; container.style.left = '18px'; container.style.zIndex = '9999';
    document.body.appendChild(container);
  }
  const t = document.createElement('div'); t.className = `admin-toast admin-toast-${type}`; t.textContent = msg;
  t.style.marginBottom = '8px'; t.style.padding = '10px 14px'; t.style.borderRadius = '8px'; t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
  if (type === 'error') t.style.background = '#ffecec', t.style.color = '#9b1c1c';
  else t.style.background = '#e8f7ef', t.style.color = '#0b6b4a';
  container.appendChild(t);
  setTimeout(()=>{ t.style.opacity = '0'; setTimeout(()=> t.remove(), 300); }, timeout);
}

function showModal({ title = '', content = null, onConfirm = null, confirmText = 'حفظ', cancelText = 'إلغاء' } = {}){
  const overlay = document.createElement('div'); overlay.className='admin-modal-overlay';
  overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.background = 'rgba(0,0,0,0.36)'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center'; overlay.style.zIndex = '10000';
  const modal = document.createElement('div'); modal.className='admin-modal newsletter-card'; modal.style.maxWidth = '560px'; modal.style.width = '100%';
  const h = document.createElement('h3'); h.className='card-title'; h.textContent = title;
  const body = document.createElement('div'); body.className='admin-modal-body'; if (content) body.appendChild(content);
  const foot = document.createElement('div'); foot.className='controls';
  const cancel = document.createElement('button'); cancel.className='btn btn-secondary'; cancel.textContent = cancelText;
  const ok = document.createElement('button'); ok.className='btn btn-primary'; ok.textContent = confirmText;
  foot.append(cancel, ok);
  modal.append(h, body, foot);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  cancel.addEventListener('click', ()=> overlay.remove());
  ok.addEventListener('click', async ()=>{
    if (onConfirm) {
      try {
        await onConfirm();
      } catch(e){ showToast(e.message || 'خطأ', 'error'); }
    }
    overlay.remove();
  });
  return { overlay, modal, body };
}

// simple confirm modal returning a Promise
function confirmModal(message, confirmText = 'تأكيد', cancelText = 'إلغاء'){
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className='admin-modal-overlay';
    overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.background = 'rgba(0,0,0,0.36)'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center'; overlay.style.zIndex = '10000';
    const modal = document.createElement('div'); modal.className='admin-modal newsletter-card'; modal.style.maxWidth = '560px'; modal.style.width = '100%';
    const h = document.createElement('h3'); h.className='card-title'; h.textContent = 'تأكيد';
    const body = document.createElement('div'); body.className='admin-modal-body'; const p = document.createElement('div'); p.textContent = message; body.appendChild(p);
    const foot = document.createElement('div'); foot.className='controls';
    const cancel = document.createElement('button'); cancel.className='btn btn-secondary'; cancel.textContent = cancelText;
    const ok = document.createElement('button'); ok.className='btn btn-primary'; ok.textContent = confirmText;
    foot.append(cancel, ok);
    modal.append(h, body, foot); overlay.appendChild(modal); document.body.appendChild(overlay);
    cancel.addEventListener('click', ()=>{ overlay.remove(); resolve(false); });
    ok.addEventListener('click', ()=>{ overlay.remove(); resolve(true); });
  });
}

// Category modal: add or edit
async function openCategoryModal(existing){
  const input = document.createElement('input'); input.className='input'; input.placeholder='اسم التصنيف'; input.value = existing ? existing.label : '';
  const container = document.createElement('div'); container.appendChild(input);
  const m = showModal({ title: existing ? 'تعديل التصنيف' : 'إضافة تصنيف', content: container, confirmText: existing ? 'تحديث' : 'إضافة', cancelText: 'إلغاء', onConfirm: async ()=>{
    const v = input.value.trim(); if (!v) return showToast('أدخل اسم التصنيف', 'error');
    if (existing){
      const { error } = await supabase.from('categories').update({ label: v }).eq('id', existing.id);
      if (error) return showToast(error.message, 'error');
      showToast('تم تحديث التصنيف');
    } else {
      const { error } = await supabase.from('categories').insert({ label: v });
      if (error) return showToast(error.message, 'error');
      showToast('تم إضافة التصنيف');
    }
    await loadCategories(); await renderCategories();
  }});
}

function localeTabControls(localeData = {}) {
  const wrapper = el('div', 'locale-tabs');
  const arWrap = el('div', 'locale ar');
  arWrap.append(el('h4', '', 'Arabic (ar)'));
  const arWelcome = document.createElement('textarea'); arWelcome.placeholder = 'welcome_text'; arWelcome.value = localeData.ar?.welcome_text || ''; arWelcome.className = 'input';
  const arArticleTitle = document.createElement('input'); arArticleTitle.placeholder = 'article_title'; arArticleTitle.value = localeData.ar?.article_title || ''; arArticleTitle.className = 'input';
  const arArticleContent = document.createElement('textarea'); arArticleContent.placeholder = 'article_content'; arArticleContent.value = localeData.ar?.article_content || ''; arArticleContent.className = 'input';
  const arAuthor = document.createElement('input'); arAuthor.placeholder = 'article_author'; arAuthor.value = localeData.ar?.article_author || ''; arAuthor.className = 'input';
  const arNews = newsItemInputs(localeData.ar?.news_items || []);
  arWrap.append(arWelcome, arArticleTitle, arArticleContent, arAuthor, arNews);

  const enWrap = el('div', 'locale en');
  enWrap.append(el('h4', '', 'English (en)'));
  const enWelcome = document.createElement('textarea'); enWelcome.placeholder = 'welcome_text'; enWelcome.value = localeData.en?.welcome_text || ''; enWelcome.className = 'input';
  const enArticleTitle = document.createElement('input'); enArticleTitle.placeholder = 'article_title'; enArticleTitle.value = localeData.en?.article_title || ''; enArticleTitle.className = 'input';
  const enArticleContent = document.createElement('textarea'); enArticleContent.placeholder = 'article_content'; enArticleContent.value = localeData.en?.article_content || ''; enArticleContent.className = 'input';
  const enAuthor = document.createElement('input'); enAuthor.placeholder = 'article_author'; enAuthor.value = localeData.en?.article_author || ''; enAuthor.className = 'input';
  const enNews = newsItemInputs(localeData.en?.news_items || []);
  enWrap.append(enWelcome, enArticleTitle, enArticleContent, enAuthor, enNews);

  wrapper.append(arWrap, enWrap);
  return { wrapper, fields: { ar: { welcome: arWelcome, title: arArticleTitle, content: arArticleContent, author: arAuthor, newsWrap: arNews }, en: { welcome: enWelcome, title: enArticleTitle, content: enArticleContent, author: enAuthor, newsWrap: enNews } } };
}

function collectNewsItems(wrap) {
  const items = [];
  const rows = Array.from(wrap.querySelectorAll('.news-row'));
  rows.forEach(r => {
    const inputs = r.querySelectorAll('input');
    if (inputs.length >= 2) {
      const txt = inputs[0].value.trim();
      const src = inputs[1].value.trim().split(',').map(s=>s.trim()).filter(Boolean);
      if (txt) items.push({ news_text: txt, sources: src });
    }
  });
  return items;
}

async function showForm(existing = null) {
  root.innerHTML = '';
  const title = el('h2', 'admin-title', existing ? 'تحرير العدد' : 'إنشاء عدد جديد');

  const container = el('div', 'newsletter-card admin-container');
  container.appendChild(title);

  const formGrid = el('div', 'form-grid');

  const meta = el('div', 'meta');
  const issue = document.createElement('input'); issue.placeholder = 'issue_number'; issue.type='number'; issue.value = existing?.issue_number || ''; issue.className = 'input';
  const categorySelect = document.createElement('select'); categorySelect.className = 'input';
  categorySelect.appendChild(new Option('--- اختر التصنيف ---',''));
  // populate options from cache or fetch
  (async ()=>{
    if (!categoriesCache || !categoriesCache.length){
      try{ const { data } = await supabase.from('categories').select('*').order('created_at',{ascending:true}); categoriesCache = data||[]; }catch(e){}
    }
    categoriesCache.forEach(c=> categorySelect.appendChild(new Option(c.label, c.id)));
    // set selected value if editing
    if (existing){
      if (existing.category_id) categorySelect.value = existing.category_id;
      else if (existing.category){ // fallback if older rows use enum
        const found = categoriesCache.find(x=>x.label===existing.category);
        if (found) categorySelect.value = found.id;
      }
    }
  })();
  // Cover image: file input + preview. If existing cover URL present, show preview.
  const coverPreview = el('div', 'cover-preview');
  if (existing?.cover_image_url) {
    const img = document.createElement('img'); img.src = existing.cover_image_url; img.style.maxWidth = '240px'; img.style.display = 'block'; img.alt = 'cover';
    coverPreview.appendChild(img);
  }
  const coverFile = document.createElement('input'); coverFile.type = 'file'; coverFile.accept = 'image/*';
  coverFile.addEventListener('change', () => {
    const f = coverFile.files && coverFile.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      coverPreview.innerHTML = '';
      const img = document.createElement('img'); img.src = fr.result; img.style.maxWidth = '240px'; img.style.display = 'block'; img.alt = 'cover';
      coverPreview.appendChild(img);
    };
    fr.readAsDataURL(f);
  });
  const ispub = document.createElement('input'); ispub.type = 'checkbox'; ispub.checked = existing?.is_published || false; ispub.id = 'ispub';
  const pubLabel = el('label','', 'Published'); pubLabel.htmlFor = 'ispub';
  meta.append(issue, categorySelect, coverFile, coverPreview, pubLabel, ispub);
  formGrid.appendChild(meta);

  const locales = {};
  if (existing?.newsletter_locales) {
    existing.newsletter_locales.forEach(r => locales[r.locale] = r);
  }
  const { wrapper, fields } = localeTabControls(locales);
  formGrid.appendChild(wrapper);
  container.appendChild(formGrid);

  const save = el('button', 'submit-button', 'Save');
  save.classList.add('admin-pulse');
  save.addEventListener('click', async () => {
    if (!supabase) return showToast('Supabase client not initialized', 'error');
    const payload = { issue_number: Number(issue.value), cover_image_url: existing?.cover_image_url || null, is_published: ispub.checked };
    // set category_id if selected
    const selectedCat = categorySelect.value;
    if (selectedCat) payload.category_id = selectedCat;
    let nlId = existing?.id;
    if (!nlId) {
      const { data, error } = await supabase.from('newsletters').insert(payload).select().maybeSingle();
      if (error) return showToast(error.message, 'error');
      nlId = data.id;
    } else {
      await supabase.from('newsletters').update(payload).eq('id', nlId);
    }

    // If a file is selected, upload it to Supabase Storage and update cover_image_url
    const file = coverFile.files && coverFile.files[0];
    if (file) {
      try {
        const filePath = `${nlId}/${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
        const uploadRes = await supabase.storage.from('newsletter-assets').upload(filePath, file, { cacheControl: '3600', upsert: false });
          if (uploadRes.error) {
          console.error('Upload error', uploadRes.error);
          showToast('فشل رفع الصورة: ' + uploadRes.error.message, 'error');
        } else {
          const { data: pub } = await supabase.storage.from('newsletter-assets').getPublicUrl(filePath);
          if (pub && pub.publicUrl) {
            await supabase.from('newsletters').update({ cover_image_url: pub.publicUrl }).eq('id', nlId);
            payload.cover_image_url = pub.publicUrl;
          }
        }
      } catch (e) {
        console.error('Unexpected upload error', e);
        showToast('فشل رفع الصورة. راجع الكونسول.', 'error');
      }
    }

    // upsert locales
    const localesToUpsert = ['ar','en'].map(locale => {
      const f = fields[locale];
      return {
        newsletter_id: nlId,
        locale,
        welcome_text: f.welcome.value,
        article_title: f.title.value,
        article_content: f.content.value,
        article_author: f.author.value,
        news_items: JSON.stringify(collectNewsItems(f.newsWrap))
      };
    });

    for (const l of localesToUpsert) {
      // try update first
      const { error: upErr } = await supabase.from('newsletter_locales').upsert(l, { onConflict: 'newsletter_id,locale' });
      if (upErr) console.error(upErr);
    }
    showToast('تم الحفظ');
    renderDashboard();
  });

  const cancel = el('button', '', 'إلغاء'); cancel.addEventListener('click', () => renderDashboard());
  const controls = el('div', 'controls');
  controls.append(save, cancel);
  container.appendChild(controls);
  root.appendChild(container);
  animateMount(container);
}

// open simple subscriber form
async function openSubscriberForm(existing=null){
  root.innerHTML = '';
  const card = el('div','newsletter-card');
  card.append(el('h2','', existing ? 'تحرير مشترك' : 'إضافة مشترك'));
  const name = document.createElement('input'); name.className='input'; name.placeholder='الاسم'; name.value = existing?.name||'';
  const email = document.createElement('input'); email.className='input'; email.placeholder='البريد الإلكتروني'; email.type='email'; email.value = existing?.email||'';
  const save = el('button','submit-button','حفظ');
  save.classList.add('admin-pulse');
  save.addEventListener('click', async ()=>{
    const payload = { name: name.value.trim(), email: email.value.trim() };
    try{
      if (!existing){
        const { data, error } = await supabase.from('subscribers').insert(payload).select().maybeSingle(); if (error) throw error;
      } else {
        const { error } = await supabase.from('subscribers').update(payload).eq('id', existing.id); if (error) throw error;
      }
      showToast('تم الحفظ'); renderDashboard();
    }catch(e){ showToast('خطأ: '+(e.message||e), 'error'); }
  });
  const cancel = el('button','','إلغاء'); cancel.addEventListener('click', ()=> renderDashboard());
  card.append(name, email, save, cancel);
  root.appendChild(card);
  animateMount(card);
}

renderDashboard();
