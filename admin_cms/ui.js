// admin_cms/ui.js — shared UI utilities: toast, confirm, prompt, message
export function showToast(msg, type = 'success', timeout = 3500) {
  let container = document.getElementById('ui-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'ui-toast-container';
    container.className = 'ui-toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `ui-toast ui-${type}`;
  t.textContent = msg;
  container.appendChild(t);

  // Return a handle so callers can dismiss early (useful for upload progress)
  const handle = {
    dismiss: () => {
      if (!t.parentElement) return;
      t.classList.add('ui-toast-hide');
      setTimeout(() => t.remove(), 220);
    }
  };

  if (timeout && timeout > 0) {
    setTimeout(() => handle.dismiss(), timeout);
  }
  return handle;
}

function createModalShell(title, bodyNode) {
  const overlay = document.createElement('div');
  overlay.className = 'ui-modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  const h = document.createElement('h3');
  h.className = 'ui-modal-title';
  h.textContent = title;
  const content = document.createElement('div');
  content.className = 'ui-modal-content';
  content.appendChild(bodyNode);
  const foot = document.createElement('div');
  foot.className = 'ui-modal-actions';
  modal.append(h, content, foot);
  overlay.append(modal);
  document.body.appendChild(overlay);
  return { overlay, foot };
}

export function showConfirm(message, title = 'تأكيد') {
  return new Promise(resolve => {
    const p = document.createElement('p');
    p.textContent = message;
    const { overlay, foot } = createModalShell(title, p);
    const cancel = document.createElement('button');
    cancel.textContent = 'إلغاء';
    cancel.className = 'btn';
    const ok = document.createElement('button');
    ok.textContent = 'تأكيد';
    ok.className = 'btn btn-primary';
    foot.append(cancel, ok);

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function esc(e){ if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); } });
  });
}

export function showPrompt(label, defaultValue = '') {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.className = 'input';
    input.value = defaultValue;
    const { overlay, foot } = createModalShell(label, input);
    const cancel = document.createElement('button');
    cancel.textContent = 'إلغاء';
    cancel.className = 'btn';
    const ok = document.createElement('button');
    ok.textContent = 'حفظ';
    ok.className = 'btn btn-primary';
    foot.append(cancel, ok);

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(input.value));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    });
    input.focus();
  });
}

export function showMessage(message, title = 'معلومة') {
  return new Promise(resolve => {
    const pre = document.createElement('pre');
    pre.className = 'ui-modal-pre';
    pre.textContent = message;
    const { overlay, foot } = createModalShell(title, pre);
    const ok = document.createElement('button');
    ok.textContent = 'إغلاق';
    ok.className = 'btn btn-primary';
    foot.append(ok);
    const close = () => {
      overlay.remove();
      resolve(true);
    };
    ok.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  });
}

export default { showToast, showConfirm, showPrompt, showMessage };
