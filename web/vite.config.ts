import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Rider and driver are separate apps: index.html serves rider paths,
// driver.html serves /provide and /drive paths. In production the Express
// server does this per-prefix; this plugin mirrors it for the dev server.
function driverAppFallback(): Plugin {
  return {
    name: 'driver-app-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || '';
        if (url.startsWith('/provide') || url.startsWith('/drive')) {
          req.url = '/driver.html';
        }
        next();
      });
    },
  };
}

// Where `npm run dev` proxies API calls. Overridable so a second operator
// can be run on another port when 3000 is already taken.
const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), driverAppFallback()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/info': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/rides': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        rider: path.resolve(__dirname, 'index.html'),
        driver: path.resolve(__dirname, 'driver.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
