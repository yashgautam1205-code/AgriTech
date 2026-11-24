import { defineConfig } from 'vite'

// Vite dev server proxy: forwards /api calls to the backend
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
