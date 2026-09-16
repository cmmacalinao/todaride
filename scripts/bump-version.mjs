// Bumps the build number by exactly one, every time this runs — and this
// runs as the first step of every real deploy (see package.json's
// deploy:web and release scripts), never on its own. So "the version on
// screen changed" and "a deploy actually happened" stay the same fact,
// which is the whole point: a tester reading v5D.2 vs v5D.3 off two
// screenshots can tell those are two different releases without needing
// the git log open next to them.
//
// android/app/build.gradle is kept as the one file both sides read —
// vite.config.ts's buildLabel() already pulls versionName from here for
// the web label, and the installed APK's own Settings > Apps entry is
// this same field, by definition. Bumping it here rather than inventing a
// second counter file means the phone and the website can never disagree
// about which number is current — the thing the BuildLabel comment already
// promises.
//
// versionCode (the plain integer Android needs, strictly increasing) moves
// in lockstep with versionName's patch number — they've tracked each other
// since this file's first line, and giving them separate cadences would be
// a second thing to keep in sync for no benefit.
//
// This is committed and pushed as its own step, immediately, rather than
// folded into whatever commit prompted the deploy — a deploy is allowed to
// ship several already-committed changes at once, and the version bump is
// not really "part of" any one of them.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gradlePath = resolve(root, 'android/app/build.gradle')
const gradle = readFileSync(gradlePath, 'utf8')

const codeMatch = gradle.match(/versionCode\s+(\d+)/)
const nameMatch = gradle.match(/versionName\s+"([^"]+)"/)
if (!codeMatch || !nameMatch) {
  console.error('Could not find versionCode/versionName in android/app/build.gradle — not bumping.')
  process.exit(1)
}

const oldCode = Number(codeMatch[1])
const oldName = nameMatch[1]
// "5D.1" -> prefix "5D", patch 1. Anything after the last dot is the part
// that moves; everything before it (the branch-era label, "5D") is left
// alone — that changes on purpose, by hand, when the project itself moves
// to a new era, not as a side effect of a deploy.
const dot = oldName.lastIndexOf('.')
if (dot === -1 || !/^\d+$/.test(oldName.slice(dot + 1))) {
  console.error(`versionName "${oldName}" doesn't end in ".<number>" — not bumping. Edit it by hand once to fix the shape, then this will take over.`)
  process.exit(1)
}
const prefix = oldName.slice(0, dot)
const oldPatch = Number(oldName.slice(dot + 1))
const newPatch = oldPatch + 1
const newName = `${prefix}.${newPatch}`
const newCode = oldCode + 1

const updated = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${newCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${newName}"`)
writeFileSync(gradlePath, updated)
console.log(`Version bumped: ${oldName} (code ${oldCode}) -> ${newName} (code ${newCode})`)

function git(args) {
  execFileSync('git', args, { cwd: root, stdio: 'inherit' })
}

try {
  git(['add', 'android/app/build.gradle'])
  git(['commit', '-m', `Bump version to ${newName}`])
  git(['push'])
  console.log('Committed and pushed the version bump.')
} catch (err) {
  console.error('Version file was bumped locally, but the commit/push failed:', err.message)
  console.error('The deploy will continue with the new number either way — commit android/app/build.gradle by hand.')
}
