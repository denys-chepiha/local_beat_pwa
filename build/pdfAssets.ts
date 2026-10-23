// Core
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Package PDF resources locally so opening a book never needs a CDN. */
export function pdfAssets(): Plugin {
  const root = path.resolve('node_modules/pdfjs-dist')
  const assets = new Map<string, Buffer>()
  for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
    for (const name of readdirSync(path.join(root, folder))) {
      // XFA fonts and the scripting engine are not used by the read-only viewer.
      const include = folder === 'cmaps' || (folder === 'standard_fonts' ? name.startsWith('Foxit') || name === 'LICENSE_FOXIT' : name === 'jbig2_nowasm_fallback.js' || name === 'openjpeg_nowasm_fallback.js' || /LICENSE.*(JBIG2|OPENJPEG)/.test(name))
      if (include) assets.set(`/pdf-assets/${folder}/${name}`, readFileSync(path.join(root, folder, name)))
    }
  }
  assets.set('/pdf-assets/LICENSE', readFileSync(path.join(root, 'LICENSE')))
  return {
    name: 'local-pdf-resources',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split('?')[0] ?? ''
        const bytes = assets.get(url)
        if (!bytes) { next(); return }
        response.setHeader('Content-Type', url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        response.end(bytes)
      })
    },
    generateBundle() { for (const [url, source] of assets) this.emitFile({ type: 'asset', fileName: url.slice(1), source }) },
  }
}
