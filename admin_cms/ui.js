// admin_cms/ui.js — shared UI utilities for the admin CMS.
//
// Public API
//   showToast(msg, type?, timeout?)          → { dismiss() }
//   showConfirm(message, title?, opts?)      → Promise<boolean>
//   showPrompt(label, defaultValue?)         → Promise<string|null>
//   showMessage(message, title?)             → Promise<true>
//   showFormModal({ title, fields, submitLabel?, cancelLabel?, onSubmit?, wide? })
//                                            → Promise<values | null>
//   openDrawer({ title, content, foot?, onClose? })
//                                            → { el, body, foot, close, setFoot }
//
// Field descriptor accepted by showFormModal.fields:
//   { name, type, label?, defaultValue?, placeholder?, help?, required?,
//     options?,        // for type: 'select' — [{value, label}]
//     min?, max?,      // for number/date
//     pattern?,        // regex string
//     validate?,       // (value, all) => string|null  (string = error)
//     when?,           // (all) => boolean — show this field only if true
//     full? }          // span both columns in a 2-col modal
//
// Field types: 'text' | 'email' | 'password' | 'number' | 'date' | 'textarea'
//            | 'select' | 'checkbox' | 'bilingual-text' | 'bilingual-textarea'
//            | 'static' (render label + read-only value)

const KEY_OK = 'Enter';
const KEY_NO = 'Escape';

/* ─── Toasts ──────────────────────────────────────────────────────────────── */
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
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.textContent = msg;
  container.appendChild(t);

  const handle = {
    dismiss: () => {
      if (!t.parentElement) return;
      t.classList.add('ui-toast-hide');
      setTimeout(() => t.remove(), 220);
    },
  };
  if (timeout && timeout > 0) setTimeout(() => handle.dismiss(), timeout);
  return handle;
}

/* ─── Modal primitives ────────────────────────────────────────────────────── */
function createModalShell(title, bodyNode, { wide = false } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'ui-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'ui-modal' + (wide ? ' ui-modal-wide' : '');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const h = document.createElement('h3');
  h.className = 'ui-modal-title';
  h.textContent = title;

  const content = document.createElement('div');
  content.className = 'ui-modal-content';
  if (bodyNode) content.appendChild(bodyNode);

  const foot = document.createElement('div');
  foot.className = 'ui-modal-actions';

  modal.append(h, content, foot);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Focus trap (basic): focus first focusable element inside content
  setTimeout(() => {
    const first = modal.querySelector('input, textarea, select, button');
    if (first && typeof first.focus === 'function') first.focus();
  }, 30);

  return { overlay, modal, title: h, content, foot };
}

function closeOnOverlay(overlay, onClose) {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) onClose(); });
  const esc = (e) => { if (e.key === KEY_NO) { document.removeEventListener('keydown', esc); onClose(); } };
  document.addEventListener('keydown', esc);
}

/* ─── showConfirm ─────────────────────────────────────────────────────────── */
export function showConfirm(message, title = 'تأكيد', { okLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false } = {}) {
  return new Promise(resolve => {
    const p = document.createElement('p');
    p.textContent = message;
    p.style.margin = '0';
    const { overlay, foot } = createModalShell(title, p);
    const cancel = document.createElement('button');
    cancel.textContent = cancelLabel; cancel.className = 'btn';
    const ok = document.createElement('button');
    ok.textContent = okLabel;
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    foot.append(cancel, ok);
    const close = (r) => { overlay.remove(); resolve(r); };
    cancel.addEventListener('click', () => close(false));
    ok.addEventListener('click', () => close(true));
    closeOnOverlay(overlay, () => close(false));
    setTimeout(() => ok.focus(), 30);
  });
}

/* ─── showPrompt ──────────────────────────────────────────────────────────── */
export function showPrompt(label, defaultValue = '') {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.className = 'label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.className = 'input';
    input.value = defaultValue;
    wrap.append(lbl, input);
    const { overlay, foot } = createModalShell(label, wrap);
    const cancel = document.createElement('button');
    cancel.textContent = 'إلغاء'; cancel.className = 'btn';
    const ok = document.createElement('button');
    ok.textContent = 'حفظ'; ok.className = 'btn btn-primary';
    foot.append(cancel, ok);
    const close = (v) => { overlay.remove(); resolve(v); };
    cancel.addEventListener('click', () => close(null));
    ok.addEventListener('click', () => close(input.value));
    closeOnOverlay(overlay, () => close(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === KEY_OK) { e.preventDefault(); close(input.value); }
    });
    setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

/* ─── showMessage ─────────────────────────────────────────────────────────── */
export function showMessage(message, title = 'معلومة') {
  return new Promise(resolve => {
    const pre = document.createElement('pre');
    pre.className = 'ui-modal-pre';
    pre.textContent = message;
    const { overlay, foot } = createModalShell(title, pre);
    const ok = document.createElement('button');
    ok.textContent = 'إغلاق'; ok.className = 'btn btn-primary';
    foot.append(ok);
    const close = () => { overlay.remove(); resolve(true); };
    ok.addEventListener('click', close);
    closeOnOverlay(overlay, close);
  });
}

/* ─── Field renderers (used by showFormModal) ─────────────────────────────── */
function renderTextField(field) {
  const input = document.createElement('input');
  input.type = field.type === 'email' ? 'email'
            : field.type === 'password' ? 'password'
            : field.type === 'number' ? 'number'
            : field.type === 'date'  ? 'date'
            : 'text';
  input.className = 'input';
  input.name = field.name;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.defaultValue != null) input.value = field.defaultValue;
  if (field.min != null) input.min = field.min;
  if (field.max != null) input.max = field.max;
  if (field.pattern) input.pattern = field.pattern;
  if (field.required) input.required = true;
  return input;
}

function renderTextarea(field) {
  const t = document.createElement('textarea');
  t.className = 'input';
  t.name = field.name;
  t.rows = field.rows || 4;
  if (field.placeholder) t.placeholder = field.placeholder;
  if (field.defaultValue != null) t.value = field.defaultValue;
  return t;
}

function renderSelect(field) {
  const s = document.createElement('select');
  s.className = 'input';
  s.name = field.name;
  (field.options || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (String(field.defaultValue) === String(opt.value)) o.selected = true;
    s.appendChild(o);
  });
  return s;
}

function renderCheckbox(field) {
  const wrap = document.createElement('label');
  wrap.className = 'check-row';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.name = field.name;
  cb.checked = !!field.defaultValue;
  const span = document.createElement('span');
  span.textContent = field.checkboxLabel || field.label || '';
  wrap.append(cb, span);
  wrap._input = cb;
  return wrap;
}

function renderBilingualTextLike(field, multiline) {
  const wrap = document.createElement('div');
  wrap.className = 'bilingual';
  const arSide = document.createElement('div');
  arSide.className = 'bilingual-side';
  arSide.dataset.lang = 'ar';
  const arLabel = document.createElement('label');
  arLabel.className = 'field-label';
  arLabel.textContent = (field.label || '') + ' (عربي)';
  if (field.required) arLabel.classList.add('field-required');
  const arInput = multiline
    ? renderTextarea({ name: field.name + '_ar', placeholder: field.placeholderAr, defaultValue: field.defaultValueAr, rows: field.rows })
    : renderTextField({ type: 'text', name: field.name + '_ar', placeholder: field.placeholderAr, defaultValue: field.defaultValueAr, required: field.required });
  arSide.append(arLabel, arInput);

  const enSide = document.createElement('div');
  enSide.className = 'bilingual-side';
  enSide.dataset.lang = 'en';
  const enLabel = document.createElement('label');
  enLabel.className = 'field-label';
  enLabel.textContent = (field.label || '') + ' (EN)';
  const enInput = multiline
    ? renderTextarea({ name: field.name + '_en', placeholder: field.placeholderEn, defaultValue: field.defaultValueEn, rows: field.rows })
    : renderTextField({ type: 'text', name: field.name + '_en', placeholder: field.placeholderEn, defaultValue: field.defaultValueEn });
  enSide.append(enLabel, enInput);

  wrap.append(arSide, enSide);
  wrap._arInput = arInput;
  wrap._enInput = enInput;
  return wrap;
}

function setError(fieldEl, msg) {
  let err = fieldEl.querySelector('.field-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'field-error';
    fieldEl.appendChild(err);
  }
  err.textContent = msg || '';
  err.style.display = msg ? '' : 'none';
}

/* ─── showFormModal ───────────────────────────────────────────────────────── */
export function showFormModal({
  title,
  fields = [],
  submitLabel = 'حفظ',
  cancelLabel = 'إلغاء',
  onSubmit,
  wide = false,
} = {}) {
  return new Promise(resolve => {
    const form = document.createElement('form');
    form.className = 'form-modal-grid';
    form.noValidate = true;
    const inputMap = new Map(); // name → { fieldEl, getValue, setValue }

    fields.forEach(field => {
      const fieldEl = document.createElement('div');
      fieldEl.className = 'field';
      if (field.full) fieldEl.style.gridColumn = '1 / -1';

      let labelEl = null;
      if (field.label && field.type !== 'bilingual-text' && field.type !== 'bilingual-textarea' && field.type !== 'checkbox') {
        labelEl = document.createElement('label');
        labelEl.className = 'field-label';
        labelEl.textContent = field.label;
        if (field.required) labelEl.classList.add('field-required');
        fieldEl.appendChild(labelEl);
      }

      let inputEl;
      let getValue, setValue;

      switch (field.type) {
        case 'textarea':
          inputEl = renderTextarea(field);
          getValue = () => inputEl.value;
          setValue = (v) => { inputEl.value = v || ''; };
          break;
        case 'select':
          inputEl = renderSelect(field);
          getValue = () => inputEl.value;
          setValue = (v) => { inputEl.value = v; };
          break;
        case 'checkbox':
          inputEl = renderCheckbox(field);
          getValue = () => inputEl._input.checked;
          setValue = (v) => { inputEl._input.checked = !!v; };
          break;
        case 'bilingual-text':
          inputEl = renderBilingualTextLike(field, false);
          getValue = () => ({ ar: inputEl._arInput.value, en: inputEl._enInput.value });
          setValue = (v) => { inputEl._arInput.value = v?.ar || ''; inputEl._enInput.value = v?.en || ''; };
          break;
        case 'bilingual-textarea':
          inputEl = renderBilingualTextLike(field, true);
          getValue = () => ({ ar: inputEl._arInput.value, en: inputEl._enInput.value });
          setValue = (v) => { inputEl._arInput.value = v?.ar || ''; inputEl._enInput.value = v?.en || ''; };
          break;
        case 'static': {
          const s = document.createElement('div');
          s.textContent = field.defaultValue || '';
          s.style.color = 'var(--text-soft)';
          inputEl = s;
          getValue = () => field.defaultValue;
          setValue = () => {};
          break;
        }
        default:
          inputEl = renderTextField(field);
          getValue = () => inputEl.value;
          setValue = (v) => { inputEl.value = v || ''; };
      }
      fieldEl.appendChild(inputEl);
      if (field.help) {
        const help = document.createElement('div');
        help.className = 'field-help';
        help.textContent = field.help;
        fieldEl.appendChild(help);
      }
      form.appendChild(fieldEl);
      inputMap.set(field.name, { field, fieldEl, getValue, setValue });
    });

    const { overlay, foot } = createModalShell(title, form, { wide: wide || fields.length > 4 });

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = cancelLabel; cancel.className = 'btn';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.textContent = submitLabel; ok.className = 'btn btn-primary';
    foot.append(cancel, ok);

    const close = (v) => { overlay.remove(); resolve(v); };

    cancel.addEventListener('click', () => close(null));
    closeOnOverlay(overlay, () => close(null));

    // Toggle visibility of fields with `when` predicate
    function evaluateWhen() {
      const values = collectValues();
      inputMap.forEach(({ field, fieldEl }) => {
        if (typeof field.when === 'function') {
          fieldEl.style.display = field.when(values) ? '' : 'none';
        }
      });
    }
    form.addEventListener('change', evaluateWhen);
    form.addEventListener('input', evaluateWhen);
    evaluateWhen();

    function collectValues() {
      const out = {};
      inputMap.forEach(({ field, getValue }) => {
        out[field.name] = getValue();
      });
      return out;
    }

    async function submit() {
      const values = collectValues();
      let firstErrorField = null;
      inputMap.forEach(({ field, fieldEl, getValue }) => {
        setError(fieldEl, '');
        if (field.type === 'static') return;
        if (typeof field.when === 'function' && !field.when(values)) return;
        const v = getValue();
        if (field.required) {
          const isEmpty = field.type === 'bilingual-text' || field.type === 'bilingual-textarea'
            ? !(v?.ar && String(v.ar).trim())
            : (v == null || (typeof v === 'string' && !v.trim()));
          if (isEmpty) {
            setError(fieldEl, 'هذا الحقل مطلوب');
            if (!firstErrorField) firstErrorField = fieldEl;
          }
        }
        if (!firstErrorField && typeof field.validate === 'function') {
          const err = field.validate(v, values);
          if (err) { setError(fieldEl, err); firstErrorField = fieldEl; }
        }
      });
      if (firstErrorField) {
        firstErrorField.querySelector('input, textarea, select')?.focus();
        return;
      }
      if (typeof onSubmit === 'function') {
        try {
          ok.disabled = true; ok.classList.add('loading');
          const proceed = await onSubmit(values);
          if (proceed === false) { ok.disabled = false; ok.classList.remove('loading'); return; }
        } catch (err) {
          ok.disabled = false; ok.classList.remove('loading');
          showToast(err?.message || 'تعذر الحفظ', 'error');
          return;
        }
      }
      close(values);
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    ok.addEventListener('click', (e) => { e.preventDefault(); submit(); });
  });
}

/* ─── openDrawer ──────────────────────────────────────────────────────────── */
export function openDrawer({ title, content, foot, onClose, wide = false } = {}) {
  // close any existing drawer first
  document.querySelectorAll('.drawer-overlay,.drawer').forEach((n) => n.remove());

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';

  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  if (wide) drawer.style.setProperty('--drawer-w', '720px');

  const head = document.createElement('header');
  head.className = 'drawer-head';
  const h = document.createElement('h3');
  h.textContent = title || '';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'إغلاق');
  closeBtn.innerHTML = '✕';
  head.append(h, closeBtn);

  const body = document.createElement('div');
  body.className = 'drawer-body';
  if (content instanceof Node) body.appendChild(content);
  else if (typeof content === 'string') body.innerHTML = content;

  const footEl = document.createElement('footer');
  footEl.className = 'drawer-foot';
  if (foot instanceof Node) footEl.appendChild(foot);
  if (!foot) footEl.style.display = 'none';

  drawer.append(head, body, footEl);
  document.body.append(overlay, drawer);
  document.body.style.overflow = 'hidden';

  const close = () => {
    overlay.remove(); drawer.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escHandler);
    if (typeof onClose === 'function') onClose();
  };
  const escHandler = (e) => { if (e.key === KEY_NO) close(); };
  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', escHandler);

  return {
    el: drawer,
    body,
    foot: footEl,
    close,
    setFoot(node) {
      footEl.innerHTML = '';
      if (node instanceof Node) { footEl.appendChild(node); footEl.style.display = ''; }
      else footEl.style.display = 'none';
    },
    setTitle(t) { h.textContent = t || ''; },
  };
}

/* ─── Mobile sidebar helper ───────────────────────────────────────────────── */
export function bindMobileSidebar(sidebarEl, hamburgerEl) {
  if (!sidebarEl || !hamburgerEl) return;
  let scrim = null;
  const open = () => {
    sidebarEl.classList.add('is-open');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'sidebar-scrim';
      document.body.appendChild(scrim);
      scrim.addEventListener('click', close);
    }
  };
  const close = () => {
    sidebarEl.classList.remove('is-open');
    if (scrim) { scrim.remove(); scrim = null; }
  };
  hamburgerEl.addEventListener('click', () => {
    if (sidebarEl.classList.contains('is-open')) close(); else open();
  });
  // Auto-close on nav click
  sidebarEl.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) {
      if (window.matchMedia('(max-width: 960px)').matches) close();
    }
  });
}

export default { showToast, showConfirm, showPrompt, showMessage, showFormModal, openDrawer, bindMobileSidebar };
