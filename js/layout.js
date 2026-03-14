// js/layout.js
// Dynamically creates and injects unified Header and Footer to public pages.

export function renderUnifiedLayout() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  const menuItems = [
    { name: 'الرئيسية', link: 'index.html' },
    { name: 'جميع النشرات', link: 'episodes_ar.html' },
    { name: 'النشرات المترجمة', link: 'episodes_en.html' },
    { name: 'انضم إلينا', link: 'join.html' },
    { name: 'فريق العمل', link: 'about.html' },
  ];

  const isAdmin = window.location.pathname.includes('/admin_cms/');

  if (!isAdmin) {
    // 1. Build Header
    const header = document.createElement('header');
    header.id = 'main-header';
    
    header.innerHTML = `
      <div class="header-right-section">
        <div class="header-logo-main">
          <a href="index.html">
            <img src="/assets/img/شعار نشرة الحاسوبي باللون الازرق.png" alt="شعار نشرة الحاسوبي">
          </a>
        </div>
        <div class="header-text">
          <h1>نشرة الحاسوبي</h1>
          <p>موعدك الأسبوعي في جديد التقنية</p>
        </div>
      </div>
      
      <nav class="main-nav">
        <ul>
          ${menuItems.map(item => `
            <li>
              <a href="/${item.link}" ${currentPath === item.link ? 'aria-current="page"' : ''}>
                ${item.name}
              </a>
            </li>
          `).join('')}
        </ul>
      </nav>
      
      <div class="header-left-section">
        <div class="header-tools">
          <button id="search-button" class="header-tool-button" aria-label="بحث">
            <i class="fas fa-search"></i>
          </button>
          <button id="mode-toggle-button" class="header-tool-button" aria-label="تبديل الوضع">
            <i class="fas fa-moon"></i>
          </button>
        </div>
      </div>
    `;

    // Provide a generic injection target or replace existing header
    const existingHeader = document.getElementById('main-header');
    if (existingHeader) {
      existingHeader.replaceWith(header);
    } else {
      // Top CTA bar usually sits right above the header
      const topBar = document.querySelector('.top-cta-bar');
      if (topBar) topBar.insertAdjacentElement('afterend', header);
      else document.body.prepend(header);
    }

    // 2. Build Search Bar Overlays if not already present
    // If it already exists, leave it. If missing, drop a unified default.
    let searchBarContainer = document.getElementById('search-bar-container');
    if (!searchBarContainer) {
      searchBarContainer = document.createElement('div');
      searchBarContainer.id = 'search-bar-container';
      searchBarContainer.className = 'search-bar-container hidden';
      searchBarContainer.innerHTML = `
        <div class="search-controls container">
          <input type="text" id="search-input" placeholder="ابحث بالعنوان أو رقم العدد أو التصنيف..." class="form-input">
          <select id="category-filter" class="form-select">
            <option value="all">جميع التصنيفات</option>
            <option value="هندسة">هندسة</option>
            <option value="برمجة">برمجة</option>
            <option value="بيانات">علم البيانات</option>
          </select>
          <button id="search-execute-btn" class="btn btn-primary">بحث</button>
          <button id="close-search-btn" class="btn btn-danger">إغلاق</button>
        </div>
      `;
      header.insertAdjacentElement('afterend', searchBarContainer);
    }

    // 3. Build Sticky Join Bar (if not present)
    let joinFixed = document.querySelector('.join-fixed-bottom');
    if (!joinFixed) {
      joinFixed = document.createElement('div');
      joinFixed.className = 'join-fixed-bottom';
      joinFixed.setAttribute('aria-hidden', 'false');
      joinFixed.innerHTML = `<a href="/join.html" aria-label="انضم إلينا">انضم إلينا</a>`;
      document.body.appendChild(joinFixed);
    }
  }

  // 4. Build Unified Footer
  const footer = document.createElement('footer');
  footer.innerHTML = `
    <div class="footer-bottom">
      &copy; <span class="footer-year">${new Date().getFullYear()}</span> نشرة الحاسوبي. جميع الحقوق محفوظة.
      <span style="margin: 0 5px;">|</span>
      <a href="https://ahhh.sa/" target="_blank" rel="noopener noreferrer" title="عبدالعزيز حافظ - مطور مواقع" style="color: inherit; text-decoration: underline;">شريك النجاح</a>
    </div>
  `;

  // Find existing Footer(s)
  const existingFooters = document.querySelectorAll('footer');
  if (existingFooters.length > 0) {
    // Replace the first footprint and scrub the rest
    existingFooters[0].replaceWith(footer);
    for (let i = 1; i < existingFooters.length; i++) {
       existingFooters[i].remove();
    }
  } else {
    document.body.appendChild(footer);
  }
}

// Ensure execution early
window.addEventListener('DOMContentLoaded', renderUnifiedLayout);
