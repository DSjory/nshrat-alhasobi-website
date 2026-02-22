// footer-year.js — populate all .footer-year elements with the current year
(function(){
    'use strict';
    function setYear() {
        const els = document.querySelectorAll('.footer-year');
        const y = new Date().getFullYear();
        els.forEach(e => { e.textContent = String(y); });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setYear);
    } else setYear();
})();
