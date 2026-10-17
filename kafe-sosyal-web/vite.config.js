import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Geliştirmede /v1 istekleri backend'e (varsayılan :3000) yönlendirilir; CORS gerekmez.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/v1': process.env.API_URL || 'http://localhost:3000' },
  },
});
