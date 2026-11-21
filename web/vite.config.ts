import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiBase } from './src/api-base';
export default defineConfig(({ mode }) => {
  const config = loadEnv(mode, process.cwd());
  apiBase(config.VITE_API_URL);
  return {
    base: config.VITE_PREVIEW === 'true' ? '/leaseflow/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
    server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3000' } } },
    build: {
      sourcemap: mode !== 'github-preview',
      outDir: mode === 'github-preview' ? 'dist-preview' : 'dist',
    },
  };
});
