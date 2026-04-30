// search.js

const { createClient } = window.supabase || {};
const SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FfSXeg7MY_fQvuot_uIdWQ_eot3x8jr';
const sb = createClient ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

async function loadCategoriesIntoFilter() {
    const select = document.getElementById('category-filter');
    if (!select || !sb) return;

    const locale = getLocale();

    const { data, error } = await sb
        .from('categories')
        .select('name_ar, name_en')
        .order('name_ar', { ascending: true });

    if (error) {
        console.error('خطأ في تحميل التصنيفات:', error);
        return;
    }

    select.innerHTML = '<option value="all">جميع التصنيفات</option>';

    (data || []).forEach((cat) => {
        const name = locale === 'en'
            ? (cat.name_en || cat.name_ar)
            : (cat.name_ar || cat.name_en);

        if (!name) return;

        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

function resolveCoverUrl(value) {
    if (!value) return 'assets/img/شعار نشرة الحاسوبي باللون الازرق.png';
    if (/^https?:\/\//i.test(value)) return value;

    let path = String(value).replace(/^\/+/, '');
    path = path.replace(/^newsletter-media\//, '');
    const encoded = path.split('/').map((s) => encodeURIComponent(s)).join('/');

    return `${SUPABASE_URL}/storage/v1/object/public/newsletter-media/${encoded}`;
}

function getLocale() {
    return document.documentElement.lang === 'en' ? 'en' : 'ar';
}

function normalizeText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[ًٌٍَُِّْ]/g, '');
}

function normalizeNewsletterRecord(nl) {
    const locale = getLocale();

    const title = locale === 'en'
        ? (nl.title_en || nl.title_ar || 'Untitled')
        : (nl.title_ar || nl.title_en || 'بدون عنوان');

    const category = locale === 'en'
        ? (nl.categories?.name_en || nl.categories?.name_ar || 'Uncategorized')
        : (nl.categories?.name_ar || nl.categories?.name_en || 'غير مصنف');

    return {
        id: nl.id,
        issue_number: nl.edition_number,
        title,
        category,
        cover_url: resolveCoverUrl(nl.cover_image_url)
    };
}

function getTable() {
    return 'newsletters';
}

function displayResults(episodes, container) {
    container.innerHTML = episodes.length === 0
        ? '<p class="center muted padded large">لا توجد نتائج مطابقة.</p>'
        : '';

    episodes.forEach((ep, index) => {
        const card = document.createElement('a');
        card.href = `single-episode.html?id=${ep.id}&lang=${getLocale()}`;
        card.className = 'episode-card fade-up';
        card.style.setProperty('--animate-delay', `${Math.min(1000, index * 120)}ms`);

        card.innerHTML = `
            <div class="card-image-container">
                <img src="${ep.cover_url || 'assets/img/placeholder.png'}" alt="غلاف العدد ${ep.issue_number || '-'}" loading="lazy">
            </div>
            <div class="card-details">
                <h4 class="card-title">${ep.title || 'بدون عنوان'}</h4>
                <div class="card-footer">
                    <span class="episode-number">العدد ${ep.issue_number || '-'}</span>
                    <span class="publisher-name">${ep.category || 'غير مصنف'}</span>
                </div>
            </div>
        `;

        container.appendChild(card);
    });

    document.body.classList.add('has-animations');
}

async function fetchNewsletters(term = '') {
    if (!sb) return [];

    let query = sb
        .from(getTable())
        .select('id,edition_number,title_ar,title_en,cover_image_url,status,categories(name_ar,name_en),created_at')
        .eq('status', 'published')
        .order('edition_number', { ascending: false });

    const cleanTerm = term.trim();

    if (cleanTerm) {
        if (!isNaN(cleanTerm)) {
            query = query.eq('edition_number', parseInt(cleanTerm, 10));
        } else {
            query = query.or(`title_ar.ilike.%${cleanTerm}%,title_en.ilike.%${cleanTerm}%`);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('خطأ في البحث:', error);
        return null;
    }

    return (data || []).map(normalizeNewsletterRecord);
}

async function performSearch() {
    const term = (document.getElementById('search-input')?.value || '').trim();
    const category = document.getElementById('category-filter')?.value || 'all';
    const container = document.getElementById('episodes-grid') || document.getElementById('latest-episodes-grid');

    if (!container) return;

    container.innerHTML = '<p class="center muted padded">جاري البحث...</p>';

    let rows = await fetchNewsletters(term);

    if (rows === null) {
        container.innerHTML = '<p class="center error">حدث خطأ، حاول مرة أخرى.</p>';
        return;
    }

    if (category !== 'all') {
        const selectedCategory = normalizeText(category);

        rows = rows.filter((r) => {
            const rowCategory = normalizeText(r.category);
            return rowCategory.includes(selectedCategory) || selectedCategory.includes(rowCategory);
        });
    }

    displayResults(rows, container);
}

async function loadLatestEpisodes(limit = 3) {
    const container = document.getElementById('latest-episodes-grid');
    if (!container || !sb) return;

    container.innerHTML = '<p class="center muted padded">جاري تحميل أحدث النشرات...</p>';

    const { data, error } = await sb
        .from('newsletters')
        .select('id,edition_number,title_ar,title_en,cover_image_url,status,categories(name_ar,name_en),created_at')
        .eq('status', 'published')
        .order('edition_number', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('خطأ في تحميل أحدث النشرات:', error);
        container.innerHTML = '<p class="center error">فشل تحميل النشرات.</p>';
        return;
    }

    displayResults((data || []).map(normalizeNewsletterRecord), container);
}

function createSearchBarIfMissing() {
    let bar = document.getElementById('search-bar-container');

    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'search-bar-container';
    bar.className = 'search-bar-container hidden';

    const options = SEARCH_CATEGORIES.map((cat) => {
        return `<option value="${cat.value}">${cat.label}</option>`;
    }).join('');

    bar.innerHTML = `
        <div class="search-controls container">
            <input type="text" id="search-input" placeholder="ابحث بالعنوان أو رقم العدد..." class="form-input">

            <select id="category-filter" class="form-select">
                ${options}
            </select>

            <button id="search-execute-btn" class="btn btn-primary">بحث</button>
            <button id="close-search-btn" class="btn btn-danger">إغلاق</button>
        </div>
    `;

    const main = document.querySelector('main');

    if (main) {
        document.body.insertBefore(bar, main);
    } else {
        document.body.appendChild(bar);
    }

    return bar;
}

function setupSearchToggle() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const pagesWithoutSearch = ['join.html', 'about.html'];

    if (pagesWithoutSearch.includes(currentPage)) {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#search-button')) {
                e.preventDefault();
            }
        });
        return;
    }

    document.addEventListener('click', (e) => {
        const searchBtn = e.target.closest('#search-button');
        const closeBtn = e.target.closest('#close-search-btn');
        const executeBtn = e.target.closest('#search-execute-btn');

        if (searchBtn) {
            e.preventDefault();

            const bar = createSearchBarIfMissing();
            loadCategoriesIntoFilter();
            const input = document.getElementById('search-input');

            bar.classList.remove('hidden');
            bar.classList.add('search-active');
            bar.style.display = 'block';

            setTimeout(() => input?.focus(), 100);
        }

        if (closeBtn) {
            e.preventDefault();

            const bar = document.getElementById('search-bar-container');
            const input = document.getElementById('search-input');
            const category = document.getElementById('category-filter');

            bar?.classList.add('hidden');
            bar?.classList.remove('search-active');

            if (input) input.value = '';
            if (category) category.value = 'all';
        }

        if (executeBtn) {
            e.preventDefault();
            performSearch();
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target.id === 'search-input') {
            performSearch();
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'category-filter') {
            performSearch();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.id === 'search-input' && e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });
}

function setupModeToggle() {
    const btn = document.getElementById('mode-toggle-button');
    if (!btn) return;

    btn.onclick = () => {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');

        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    };

    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        btn.innerHTML = '<i class="fas fa-sun"></i>';
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';

    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setupPageAnimations() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.body.classList.add('has-animations');
        return;
    }

    const children = Array.from(document.body.children).filter((el) => {
        return el.tagName.toLowerCase() !== 'script'
            && el.tagName.toLowerCase() !== 'noscript'
            && el.offsetParent !== null;
    });

    children.forEach((el, idx) => {
        el.classList.add('fade-up');
        el.style.setProperty('--animate-delay', `${Math.min(1200, idx * 160)}ms`);
    });

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.classList.add('has-animations');
        });
    });
}

function setupArticleActionBar() {
    const likeBtn = document.getElementById('like-btn');
    const saveBtn = document.getElementById('save-btn');
    const commentBtn = document.getElementById('comment-btn');
    const reportBtn = document.getElementById('report-btn');

    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            likeBtn.classList.toggle('liked');
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveBtn.classList.toggle('liked');

            const saved = JSON.parse(localStorage.getItem('savedIssues') || '[]');
            const params = new URLSearchParams(location.search);
            const issue = params.get('issue');

            if (!issue) return;

            const idx = saved.indexOf(issue);

            if (idx === -1) {
                saved.push(issue);
            } else {
                saved.splice(idx, 1);
            }

            localStorage.setItem('savedIssues', JSON.stringify(saved));
        });
    }

    if (commentBtn) {
        commentBtn.addEventListener('click', () => {
            const el = document.getElementById('comment-content');
            if (el) el.focus();

            window.scrollTo({
                top: document.getElementById('comments-section')?.offsetTop - 120 || 0,
                behavior: 'smooth'
            });
        });
    }

    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            const proceed = confirm('هل تريد الإبلاغ عن مشكلة في هذه النشرة؟');

            if (proceed) {
                window.location.href = 'mailto:info@example.com?subject=تقرير%20مشكلة%20في%20النشرة';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupModeToggle();
    setupSearchToggle();
    loadCategoriesIntoFilter();

    if (document.getElementById('latest-episodes-grid')) {
        loadLatestEpisodes(3);
    }

    if (document.getElementById('episodes-grid')) {
        performSearch();
    }

    if (document.getElementById('article-action-bar')) {
        setupArticleActionBar();
    }

    setTimeout(setupPageAnimations, 120);
});


