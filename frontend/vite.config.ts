import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Django API runs on :8000 in development; proxy it so the browser sees one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
