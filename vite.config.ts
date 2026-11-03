import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const release = process.env['MMS_RELEASE_ID']
if (release && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(release)) {
  throw new Error('Invalid MMS_RELEASE_ID')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  ...(process.env['MMS_EDITOR_SPIKE'] === '1'
    ? { preview: { headers: { 'Cache-Control': 'no-store' } } }
    : {}),
  build: {
    ...(process.env['MMS_EDITOR_SPIKE'] === '1'
      ? {
          rollupOptions: {
            input: {
              app: 'index.html',
              editorSpike: 'scripts/editor-spike.html',
              editorCost: 'scripts/editor-cost.html',
            },
          },
        }
      : {}),
    assetsDir: release ? `assets/${release}` : 'assets',
    // The Strudel engine is a ~650 kB chunk, loaded lazily on first Play.
    chunkSizeWarningLimit: 800,
  },
})
