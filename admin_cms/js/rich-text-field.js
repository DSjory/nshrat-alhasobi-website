// admin_cms/js/rich-text-field.js
//
// Quill-backed rich-text field with per-instance text direction.
//
// • Arabic instance  → dir="rtl", default text-align:right, "AR" badge
// • English instance → dir="ltr", default text-align:left,  "EN" badge
//
// Toolbar: bold, italic, underline, strike · heading H2 / H3 · ordered list ·
//          bullet list · blockquote · link · align (default / center / right /
//          justify) · clear.
//
// Output: Quill emits HTML with classes like `ql-align-right` and a `dir`
// attribute. We register the *style* attributors for align and direction so the
// stored HTML uses inline `style="text-align:right"` and `dir="rtl"` — that
// way the public renderer (which doesn't load Quill's CSS) still shows the
// correct alignment.
//
// Sanitization happens in /js/rich-text.js (single source of truth, also used
// by the public renderer).
//
// Public API (unchanged):
//   createRichTextField({ initialHtml?, dir?, placeholder?, minHeight? })
//     → { el, editor, focus, clear, setHtml, getHtml }

import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { sanitizeRichText } from '/js/rich-text.js';

// Register inline-style versions of Align and Direction so Quill writes
// `style="text-align:..."` and `dir="..."` instead of class names. Public site
// then renders correctly without needing Quill's stylesheet.
const AlignStyle     = Quill.import('attributors/style/align');
const DirectionStyle = Quill.import('attributors/style/direction');
AlignStyle.whitelist     = ['center', 'right', 'justify', 'left'];
DirectionStyle.whitelist = ['rtl', 'ltr'];
Quill.register(AlignStyle,     true);
Quill.register(DirectionStyle, true);

// Bold default uses <strong>, italic uses <em>; that's already Quill's
// default for v2 — no override needed. We expose only the formats we want
// to keep the output predictable.
const ALLOWED_FORMATS = [
  'bold', 'italic', 'underline', 'strike',
  'list', 'header', 'blockquote', 'link',
  'align', 'direction',
];

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

  // Visual language badge — sits in the corner so editors always know which
  // direction this instance is committed to.
  const badge = document.createElement('span');
  badge.className = 'rt-lang-badge';
  badge.textContent = isRtl ? 'عربي · RTL' : 'English · LTR';
  badge.setAttribute('aria-hidden', 'true');
  wrap.appendChild(badge);

  const host = document.createElement('div');
  host.className = 'rt-host';
  host.style.minHeight = minHeight;
  wrap.appendChild(host);

  const quill = new Quill(host, {
    theme: 'snow',
    placeholder,
    formats: ALLOWED_FORMATS,
    modules: {
      toolbar: buildToolbarSpec(),
      clipboard: {
        // Quill 2 sanitizes paste through Delta conversion which respects the
        // formats whitelist above. We still run DOMPurify on save for defense
        // in depth.
      },
    },
  });

  // Anchor the editor's default writing direction so first-paragraph behaviour
  // matches the language pair. Quill applies these as block-level attributors.
  function applyDefaultDirection() {
    const len = quill.getLength();
    if (len > 1) return; // user already has content; don't fight them
    quill.formatLine(0, len, {
      direction: isRtl ? 'rtl' : false,
      align:     isRtl ? 'right' : false,
    });
  }

  function setHtml(html) {
    const clean = sanitizeRichText(html || '');
    quill.setContents([]);
    if (clean) {
      const delta = quill.clipboard.convert({ html: clean });
      quill.setContents(delta);
    }
    applyDefaultDirection();
  }

  function getHtml() {
    const html = quill.root.innerHTML || '';
    // Quill leaves `<p><br></p>` (an empty paragraph) for an empty editor.
    // Strip tags + nbsp to detect a truly empty value so the DB stores NULL.
    const stripped = html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/ /g, ' ')
      .trim();
    if (!stripped) return '';
    return sanitizeRichText(html);
  }

  if (initialHtml) {
    setHtml(initialHtml);
  } else {
    applyDefaultDirection();
  }

  return {
    el:      wrap,
    editor:  quill.root,                  // for `addEventListener('input', …)`
    quill,                                // escape hatch if a caller needs it
    focus:   () => quill.focus(),
    clear:   () => { quill.setContents([]); applyDefaultDirection(); },
    setHtml,
    getHtml,
  };
}
