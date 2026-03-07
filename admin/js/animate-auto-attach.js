// Auto-attach admin animations to dynamically inserted nodes
// Observes #admin-app and adds animation classes to common admin elements
(function(){
  const root = () => document.getElementById('admin-app');
  if (!root()) {
    // if admin-app not yet on page, wait for DOM ready
    document.addEventListener('DOMContentLoaded', () => observe());
  } else observe();

  function applyAnimation(node){
    if (!node || !(node instanceof HTMLElement)) return;
    try {
      // skip if user prefers reduced motion
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq && mq.matches) return;

      // If element already animated, skip
      if (node.classList.contains('admin-animate') || node.classList.contains('admin-animate-row')) return;

      // rules: cards and containers -> admin-animate
      if (node.matches('.newsletter-card, .auth-card, .admin-container, .admin-title, .newsletter-card *')) {
        node.classList.add('admin-animate');
        node.addEventListener('animationend', ()=> node.classList.remove('admin-animate'), { once: true });
        return;
      }

      // table rows or elements explicitly marked as row -> admin-animate-row
      if (node.matches('tr, .admin-row, .admin-animate-row')){
        node.classList.add('admin-animate-row');
        node.addEventListener('animationend', ()=> node.classList.remove('admin-animate-row'), { once: true });
        return;
      }

      // elements with data-animate attribute -> use provided class or default admin-animate
      if (node.hasAttribute && node.hasAttribute('data-animate')){
        const cls = node.getAttribute('data-animate') || 'admin-animate';
        node.classList.add(cls);
        node.addEventListener('animationend', ()=> node.classList.remove(cls), { once: true });
      }
    } catch (e) { /* ignore errors */ }
  }

  function walkAndApply(node){
    if (!node) return;
    if (node.nodeType === Node.ELEMENT_NODE) applyAnimation(node);
    // also try children
    node.querySelectorAll && node.querySelectorAll('.newsletter-card, .auth-card, .admin-container, tr, .admin-row, [data-animate]').forEach(el => applyAnimation(el));
  }

  function observe(){
    const target = root();
    if (!target) return;
    const mo = new MutationObserver((mutations)=>{
      mutations.forEach(m => {
        m.addedNodes.forEach(n => {
          // handle element insertion
          if (n.nodeType === Node.ELEMENT_NODE) walkAndApply(n);
        });
      });
    });
    mo.observe(target, { childList: true, subtree: true });

    // initial pass for any existing nodes
    walkAndApply(target);
  }
})();
