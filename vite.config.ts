import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const release = process.env['MMS_RELEASE_ID']
if (release && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(release)) {
  throw new Error('Invalid MMS_RELEASE_ID')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    assetsDir: release ? `assets/${release}` : 'assets',
    // The Strudel engine is a ~650 kB chunk, loaded lazily on first Play.
    chunkSizeWarningLimit: 800,
  },
})
