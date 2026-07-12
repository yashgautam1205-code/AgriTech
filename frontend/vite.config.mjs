import { defineConfig } from 'vite'

// Vite dev server proxy: forwards /api calls to the backend
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
