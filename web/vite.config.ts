import { defineConfig, type Plugin } from 'vite';
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
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/info': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/rides': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
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
});
