const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = process.cwd();
const srcAdmin = path.join(root, 'admin_cms');
const destAdmin = path.join(root, 'dist', 'admin_cms');
const srcJs = path.join(root, 'js');
const destJs = path.join(root, 'dist', 'js');
const srcAssets = path.join(root, 'assets');
const destAssets = path.join(root, 'dist', 'assets');

try {
  copyDir(srcAdmin, destAdmin);
  console.log('Copied admin_cms to dist/admin_cms');
  // Also copy top-level JS folder so admin HTML can load /js/* paths
  copyDir(srcJs, destJs);
  console.log('Copied js to dist/js');
  // Copy static assets (images, icons) so image paths referenced by HTML work
  copyDir(srcAssets, destAssets);
  console.log('Copied assets to dist/assets');
} catch (err) {
  console.error('Failed to copy static files:', err);
  process.exit(1);
}
