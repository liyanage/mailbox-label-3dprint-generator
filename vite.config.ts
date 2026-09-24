import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'esnext' },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['harfbuzzjs', 'manifold-3d'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
