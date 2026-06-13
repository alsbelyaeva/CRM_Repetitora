import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function parseAllowedHosts() {
  const value = process.env.VITE_ALLOWED_HOSTS;
  if (!value) return undefined;

  return value
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
}

// vite.config.ts
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    allowedHosts: parseAllowedHosts(),
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
