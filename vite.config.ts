/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The route worker imports the scientific engine as ES modules.
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: {
        // Keep the map, chart and engine libraries out of the app chunk so they cache separately.
        codeSplitting: {
          groups: [
            { name: 'leaflet', test: /node_modules[\\/](leaflet|react-leaflet)/ },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory-vendor)/ },
            { name: 'engine', test: /scientific-engine[\\/]dist/ },
            { name: 'ui', test: /node_modules[\\/](radix-ui|@radix-ui|@floating-ui)/ },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Frontend tests only. The engine package runs its own suite (npm run test:engine).
    include: ['src/**/*.test.{ts,tsx}'],
    // Unit and UI tests exercise the deterministic mock adapters. Tests of the real adapters
    // import them directly and load the bundled Jezero assets from disk.
    env: { VITE_DATA_MODE: 'mock' },
  },
})
