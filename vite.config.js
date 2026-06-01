import { defineConfig } from 'vite';

export default defineConfig({
  css: {
    postcss: {
      plugins: []
    }
  },
  server: {
    host: true, // Listen on all local IP addresses
    port: 5173,
    strictPort: true
  }
});
