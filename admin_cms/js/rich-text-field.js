// admin_cms/js/rich-text-field.js
// Factory for a contentEditable rich-text field with a small toolbar
// (Bold / Italic / Link / Clear) and a sanitizing paste handler.

import { sanitizeRichText, textToSafeHtml } from '/js/rich-text.js';
import { showPrompt } from '/admin_cms/ui.js';

function insertHtmlAtCursor(html) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    document.execCommand('insertHTML', false, html);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const template = document.createElement('template');
  template.innerHTML = html;
  const frag = template.content;
  const lastNode = frag.lastChild;
  range.insertNode(frag);
  if (lastNode) {
    const newRange = document.createRange();
    newRange.setStartAfter(lastNode);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }
}

function makeToolbarButton({ label, title, html, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rt-btn';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  if (html) btn.innerHTML = html;
  else btn.textContent = label;
  btn.addEventListener('mousedown', (e) => e.preventDefault()); // keep selection
  btn.addEventListener('click', (e) => { e.preventDefault(); onClick(); });
  return btn;
}

export function createRichTextField({
  initialHtml = '',
  dir = 'rtl',
  placeholder = '',
  minHeight = '8em',
} = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'rt-field';

  const toolbar = document.createElement('div');
  toolbar.className = 'rt-toolbar';
  toolbar.setAttribute('role', 'toolbar');

  const editor = document.createElement('div');
  editor.className = 'rt-editor input';
  editor.contentEditable = 'true';
  editor.dir = dir;
  editor.style.minHeight = minHeight;
  if (placeholder) editor.dataset.placeholder = placeholder;
  editor.innerHTML = sanitizeRichText(initialHtml);

  const runCmd = (cmd, value = null) => {
    editor.focus();
    document.execCommand(cmd, false, value);
  };

  const boldBtn = makeToolbarButton({
    label: 'B',
    title: 'عريض (Bold)',
    html: '<strong>B</strong>',
    onClick: () => runCmd('bold'),
  });
  const italicBtn = makeToolbarButton({
    label: 'I',
    title: 'مائل (Italic)',
    html: '<em>I</em>',
    onClick: () => runCmd('italic'),
  });
  const linkBtn = makeToolbarButton({
    label: '🔗',
    title: 'إضافة رابط (Link)',
    html: '🔗',
    onClick: async () => {
      const sel = window.getSelection();
      const savedRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null;
      const url = await showPrompt('رابط (URL):', 'https://');
      if (!url) return;
      const trimmed = String(url).trim();
      if (!trimmed || /^javascript:/i.test(trimmed)) return;
      editor.focus();
      if (savedRange) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const currentSel = window.getSelection();
      if (currentSel && !currentSel.isCollapsed) {
        document.execCommand('createLink', false, trimmed);
      } else {
        const safeHref = trimmed.replace(/"/g, '&quot;');
        const safeText = trimmed.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        insertHtmlAtCursor(`<a href="${safeHref}">${safeText}</a>`);
      }
      // Normalise links so they always open in a new tab.
      editor.querySelectorAll('a[href]').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
    },
  });
  const clearBtn = makeToolbarButton({
    label: '✕',
    title: 'إزالة التنسيق (Clear formatting)',
    html: '✕',
    onClick: () => {
      runCmd('removeFormat');
      runCmd('unlink');
    },
  });

  toolbar.append(boldBtn, italicBtn, linkBtn, clearBtn);

  editor.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const html = ev.clipboardData?.getData('text/html') || '';
    const plain = ev.clipboardData?.getData('text/plain') || '';
    const incoming = html && html.trim() ? html : textToSafeHtml(plain);
    const clean = sanitizeRichText(incoming);
    insertHtmlAtCursor(clean);
  });

  // Strip pasted/dropped images that bypass paste (drag-and-drop)
  editor.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const plain = ev.dataTransfer?.getData('text/plain') || '';
    if (plain) insertHtmlAtCursor(sanitizeRichText(textToSafeHtml(plain)));
  });

  wrap.append(toolbar, editor);

  return {
    el: wrap,
    editor,
    focus: () => editor.focus(),
    clear: () => { editor.innerHTML = ''; },
    setHtml(html) { editor.innerHTML = sanitizeRichText(html || ''); },
    getHtml() {
      const cleaned = sanitizeRichText(editor.innerHTML);
      // Treat an editor whose only content is whitespace / empty tags as empty.
      const textOnly = cleaned.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      return textOnly ? cleaned : '';
    },
  };
}
