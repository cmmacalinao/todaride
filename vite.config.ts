import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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
// Hands out the built APK on the dev server, at the same path the deployed
// site serves it from.
//
// The APK deliberately does not live in public/. Capacitor copies the whole
// web output into the APK, so a copy sitting there would put the previous
// build inside the next one and double the download every time — which is
// why the deploy stages it into dist/ afterwards instead (see
// scripts/stage-apk.mjs). That leaves the dev server with nothing at
// /TodaSafeRide.apk, and Vite's SPA fallback answering it with index.html:
// 200 OK, an .apk filename, and HTML inside. Android rejects that as a
// corrupt package, which looks like a broken build rather than a missing
// file.
//
// So dev reads it straight from the Gradle output. apply: 'serve' — this
// never exists in a build, and so can never end up inside an APK.
function apkForDev(): Plugin {
  return {
    name: 'toda-apk-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/TodaSafeRide.apk', (_req, res) => {
        const built = resolve(process.cwd(), 'android/app/build/outputs/apk/release/app-release.apk')
        if (!existsSync(built)) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/plain')
          res.end('No APK built yet. Run: npm run apk')
          return
        }
        const bytes = readFileSync(built)
        res.setHeader('Content-Type', 'application/vnd.android.package-archive')
        res.setHeader('Content-Length', String(bytes.length))
        res.setHeader('Content-Disposition', 'attachment; filename="TodaSafeRide.apk"')
        res.end(bytes)
      })
    },
  }
}

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
            if (!/^[\w./-]+\.(png|svg|webp)$/.test(file) || file.includes('..')) {
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

// What build is this, in a form somebody can read out over a phone call.
//
// Written in at build time because there is nothing at runtime that knows:
// the web page and the installed APK are the same bundle served two ways, and
// "the change isn't showing" is impossible to diagnose without being able to
// tell which of them somebody is holding. A tester reads the corner of their
// own screen instead.
//
// versionName is taken from the Android project so the phone and the website
// speak the same language — 5B.4 on the page is 5B.4 in Settings > Apps. The
// commit is what actually distinguishes two builds carrying one versionName,
// which is every web deploy made without rebuilding the APK.
//
// Both lookups fail soft: a checkout without git, or a tree without the
// Android project, still builds. An unknown label is better than no build.
// The Android project's own idea of the version. The label below and the
// in-app update check both read it, so the phone and the website can never
// disagree about which build is newer. Empty when there is no Android
// project here.
function readGradleVersion(): { name: string; code: number } {
  try {
    const gradle = readFileSync('android/app/build.gradle', 'utf8')
    return {
      name: gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? '',
      code: Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0),
    }
  } catch {
    return { name: '', code: 0 }
  }
}

function buildLabel(): string {
  const version = readGradleVersion().name
  let commit = ''
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    /* not a git checkout, or git is not installed */
  }
  return [version && `v${version}`, commit].filter(Boolean).join(' · ') || 'dev'
}

export default defineConfig({
  define: {
    __BUILD_LABEL__: JSON.stringify(buildLabel()),
    // The numeric versionCode, so the installed app can compare itself with
    // the one the website is handing out — see lib/appUpdate. 0 when unknown,
    // which that check reads as "do not ask".
    __BUILD_CODE__: JSON.stringify(readGradleVersion().code),
  },
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
    apkForDev(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        // What appears under the icon once it is on a home screen, so it is
        // the name the app is actually known by rather than the internal one.
        name: 'TODA SafeRide',
        short_name: 'SafeRide',
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
        // Long-press the home-screen icon and these are what the phone
        // offers. Three jobs, because three is what Android shows: the two
        // ways a passenger starts a trip, and the driver's own screen. Each
        // lands on a real route — a shortcut into a page that does not exist
        // is worse than no shortcut.
        shortcuts: [
          {
            name: 'Book a ride',
            short_name: 'Book',
            description: 'Set your pickup and destination',
            url: '/book',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Sakay sa terminal',
            short_name: 'Terminal',
            description: 'Record a ride you are already taking',
            url: '/book/start',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Driver',
            short_name: 'Drive',
            description: 'Your requests, queue and earnings',
            url: '/drive',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
})
