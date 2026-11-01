import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // The Strudel engine is a ~650 kB chunk, loaded lazily on first Play.
    chunkSizeWarningLimit: 800,
  },
})
