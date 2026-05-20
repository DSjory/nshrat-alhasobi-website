// admin_cms/js/rich-text-field.js
//
// Quill-2 backed rich-text field — defensive edition.
//
// Design goals after the prod incident where an empty editor form rendered:
//
//   1. Zero side-effects at module load time. Anything that can throw is
//      deferred into the factory + wrapped in try/catch. Importing this
//      module never breaks editor.js.
//
//   2. Graceful degradation. If Quill fails to initialise for any reason
//      (CDN issue, version mismatch, missing attributor) the field falls
//      back to a plain <textarea> + paste-preserving helper so the user
//      can still create / edit content.
//
//   3. Public-site compatibility. Quill's default Align/Direction blots
//      write `class="ql-align-X"` / `class="ql-direction-X"`. The public
//      renderer doesn't load Quill's CSS, so we normalise those to inline
//      `style="text-align:X"` / `dir="X"` markup AT SAVE TIME (in getHtml).
//      This is more robust than registering style-attributors at boot.
//
//   4. Same API as before so editor.js does not change:
//        createRichTextField({ initialHtml?, dir?, placeholder?, minHeight? })
//          → { el, editor, focus, clear, setHtml, getHtml }
//
// • Arabic instance  → dir="rtl", text-align right by default, "AR" badge
// • English instance → dir="ltr", text-align left by default,  "EN" badge

import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { sanitizeRichText, textToSafeHtml } from '/js/rich-text.js';

/* ─── Class → inline-style normaliser ─────────────────────────────────────── */
/*  Runs on the HTML Quill emits, before sanitisation. The public renderer can
 *  then show alignment without loading Quill's stylesheet.                    */
function normalizeQuillClasses(html) {
  if (!html || html.indexOf('ql-') === -1) return html;
  return html
    // Combined classes (direction + align), both orderings
    .replace(/class="ql-direction-(rtl|ltr)\s+ql-align-(center|right|justify|left)"/gi,
             'dir="$1" style="text-align: $2"')
    .replace(/class="ql-align-(center|right|justify|left)\s+ql-direction-(rtl|ltr)"/gi,
             'style="text-align: $1" dir="$2"')
    // Single-class cases
    .replace(/class="ql-align-center"/gi,  'style="text-align: center"')
    .replace(/class="ql-align-right"/gi,   'style="text-align: right"')
    .replace(/class="ql-align-justify"/gi, 'style="text-align: justify"')
    .replace(/class="ql-align-left"/gi,    'style="text-align: left"')
    .replace(/class="ql-direction-rtl"/gi, 'dir="rtl"')
    .replace(/class="ql-direction-ltr"/gi, 'dir="ltr"');
}

function isVisiblyEmpty(html) {
  if (!html) return true;
  const stripped = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  return stripped.length === 0;
}

/* ─── Plain-textarea fallback (used when Quill init throws) ───────────────── */
function createTextareaFallback({ wrap, host, initialHtml, dir, placeholder, minHeight }) {
  // Replace the host element with a textarea.
  host.remove();
  const ta = document.createElement('textarea');
  ta.className = 'input rt-fallback';
  ta.dir = dir;
  ta.style.minHeight = minHeight;
  ta.style.width = '100%';
  ta.placeholder = placeholder || '';

  // Initial value: keep visible text only (no HTML tags in a textarea).
  ta.value = (initialHtml || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

  // Preserve paste formatting → safe HTML (line breaks + spacing).
  ta.addEventListener('paste', (ev) => {
    const html  = ev.clipboardData?.getData('text/html')  || '';
    const plain = ev.clipboardData?.getData('text/plain') || '';
    if (html && html.trim()) {
      ev.preventDefault();
      // Show the user the text equivalent in the textarea; on save we'll
      // re-sanitise the pasted HTML into the DB.
      const stripped = html.replace(/<[^>]+>/g, '');
      ta._pastedHtml = sanitizeRichText(html);
      const start = ta.selectionStart, end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + stripped + ta.value.slice(end);
    } else if (plain) {
      ta._pastedHtml = null; // user can type plain
    }
  });

  wrap.appendChild(ta);
  return {
    el:     wrap,
    editor: ta,
    quill:  null,
    focus:  () => ta.focus(),
    clear:  () => { ta.value = ''; ta._pastedHtml = null; },
    setHtml(html) {
      ta._pastedHtml = sanitizeRichText(html || '');
      ta.value = (html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    },
    getHtml() {
      if (ta._pastedHtml && !isVisiblyEmpty(ta._pastedHtml)) return ta._pastedHtml;
      const plain = ta.value;
      if (!plain.trim()) return '';
      return sanitizeRichText(textToSafeHtml(plain));
    },
  };
}

/* ─── Toolbar spec — exported as a function so it's built fresh per field ─── */
function buildToolbarSpec() {
  return [
    ['bold', 'italic', 'underline', 'strike'],
    [{ header: 2 }, { header: 3 }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'link'],
    [{ align: '' }, { align: 'center' }, { align: 'right' }, { align: 'justify' }],
    ['clean'],
  ];
}

const ALLOWED_FORMATS = [
  'bold', 'italic', 'underline', 'strike',
  'list', 'header', 'blockquote', 'link', 'align',
];

/* ─── Public factory ──────────────────────────────────────────────────────── */
export function createRichTextField({
  initialHtml = '',
  dir         = 'rtl',
  placeholder = '',
  minHeight   = '10em',
} = {}) {
  const isRtl = dir === 'rtl';

  const wrap = document.createElement('div');
  wrap.className = `rt-field rt-field--${isRtl ? 'rtl' : 'ltr'}`;
  wrap.dir = dir;

  // Language badge (always rendered, even on fallback)
  const badge = document.createElement('span');
  badge.className = 'rt-lang-badge';
  badge.textContent = isRtl ? 'عربي · RTL' : 'English · LTR';
  badge.setAttribute('aria-hidden', 'true');
  wrap.appendChild(badge);

  const host = document.createElement('div');
  host.className = 'rt-host';
  host.style.minHeight = minHeight;
  wrap.appendChild(host);

  // Try Quill — anything that throws drops us into the textarea fallback.
  let quill;
  try {
    quill = new Quill(host, {
      theme: 'snow',
      placeholder,
      formats: ALLOWED_FORMATS,
      modules: {
        toolbar:   buildToolbarSpec(),
        clipboard: {},
      },
    });
  } catch (err) {
    console.error('[rich-text-field] Quill init failed — falling back to textarea:', err);
    return createTextareaFallback({ wrap, host, initialHtml, dir, placeholder, minHeight });
  }

  // Anchor the default writing direction for an empty editor.
  function applyDefaultDirectionIfEmpty() {
    try {
      if (quill.getLength() > 1) return; // user already has content
      // Quill's default Align attributor uses classes; we'll convert at save
      // time so the badge of class names doesn't leak to the public site.
      quill.formatLine(0, 1, {
        align: isRtl ? 'right' : '',
      });
    } catch (e) { /* non-fatal */ }
  }

  function setHtml(html) {
    try {
      const clean = sanitizeRichText(html || '');
      quill.setContents([]);
      if (clean) {
        const delta = quill.clipboard.convert({ html: clean });
        quill.setContents(delta);
      }
      applyDefaultDirectionIfEmpty();
    } catch (e) {
      console.error('[rich-text-field] setHtml failed:', e);
    }
  }

  function getHtml() {
    try {
      let html = quill.root?.innerHTML || '';
      // Drop Quill's empty-paragraph placeholder.
      if (isVisiblyEmpty(html)) return '';
      // Class → inline-style normalisation so the public site renders
      // alignment without loading Quill's CSS.
      html = normalizeQuillClasses(html);
      return sanitizeRichText(html);
    } catch (e) {
      console.error('[rich-text-field] getHtml failed:', e);
      return '';
    }
  }

  // Initial population.
  if (initialHtml) setHtml(initialHtml);
  else             applyDefaultDirectionIfEmpty();

  return {
    el:     wrap,
    editor: quill.root,             // editor.js wires 'input' listener on this
    quill,
    focus:  () => { try { quill.focus(); } catch (e) {} },
    clear:  () => { try { quill.setContents([]); applyDefaultDirectionIfEmpty(); } catch (e) {} },
    setHtml,
    getHtml,
  };
}
