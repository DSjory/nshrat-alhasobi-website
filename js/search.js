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
        ? '<p class="center muted padded large">لا توجد نتائج مطابقة.</p>'
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

        // enable entrance animation for dynamically created cards
        try {
            const count = container.querySelectorAll('.episode-card').length - 1;
            const delay = Math.min(1000, count * 140);
            card.classList.add('fade-up');
            card.style.setProperty('--animate-delay', `${delay}ms`);
            document.body.classList.add('has-animations');
        } catch (e) {
            // ignore
        }
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
        container.innerHTML = '<p class="center error">حدث خطأ، حاول مرة أخرى.</p>';
        return;
    }
    displayResults(data, container);
}

// تحميل أحدث النشرات (للصفحة الرئيسية)
async function loadLatestEpisodes(limit = 3) {
    const container = document.getElementById('latest-episodes-grid');
    if (!container) return;

    container.innerHTML = '<p class="center muted padded">جاري تحميل أحدث النشرات...</p>';

    // نجيب من جدول issues فقط (العربي) + نضمن إنه عربي بالـ language إذا كان موجود
    const { data, error } = await sb
        .from('issues')  // ← جدول العربي فقط
        .select('*')
        .order('issue_number', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('خطأ في تحميل أحدث النشرات:', error);
        container.innerHTML = '<p class="center error">فشل تحميل النشرات.</p>';
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

    // Latest news loader moved into separate file: latest-news.js

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
    container.innerHTML = '<p class="center muted padded">جاري جلب أحدث الأخبار...</p>';

    try {
        const res = await fetch('https://c3ziz.github.io/saudi-news-ai-rss/api/latest.json');
        if (!res.ok) throw new Error('Network response not ok');
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<p class="center muted">لا توجد أخبار حالياً.</p>';
            return;
        }

        container.innerHTML = '';
        data.forEach(item => {
            const card = document.createElement('article');
            card.className = 'news-card';

            const title = item.title || '';
            const link = item.link || item.url || item.id || '#';
            const summary = item.summary_ai || item.summary || item.description || '';
            const publishedRaw = item.published || item.pubDate || '';
            let published = '';
            try {
                const d = new Date(publishedRaw);
                if (!isNaN(d)) {
                    published = d.toLocaleString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                }
            } catch (e) { published = publishedRaw; }

            const sourceUrl = item.source || item.link || '';
            function hostname(u) {
                try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return '' }
            }

            const category = item.category || '';

            card.innerHTML = `
                ${item.image ? `<img class="news-image" src="${item.image}" alt="${escapeHtml(title)}" loading="lazy">` : ''}
                <div class="news-body">
                    <div class="news-top">
                        ${category ? `<span class="news-category">${escapeHtml(category)}</span>` : ''}
                        ${sourceUrl ? `<span class="news-source">${escapeHtml(hostname(sourceUrl))}</span>` : ''}
                    </div>
                    <h4 class="news-title">${escapeHtml(title)}</h4>
                    ${published ? `<div class="news-date">${escapeHtml(published)}</div>` : ''}
                    <p class="news-snippet">${escapeHtml(summary)}</p>
                    <div class="news-footer"><a class="read-more" href="${link}" target="_blank" rel="noopener">اقرأ أكثر</a></div>
                </div>
            `;

            container.appendChild(card);

            // animation for news cards
            try {
                const index = container.querySelectorAll('.news-card').length - 1;
                const delay = Math.min(1000, index * 140);
                card.classList.add('fade-up');
                card.style.setProperty('--animate-delay', `${delay}ms`);
                document.body.classList.add('has-animations');
            } catch (e) {}

            // enable entrance animation for dynamically created news cards
            try {
                const index = container.querySelectorAll('.news-card').length - 1;
                const delay = Math.min(1000, index * 140);
                card.classList.add('fade-up');
                card.style.setProperty('--animate-delay', `${delay}ms`);
                document.body.classList.add('has-animations');
            } catch (e) {}
        });

    } catch (err) {
        console.error('خطأ في جلب أحدث الأخبار:', err);
        container.innerHTML = '<p class="center error">فشل جلب الأخبار.</p>';
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

/* Setup page entrance animations: add .fade-up and stagger delays, then enable .has-animations */
function setupPageAnimations() {
    // Apply fade-up to the whole page: assign to top-level visible body children
    // This makes the entrance effect apply to the whole page rather than isolated sections.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.body.classList.add('has-animations');
        return;
    }

    const children = Array.from(document.body.children).filter(el => {
        // skip scripts, noscript and elements not visually rendered
        return el.tagName.toLowerCase() !== 'script' && el.tagName.toLowerCase() !== 'noscript' && el.offsetParent !== null;
    });

    // if no top-level children found, still enable has-animations so nested dynamic elements can animate
    if (!children.length) {
        document.body.classList.add('has-animations');
        return;
    }

    children.forEach((el, idx) => {
        el.classList.add('fade-up');
        const delay = Math.min(1200, idx * 160);
        el.style.setProperty('--animate-delay', `${delay}ms`);
    });

    // Also ensure any existing dynamic cards already got fade-up earlier; enabling the class runs animations
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.body.classList.add('has-animations');
    }));
}

document.addEventListener('DOMContentLoaded', () => {
    // run animations after small idle to avoid blocking load
    setTimeout(setupPageAnimations, 120);
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
