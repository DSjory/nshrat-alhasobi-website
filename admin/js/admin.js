import { supabase, youtubeThumbnailFromUrl } from './supabaseClient.js';

const root = document.getElementById('admin-app');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function loginForm() {
  const c = el('div', 'auth');
  c.append(el('h2', '', 'تسجيل الدخول')); 
  const email = document.createElement('input'); email.placeholder = 'Email'; email.type = 'email';
  const pass = document.createElement('input'); pass.placeholder = 'Password'; pass.type = 'password';
  const btn = el('button', '', 'Login');
  btn.addEventListener('click', async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: pass.value });
    if (error) return alert(error.message);
    renderDashboard();
  });
  c.append(email, pass, btn);
  return c;
}

async function requireAuth() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

function newsItemInputs(items = []) {
  const wrap = el('div', 'news-items');
  function addItem(value = { news_text: '', sources: [] }) {
    const row = el('div', 'news-row');
    const t = document.createElement('input'); t.placeholder = 'news text'; t.value = value.news_text || '';
    const s = document.createElement('input'); s.placeholder = 'sources (comma)'; s.value = (value.sources || []).join(',');
    const rem = el('button', '', 'Remove');
    rem.addEventListener('click', () => row.remove());
    row.append(t, s, rem);
    wrap.appendChild(row);
  }
  const addBtn = el('button', '', 'Add News Item');
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

  const header = el('div', 'admin-header');
  header.append(el('h2', '', 'Admin Dashboard'));
  const logout = el('button', '', 'Logout');
  logout.addEventListener('click', async () => { await supabase.auth.signOut(); renderDashboard(); });
  header.appendChild(logout);
  root.appendChild(header);

  // List newsletters
  const listWrap = el('div', 'list');
  const res = await supabase.from('newsletters').select('*, newsletter_locales(*)').order('created_at', { ascending: false });
  const rows = res.data || [];
  rows.forEach(nl => {
    const row = el('div', 'nl-row');
    row.append(el('div', 'nl-num', `#${nl.issue_number} - ${nl.category}`));
    const edit = el('button', '', 'Edit');
    edit.addEventListener('click', () => showForm(nl));
    const del = el('button', '', 'Delete');
    del.addEventListener('click', async () => {
      if (!confirm('Delete newsletter?')) return;
      await supabase.from('newsletters').delete().eq('id', nl.id);
      renderDashboard();
    });
    row.append(edit, del);
    listWrap.appendChild(row);
  });
  root.appendChild(listWrap);

  const createBtn = el('button', '', 'Create New');
  createBtn.addEventListener('click', () => showForm());
  root.appendChild(createBtn);
}

function localeTabControls(localeData = {}) {
  const wrapper = el('div', 'locale-tabs');
  const arWrap = el('div', 'locale ar');
  arWrap.append(el('h4', '', 'Arabic (ar)'));
  const arWelcome = document.createElement('textarea'); arWelcome.placeholder = 'welcome_text'; arWelcome.value = localeData.ar?.welcome_text || '';
  const arArticleTitle = document.createElement('input'); arArticleTitle.placeholder = 'article_title'; arArticleTitle.value = localeData.ar?.article_title || '';
  const arArticleContent = document.createElement('textarea'); arArticleContent.placeholder = 'article_content'; arArticleContent.value = localeData.ar?.article_content || '';
  const arAuthor = document.createElement('input'); arAuthor.placeholder = 'article_author'; arAuthor.value = localeData.ar?.article_author || '';
  const arNews = newsItemInputs(localeData.ar?.news_items || []);
  arWrap.append(arWelcome, arArticleTitle, arArticleContent, arAuthor, arNews);

  const enWrap = el('div', 'locale en');
  enWrap.append(el('h4', '', 'English (en)'));
  const enWelcome = document.createElement('textarea'); enWelcome.placeholder = 'welcome_text'; enWelcome.value = localeData.en?.welcome_text || '';
  const enArticleTitle = document.createElement('input'); enArticleTitle.placeholder = 'article_title'; enArticleTitle.value = localeData.en?.article_title || '';
  const enArticleContent = document.createElement('textarea'); enArticleContent.placeholder = 'article_content'; enArticleContent.value = localeData.en?.article_content || '';
  const enAuthor = document.createElement('input'); enAuthor.placeholder = 'article_author'; enAuthor.value = localeData.en?.article_author || '';
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
  const title = el('h2', '', existing ? 'Edit Newsletter' : 'Create Newsletter');
  root.appendChild(title);

  const meta = el('div', 'meta');
  const issue = document.createElement('input'); issue.placeholder = 'issue_number'; issue.type='number'; issue.value = existing?.issue_number || '';
  const category = document.createElement('input'); category.placeholder = 'category'; category.value = existing?.category || '';
  const cover = document.createElement('input'); cover.placeholder = 'cover_image_url'; cover.value = existing?.cover_image_url || '';
  const ispub = document.createElement('input'); ispub.type = 'checkbox'; ispub.checked = existing?.is_published || false;
  meta.append(issue, category, cover, el('label','', 'Published'), ispub);
  root.appendChild(meta);

  const locales = {};
  if (existing?.newsletter_locales) {
    existing.newsletter_locales.forEach(r => locales[r.locale] = r);
  }
  const { wrapper, fields } = localeTabControls(locales);
  root.appendChild(wrapper);

  const save = el('button', '', 'Save');
  save.addEventListener('click', async () => {
    const payload = { issue_number: Number(issue.value), category: category.value, cover_image_url: cover.value, is_published: ispub.checked };
    let nlId = existing?.id;
    if (!nlId) {
      const { data, error } = await supabase.from('newsletters').insert(payload).select().maybeSingle();
      if (error) return alert(error.message);
      nlId = data.id;
    } else {
      await supabase.from('newsletters').update(payload).eq('id', nlId);
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

    alert('Saved');
    renderDashboard();
  });

  const cancel = el('button', '', 'Cancel'); cancel.addEventListener('click', () => renderDashboard());
  root.append(save, cancel);
}

renderDashboard();
