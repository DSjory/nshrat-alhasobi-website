import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        episodes_ar: resolve(__dirname, 'episodes_ar.html'),
        episodes_en: resolve(__dirname, 'episodes_en.html'),
        join: resolve(__dirname, 'join.html'),
        single: resolve(__dirname, 'single-episode.html'),
        admin_index: resolve(__dirname, 'admin_cms/index.html'),
        admin_dashboard: resolve(__dirname, 'admin_cms/dashboard.html'),
        admin_editor: resolve(__dirname, 'admin_cms/editor.html')
      }
    }
  },
  server: {
    port: 5173
  }
});
