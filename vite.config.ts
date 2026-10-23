// Core
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
// Utils
import { pdfAssets } from './build/pdfAssets'

// Pin the only trusted inline bridge. A changed runtime must update the deploy CSP.
const readerBridge = readFileSync(new URL('./src/components/FlowView/flowBridge/flowBridgeRuntime.js', import.meta.url), 'utf8')
const bridgeHash = `sha256-${createHash('sha256').update(readerBridge).digest('base64')}`
const deployment = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
const contentPolicy = deployment.headers.flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers).find((header: { key: string }) => header.key === 'Content-Security-Policy')?.value ?? ''
if (!contentPolicy.includes(`'${bridgeHash}'`) || /<\/script/i.test(readerBridge)) throw new Error(`Reader bridge CSP mismatch. Set script-src to include '${bridgeHash}' and keep the runtime free of closing script tags.`)

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // jsmediatags ships a broken `browser` entry; point at the built UMD bundle.
      jsmediatags: path.resolve(__dirname, './node_modules/jsmediatags/dist/jsmediatags.min.js'),
    },
  },
  plugins: [
    react(),
    pdfAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/favicon-64.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-512-maskable.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        // Explicit, globally-unique app identity. Without this, iOS derives identity
        // from start_url ('/') and can confuse this app with other root-scoped PWAs.
        id: '/local-beat',
        name: 'Local Beat — Offline Music Player',
        short_name: 'Local Beat',
        description: 'Your personal offline music player. Your files, your playlists, no accounts.',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only. Music files live in IndexedDB, never in the Cache API.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}', 'pdf-assets/**/*'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
