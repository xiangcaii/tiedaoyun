/**
 * Vite 配置（apps/web）。
 *
 * - /api 代理到后端：本地开发前后端分离，cookie 走同源代理避免跨域问题。
 * - 端口固定 5173，与 .env.example 的 WEB_ORIGIN 对齐。
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
