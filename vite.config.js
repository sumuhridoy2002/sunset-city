import { defineConfig } from 'vite';

// Relative base keeps the production build portable (file servers, itch.io, etc.).
export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    // Rapier's compat build embeds a ~3 MB WASM payload; the large single chunk
    // is intentional for zero-network-asset loading.
    chunkSizeWarningLimit: 6000,
  },
});
