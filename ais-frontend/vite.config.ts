import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.config.ts
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
