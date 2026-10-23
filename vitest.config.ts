// Core
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      jsmediatags: path.resolve(__dirname, './node_modules/jsmediatags/dist/jsmediatags.min.js'),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Keep Node's experimental Web Storage from shadowing jsdom's real Storage.
    execArgv: ['--no-experimental-webstorage'],
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
