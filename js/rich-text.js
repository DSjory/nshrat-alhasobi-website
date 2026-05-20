// js/rich-text.js
// Shared sanitizer + helpers used by the CMS editor and the public renderer.
// Single source of truth for what HTML is allowed in user-pasted content.

import DOMPurify from 'dompurify';

export const RICH_TEXT_TAGS = [
  // Inline
  'a', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'br', 'span',
  // Block
  'p', 'div', 'blockquote', 'pre', 'code',
  // Headings (Quill toolbar exposes H2/H3; we allow H1-H6 for safety)
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Lists
  'ul', 'ol', 'li',
  // Horizontal rule
  'hr',
];

export const RICH_TEXT_ATTR = ['href', 'target', 'rel', 'dir', 'lang', 'style'];

// Only these `style:` properties survive sanitization. Editors can align
// paragraphs but cannot inject color/background/font tricks via inline styles.
const ALLOWED_STYLE_PROPS = new Set(['text-align', 'direction']);
const ALLOWED_TEXT_ALIGN  = new Set(['left', 'right', 'center', 'justify']);
const ALLOWED_DIRECTION   = new Set(['rtl', 'ltr']);

export const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: RICH_TEXT_TAGS,
  ALLOWED_ATTR: RICH_TEXT_ATTR,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'svg', 'math', 'img', 'link', 'meta', 'style'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur', 'srcset', 'src'],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
};

let hooksInstalled = false;
function installPurifyHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Constrain anchors: drop javascript:, always force a safe target/rel pair.
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^\s*javascript:/i.test(href)) {
        node.removeAttribute('href');
      }
      if (node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }

    // Constrain inline styles: keep only text-align / direction, with a
    // whitelisted value set. Strip the attribute entirely if nothing survives.
    if (node.hasAttribute && node.hasAttribute('style')) {
      const allowed = [];
      for (const decl of node.getAttribute('style').split(';')) {
        const [rawProp, ...rest] = decl.split(':');
        if (!rawProp || !rest.length) continue;
        const prop = rawProp.trim().toLowerCase();
        const val  = rest.join(':').trim().toLowerCase().replace(/!important\s*$/, '').trim();
        if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
        if (prop === 'text-align' && !ALLOWED_TEXT_ALIGN.has(val)) continue;
        if (prop === 'direction'  && !ALLOWED_DIRECTION.has(val))  continue;
        allowed.push(`${prop}: ${val}`);
      }
      if (allowed.length) node.setAttribute('style', allowed.join('; '));
      else                 node.removeAttribute('style');
    }

    // Constrain `dir` attribute to rtl / ltr / auto.
    if (node.hasAttribute && node.hasAttribute('dir')) {
      const d = (node.getAttribute('dir') || '').toLowerCase();
      if (d !== 'rtl' && d !== 'ltr' && d !== 'auto') node.removeAttribute('dir');
    }
  });
}

export function sanitizeRichText(input) {
  installPurifyHooks();
  if (input == null) return '';
  return DOMPurify.sanitize(String(input), RICH_TEXT_CONFIG);
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function textToSafeHtml(plain) {
  if (plain == null) return '';
  const escaped = escapeHtml(String(plain));
  return escaped
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>')
    .replace(/ {2,}/g, (m) => '&nbsp;'.repeat(m.length))
    .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
}

export function looksLikeHtml(value) {
  if (typeof value !== 'string') return false;
  return /<[a-z!\/][\s\S]*?>/i.test(value);
}

// Used by the public renderer. Decides whether the stored value is HTML
// (sanitize it) or legacy plain text (escape + nl2br), so both old and new
// rows render correctly without a database migration being a hard prerequisite.
export function renderRichText(value) {
  if (value == null || value === '') return '';
  if (looksLikeHtml(value)) return sanitizeRichText(value);
  return textToSafeHtml(value);
}
