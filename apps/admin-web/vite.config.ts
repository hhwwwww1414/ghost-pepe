import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API base is injected at build/runtime via VITE_API_BASE_URL.
export default defineConfig({
  plugins: [react()],
  server: { port: 8083, host: '0.0.0.0' },
  build: { outDir: 'dist' },
});
