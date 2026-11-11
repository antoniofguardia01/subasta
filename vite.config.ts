import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', cssTarget: ['chrome79', 'safari13'] },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
      '/c': { target: 'http://127.0.0.1:8787' },
    },
  },
});
