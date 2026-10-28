import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Hand-written configuration by design: the project does not use a scaffold/template.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
