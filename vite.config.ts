import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  optimizeDeps: {
    esbuildOptions: {
      minifyIdentifiers: true,
    },
  },
  plugins: [
    react(),
    nodePolyfills({
      include: ['stream', 'util', 'timers'],
      globals: {
        Buffer: true,
        global: false,
        process: false,
      },
    }),
  ],
  build: {
    outDir: './web-dir',
  },
  server: {
    host: '0.0.0.0',
    port: 3065,
    hmr: {
      port: 1234,
    },
    proxy: {
      '/api': 'http://0.0.0.0:5000',
    },
  },
});
