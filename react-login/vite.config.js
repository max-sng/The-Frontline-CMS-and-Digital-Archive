import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Allow importing the shared stylesheet and logo from ../frontend
  server: { fs: { allow: ['..'] } }
});
