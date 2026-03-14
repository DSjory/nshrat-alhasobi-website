// latest-news.js — Fetch latest AI news and render cards (separate from search.js)
(function(){
    'use strict';

    // Category mapping to Arabic labels
    const CATEGORY_MAP = {
        'saudi_business_tech': 'أعمال وتقنية سعودية',
        'saudi_general': 'عام سعودي',
        'global_tech': 'تقنية عالمية'
    };

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function hostname(u) {
        try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    }

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
            data.forEach((item, idx) => {
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
                const sourceHost = hostname(sourceUrl);
                const category = item.category || '';
                const categoryLabel = CATEGORY_MAP[category] || category;

                card.innerHTML = `\
                    ${item.image ? `<img class="news-image" src="${item.image}" alt="${escapeHtml(title)}" loading="lazy">` : ''}\
                    <div class="news-body">\
                        <div class="news-top">\
                            ${category ? `<span class="news-category">${escapeHtml(categoryLabel)}</span>` : ''}\
                            ${sourceHost ? `<span class="news-source">${escapeHtml(sourceHost)}</span>` : ''}\
                        </div>\
                        <h4 class="news-title">${escapeHtml(title)}</h4>\
                        ${published ? `<div class="news-date">${escapeHtml(published)}</div>` : ''}\
                        <p class="news-snippet">${escapeHtml(summary)}</p>\
                        <div class="news-footer"><a class="read-more" href="${link}" target="_blank" rel="noopener">اقرأ أكثر</a></div>\
                    </div>\
                `;

                container.appendChild(card);

                // add animation stagger and enable animations
                try {
                    const delay = Math.min(1200, idx * 160);
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

    document.addEventListener('DOMContentLoaded', () => {
        loadLatestNewsFromAPI();
    });

})();
