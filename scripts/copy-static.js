// scripts/copy-static.js
//
// Runs AFTER `vite build`. Vite already emits:
//   • Every HTML page listed in vite.config.js input{} → dist/<path>.html
//   • Every JS module transitively imported → dist/assets/<hash>.js
//   • Every CSS / image referenced by HTML or JS → dist/assets/<hash>.<ext>
//
// We must NOT overwrite those — doing so puts the *source* JS (with bare
// `import 'quill'` specifiers) at the location the deployed HTML expects,
// and the browser then fails with "Failed to resolve module specifier".
//
// This script copies only the leftovers Vite doesn't process:
//   • admin_cms/env.json       (runtime-fetched config, not imported)
//   • assets/**                (image originals — Vite emits hashed copies,
//                               but some static HTML uses the unhashed path)
//
// HTML and JS source files are intentionally skipped — those live in dist/
// only through Vite's bundled, transformed output.

const fs = require('fs');
const path = require('path');

// Extensions Vite already owns — skip them when copying.
const VITE_OWNED_EXT = new Set(['.html', '.js', '.mjs', '.ts', '.css']);

function copyTree(src, dest, { skipExt = new Set(), label = '' } = {}) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  let copied = 0, skipped = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      const sub = copyTree(srcPath, destPath, { skipExt, label });
      copied  += sub.copied;
      skipped += sub.skipped;
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (skipExt.has(ext)) { skipped++; continue; }
    fs.copyFileSync(srcPath, destPath);
    copied++;
  }
  return { copied, skipped };
}

const root = process.cwd();

try {
  // admin_cms/ — skip every Vite-owned extension. Vite emits the bundled
  // editor/dashboard/login HTML + their hashed JS into dist/. Copying the
  // sources here would overwrite that and put files with bare specifiers
  // (e.g. `import Quill from 'quill'`) at the path the browser fetches,
  // which then fails with "Failed to resolve module specifier 'quill'".
  // Only files Vite does NOT process (e.g. env.json) are copied.
  const adminRes = copyTree(
    path.join(root, 'admin_cms'),
    path.join(root, 'dist', 'admin_cms'),
    { skipExt: VITE_OWNED_EXT }
  );
  console.log(`admin_cms → dist/admin_cms (${adminRes?.copied || 0} copied, ${adminRes?.skipped || 0} skipped — Vite owns those)`);

  // js/ — copy wholesale. Some public pages (episodes_ar.html, episodes_en.html,
  // join.html) load `<script src="js/search.js">` as a CLASSIC script (no
  // type="module"), so search.js must exist at /js/search.js at runtime.
  // Other js/ files are referenced only via type="module" imports — Vite
  // already bundled those into /assets/, and serving the source copies here
  // is harmless: those URLs are never requested by the deployed HTML.
  const jsRes = copyTree(
    path.join(root, 'js'),
    path.join(root, 'dist', 'js'),
    { skipExt: new Set() }
  );
  console.log(`js → dist/js (${jsRes?.copied || 0} files)`);

  // assets/ — image originals + fonts. Vite emits hashed copies of any asset
  // it sees referenced; this provides a fallback for unhashed URL references
  // (e.g. dynamic string concatenation that Vite can't statically analyse).
  const assetsRes = copyTree(
    path.join(root, 'assets'),
    path.join(root, 'dist', 'assets'),
    { skipExt: new Set() }
  );
  console.log(`assets → dist/assets (${assetsRes?.copied || 0} files)`);
} catch (err) {
  console.error('copy-static.js failed:', err);
  process.exit(1);
}
