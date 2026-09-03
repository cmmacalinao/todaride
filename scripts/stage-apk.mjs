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
//
// It also writes app-version.json beside the APK: the version the website is
// handing out, read from build.gradle so it is the same number the APK was
// built with. The installed app fetches it on launch and compares it with its
// own (see src/lib/appUpdate.ts) — the only way a sideloaded app finds out a
// newer one exists. Two fields come from app-update.json in the repo root
// rather than from the build: "required", for a build the old app cannot do
// without, and "notes", a line telling testers what changed. Both are edited
// by hand and committed; this file only copies them through.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'android/app/build/outputs/apk/release/app-release.apk')
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

const gradle = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8')
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1] ?? 0)
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? ''
if (!versionCode || !versionName) {
  console.error('Could not read versionCode / versionName from android/app/build.gradle')
  process.exit(1)
}
let extra = { required: false, notes: '' }
const knobs = resolve(root, 'app-update.json')
if (existsSync(knobs)) {
  const k = JSON.parse(readFileSync(knobs, 'utf8'))
  extra = { required: k.required === true, notes: typeof k.notes === 'string' ? k.notes : '' }
}
writeFileSync(
  resolve(root, 'dist/app-version.json'),
  JSON.stringify({ versionCode, versionName, apkUrl: '/TodaSafeRide.apk', ...extra }, null, 2) + '\n',
)
console.log(`Wrote app-version.json — ${versionName} (code ${versionCode})${extra.required ? ', REQUIRED' : ''}`)
