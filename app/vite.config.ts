import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' damit die App auch unter GitHub Pages / Unterpfaden läuft
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
})
