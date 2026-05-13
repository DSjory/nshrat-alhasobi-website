// js/rich-text.js
// Shared sanitizer + helpers used by the CMS editor and the public renderer.
// Single source of truth for what HTML is allowed in user-pasted content.

import DOMPurify from 'dompurify';

export const RICH_TEXT_TAGS = [
  'a', 'b', 'strong', 'i', 'em', 'u',
  'br', 'p', 'div', 'span',
  'ul', 'ol', 'li',
  'blockquote', 'code',
];

export const RICH_TEXT_ATTR = ['href', 'target', 'rel'];

export const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: RICH_TEXT_TAGS,
  ALLOWED_ATTR: RICH_TEXT_ATTR,
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'svg', 'math', 'img', 'link', 'meta'],
  FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  ALLOW_DATA_ATTR: false,
  KEEP_CONTENT: true,
};

let hooksInstalled = false;
function installPurifyHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^\s*javascript:/i.test(href)) {
        node.removeAttribute('href');
      }
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
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
