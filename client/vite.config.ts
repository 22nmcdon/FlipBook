import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // The game server runs separately in dev; proxy the socket through Vite.
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
