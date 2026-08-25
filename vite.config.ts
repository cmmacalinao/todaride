import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Lets the running app write its terminal list back into the repo's seed
// file. Terminals are placed by someone standing at the gate with a phone,
// and until now that work lived only in that browser's storage — invisible
// to every other device and lost with a cleared cache. This is dev-server
// only: it never exists in a build, and it writes exactly one known path.
// Writes a recoloured image back into public/ during development.
//
// The logo is a flat PNG, so a colour change is a pixel operation, not a CSS
// one — and the only place in this toolchain that can decode a PNG is the
// browser's own canvas. So the browser does the work and hands the result
// back here to be saved. Dev-only, like the terminal seed writer beside it,
// and it keeps a .bak of whatever it overwrites.
function assetWriter(): Plugin {
  return {
    name: 'toda-asset-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__asset', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            const { file, dataUrl } = JSON.parse(body) as { file: string; dataUrl: string }
            // Only ever inside public/, and only image files.
            if (!/^[\w./-]+\.(png|svg)$/.test(file) || file.includes('..')) {
              throw new Error('refusing to write ' + file)
            }
            const target = resolve(process.cwd(), 'public', file)
            const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
            const bytes = Buffer.from(base64, 'base64')
            if (existsSync(target)) copyFileSync(target, target + '.bak')
            writeFileSync(target, bytes)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, file, bytes: bytes.length }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}

function terminalSeedWriter(): Plugin {
  return {
    name: 'toda-terminal-seed-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__seed/terminals', (req, res, next) => {
        if (req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk
        })
        req.on('end', () => {
          try {
            const terminals = JSON.parse(body)
            if (!Array.isArray(terminals)) throw new Error('expected an array of terminals')
            writeFileSync(
              resolve(process.cwd(), 'src/mock/terminals.seed.json'),
              JSON.stringify(terminals, null, 2) + '\n',
              'utf8',
            )
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, count: terminals.length }))
          } catch (err) {
            res.statusCode = 400
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  server: {
    port: 5192,
    strictPort: true,
    // Lets the app be reached through a Cloudflare quick tunnel (see
    // `npx cloudflared tunnel --url http://localhost:5192`) for sharing a
    // trial link with people off this machine — Vite otherwise rejects any
    // request whose Host header it doesn't recognize (DNS-rebinding guard).
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    port: 4192,
    strictPort: true,
  },
  plugins: [
    terminalSeedWriter(),
    assetWriter(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TodaRide — SaaS Model',
        short_name: 'TodaRide SaaS',
        description:
          'Safe Ride, Safe Arrival — on-demand tricycle booking with student safety tracking (TaaS/SaaS model — each TODA, Operator, and Franchise subscribes as its own licensed partner)',
        theme_color: '#1e3a8a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
})
