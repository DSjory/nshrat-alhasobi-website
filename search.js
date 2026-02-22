// search.js - النسخة النهائية الرسمية (ديسمبر 2025) - مضمونة 100%

const { createClient } = supabase;
const SUPABASE_URL = 'https://txldnqhqsgtqttpzbkeq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FfSXeg7MY_fQvuot_uIdWQ_eot3x8jr';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// دالة لتحديد الجدول الحالي (الأهم في الملف كله!)
function getTable() {
    return document.body.dataset.table || 'issues'; // issues = عربي، issues_en = إنجليزي
}

// عرض البطاقات
function displayResults(episodes, container) {
    container.innerHTML = episodes.length === 0
        ? '<p style="text-align:center;padding:50px;color:#999;font-size:1.1rem;">لا توجد نتائج مطابقة.</p>'
        : '';

    episodes.forEach(ep => {
        const card = document.createElement('a');
        card.href = `single-episode.html?issue=${ep.issue_number}${ep.language && ep.language === 'en' ? '&lang=en' : ''}`;
        card.className = 'episode-card';

        card.innerHTML = `
            <div class="card-image-container">
                <img src="${ep.cover_url || 'episode_cover_placeholder.jpg'}" alt="غلاف العدد ${ep.issue_number}" loading="lazy">
            </div>
            <div class="card-details">
                <h4 class="card-title">${ep.title || 'بدون عنوان'}</h4>
                <div class="card-footer">
                    <span class="episode-number">العدد ${ep.issue_number}</span>
                    <span class="publisher-name">${ep.category || 'غير مصنف'}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// البحث + تحميل النتائج
async function performSearch() {
    const term = (document.querySelector('#search-input')?.value || '').trim();
    const category = document.getElementById('category-filter')?.value || 'all';
    const container = document.getElementById('episodes-grid') || document.getElementById('latest-episodes-grid');
    if (!container) return;

    let query = sb.from(getTable()).select('*').order('issue_number', { ascending: false });

    if (category !== 'all') query = query.eq('category', category);
    if (term) {
        if (!isNaN(term) && term !== '') {
            query = query.eq('issue_number', parseInt(term));
        } else {
            query = query.or(`title.ilike.%${term}%,category.ilike.%${term}%`);
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error('خطأ في البحث:', error);
        container.innerHTML = '<p style="text-align:center;color:#e74c3c;">حدث خطأ، حاول مرة أخرى.</p>';
        return;
    }
    displayResults(data, container);
}

// تحميل أحدث النشرات (للصفحة الرئيسية)
async function loadLatestEpisodes(limit = 3) {
    const container = document.getElementById('latest-episodes-grid');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;padding:30px;color:#666;">جاري تحميل أحدث النشرات...</p>';

    // نجيب من جدول issues فقط (العربي) + نضمن إنه عربي بالـ language إذا كان موجود
    const { data, error } = await sb
        .from('issues')  // ← جدول العربي فقط
        .select('*')
        .order('issue_number', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('خطأ في تحميل أحدث النشرات:', error);
        container.innerHTML = '<p style="text-align:center;color:#e74c3c;">فشل تحميل النشرات.</p>';
        return;
    }

    // نعرض البيانات مهما كان
    displayResults(data || [], container);
}

// تفعيل كل شيء عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    setupModeToggle();
    setupSearchToggle();

    const table = getTable();

    // صفحة الرئيسية → أحدث 3
    if (document.getElementById('latest-episodes-grid')) {
        loadLatestEpisodes(3);
    }

    // New: load external latest news JSON into #latest-news-grid when present
    if (document.getElementById('latest-news-grid')) {
        loadLatestNewsFromAPI();
    }

    // صفحات الأرشيف → جلب كل النشرات
    if (document.getElementById('episodes-grid')) {
        performSearch();
    }

    // ربط البحث (Enter + زر + فلتر)
    document.querySelectorAll('#search-input').forEach(input => {
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch();
            }
        });
    });

    document.getElementById('search-execute-btn')?.addEventListener('click', performSearch);
    document.getElementById('category-filter')?.addEventListener('change', performSearch);

    // دعم البحث من الـ URL (?q=كلمة)
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) {
        document.querySelectorAll('#search-input').forEach(i => i.value = decodeURIComponent(q));
        performSearch();
    }
});

// تبديل شريط البحث في الهيدر
function setupSearchToggle() {
    const btn = document.getElementById('search-button');
    const bar = document.querySelector('#search-bar-container');
    const close = document.getElementById('close-search-btn');
    if (!btn || !bar) return;
    btn.onclick = () => bar.classList.toggle('search-active');
    close.onclick = () => {
        bar.classList.remove('search-active');
        document.querySelectorAll('#search-input').forEach(i => i.value = '');
    };
}

/* Fetch external latest news JSON and render cards */
async function loadLatestNewsFromAPI() {
    const container = document.getElementById('latest-news-grid');
    if (!container) return;
    container.innerHTML = '<p style="text-align:center;padding:20px;color:#666;">جاري جلب أحدث الأخبار...</p>';

    try {
        const res = await fetch('https://c3ziz.github.io/saudi-news-ai-rss/api/latest.json');
        if (!res.ok) throw new Error('Network response not ok');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#999;">لا توجد أخبار حالياً.</p>';
            return;
        }

        container.innerHTML = '';
        data.forEach(item => {
            const card = document.createElement('article');
            card.className = 'news-card';

            const imageUrl = item.image || item.img || '';
            const title = item.title || item.headline || '';
            const snippet = item.summary || item.description || '';
            const link = item.link || item.url || '#';

            card.innerHTML = `
                ${imageUrl ? `<img class="news-image" src="${imageUrl}" alt="${title}" loading="lazy">` : ''}
                <div class="news-body">
                    <div class="news-title">${escapeHtml(title)}</div>
                    <div class="news-snippet">${escapeHtml(snippet)}</div>
                    <a class="read-more" href="${link}" target="_blank" rel="noopener">اقرأ أكثر</a>
                </div>
            `;

            container.appendChild(card);
        });

    } catch (err) {
        console.error('خطأ في جلب أحدث الأخبار:', err);
        container.innerHTML = '<p style="text-align:center;color:#e74c3c;">فشل جلب الأخبار.</p>';
    }
}

/* Simple HTML escaper for titles/snippets */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* Setup article action bar interactions (like/save/comment/report) */
function setupArticleActionBar() {
    const likeBtn = document.getElementById('like-btn');
    const saveBtn = document.getElementById('save-btn');
    const commentBtn = document.getElementById('comment-btn');
    const reportBtn = document.getElementById('report-btn');

    if (likeBtn) {
        likeBtn.addEventListener('click', () => {
            likeBtn.classList.toggle('liked');
            // simple local count animation
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveBtn.classList.toggle('liked');
            const saved = JSON.parse(localStorage.getItem('savedIssues') || '[]');
            // try to find issue id from URL
            const params = new URLSearchParams(location.search);
            const issue = params.get('issue');
            if (!issue) return;
            const idx = saved.indexOf(issue);
            if (idx === -1) saved.push(issue); else saved.splice(idx,1);
            localStorage.setItem('savedIssues', JSON.stringify(saved));
        });
    }

    if (commentBtn) {
        commentBtn.addEventListener('click', () => {
            const el = document.getElementById('comment-content');
            if (el) el.focus();
            window.scrollTo({ top: document.getElementById('comments-section')?.offsetTop - 120 || 0, behavior: 'smooth' });
        });
    }

    if (reportBtn) {
        reportBtn.addEventListener('click', () => {
            const proceed = confirm('هل تريد الإبلاغ عن مشكلة في هذه النشرة؟');
            if (proceed) {
                // basic client-side report: open mailto to maintain privacy
                window.location.href = 'mailto:info@example.com?subject=تقرير%20مشكلة%20في%20النشرة';
            }
        });
    }
}

// initialize action bar when article is present
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('article-action-bar')) setupArticleActionBar();
});

// الوضع الليلي
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
