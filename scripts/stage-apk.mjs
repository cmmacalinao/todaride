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
const target = resolve(root, 'dist/TODARideMobility.apk')

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
console.log(`Staged TODARideMobility.apk (${mb} MB) into dist/ — it will be served at /TODARideMobility.apk`)

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
// Release notes describing a different release are worse than none.
//
// AppUpdateBanner shows this text to every tester as what is new in the
// build being offered them. It said "5C.2 — Food Express…" for roughly
// thirty releases, because the field is edited by hand and nothing read it
// back.
//
// What this can honestly detect is a number, not stale prose. So it fails on
// the shape the real bug had — notes from another release line (5C while
// building 5E), or many versions behind — and tolerates the one-release lag
// that is unavoidable here, since `release` bumps the version before this
// runs and nobody can write notes for a number that does not exist yet.
const notesVersion = extra.notes.match(/\b(\d+[A-Z])\.(\d+)\b/)
const buildVersion = versionName.match(/\b(\d+[A-Z])\.(\d+)\b/)
if (extra.notes && (!notesVersion || !buildVersion)) {
  console.error(`\napp-update.json "notes" should start with the version, e.g. "${versionName} — …".\n`)
  process.exit(1)
}
if (extra.notes && notesVersion && buildVersion) {
  const sameLine = notesVersion[1] === buildVersion[1]
  const behind = Number(buildVersion[2]) - Number(notesVersion[2])
  if (!sameLine || behind < 0 || behind > 3) {
    console.error(
      `\napp-update.json "notes" are for ${notesVersion[0]}, but this build is ${versionName}:\n` +
        `  ${extra.notes.slice(0, 120)}${extra.notes.length > 120 ? '…' : ''}\n\n` +
        `Those notes are shown to testers as what is new in this build.\n` +
        `Update app-update.json, or set "notes": "" for the generic message.\n`,
    )
    process.exit(1)
  }
}
writeFileSync(
  resolve(root, 'dist/app-version.json'),
  JSON.stringify({ versionCode, versionName, apkUrl: '/TODARideMobility.apk', ...extra }, null, 2) + '\n',
)
console.log(`Wrote app-version.json — ${versionName} (code ${versionCode})${extra.required ? ', REQUIRED' : ''}`)
