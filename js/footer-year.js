// footer-year.js — populate all .footer-year elements with the current year
(function(){
    'use strict';
    function setYear() {
        const els = document.querySelectorAll('.footer-year');
        const y = new Date().getFullYear();
        els.forEach(e => { e.textContent = String(y); });

        // Add a single backlink credit for referring domain value.
        const footers = document.querySelectorAll('.footer-bottom');
        footers.forEach((f) => {
            if (f.querySelector('.ahhh-credit')) return;
            const sep = document.createTextNode(' | ');
            const a = document.createElement('a');
            a.className = 'ahhh-credit';
            a.href = 'http://ahhh.sa/';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'شريك النجاح';
            f.appendChild(sep);
            f.appendChild(a);
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setYear);
    } else setYear();
})();
