// Copies the built APK into dist/ so the website can hand it out.
//
// The ordering this depends on is the whole point of the file, so it is worth
// stating plainly: the APK must be copied in AFTER `npx cap sync android`,
// never before.
//
// Capacitor builds the app by copying the entire web output into
// android/app/src/main/assets/public. Anything sitting in dist/ at that moment
// goes inside the APK. Put the APK in public/ — the obvious place — and every
// build wraps the previous APK inside the new one, doubling the download each
// time for a file nobody in the app can use.
//
// So dist/ is the app, and the APK is added to it only on the way to Netlify:
//
//   npm run build          # dist/ = the app
//   npx cap sync android   # APK gets a copy of dist/, with no APK in it
//   npm run apk            # builds the APK
//   npm run stage:apk      # dist/ += the APK
//   netlify deploy         # ships dist/
//
// dist/ is rebuilt from scratch by every build, so this runs each time — the
// staged copy is deliberately not permanent.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'android/app/build/outputs/apk/debug/app-debug.apk')
const target = resolve(root, 'dist/TodaSafeRide.apk')

if (!existsSync(source)) {
  console.error(`No APK at ${source}\nBuild one first: npm run apk`)
  process.exit(1)
}
if (!existsSync(resolve(root, 'dist'))) {
  console.error('No dist/ — run npm run build first.')
  process.exit(1)
}

mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
const mb = (statSync(target).size / 1024 / 1024).toFixed(1)
console.log(`Staged TodaSafeRide.apk (${mb} MB) into dist/ — it will be served at /TodaSafeRide.apk`)
