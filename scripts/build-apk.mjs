// Builds the debug APK, finding the JDK and Android SDK itself.
//
// Gradle needs both, and neither is on PATH on the machine this was first run
// on — the JDK is a portable unzip rather than an installed package, because
// the installer hung for half an hour and a directory of files cannot hang.
// Rather than leave that as a command somebody has to remember, the search is
// written down here: JAVA_HOME if it is set, then the usual install
// locations, then the portable copy.
//
// It is spawned from Node rather than written as a shell one-liner so that
// setting the environment works the same from cmd, PowerShell and bash. npm
// scripts run in whichever of those the user happens to have.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'

function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin'))) {
    return process.env.JAVA_HOME
  }
  // A directory holding one or more JDKs; take the newest by name, which for
  // both Temurin and Microsoft's builds sorts by version.
  const parents = [
    'D:\\jdk21-portable',
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Java',
    '/usr/lib/jvm',
    '/Library/Java/JavaVirtualMachines',
  ]
  for (const parent of parents) {
    if (!existsSync(parent)) continue
    const candidates = readdirSync(parent)
      .filter((name) => /jdk/i.test(name))
      .sort()
      .reverse()
    for (const name of candidates) {
      const home = join(parent, name)
      // macOS nests the actual home inside the bundle.
      const nested = join(home, 'Contents', 'Home')
      if (existsSync(join(nested, 'bin'))) return nested
      if (existsSync(join(home, 'bin'))) return home
    }
  }
  return null
}

function findAndroidSdk() {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT
  // Capacitor writes this when the project is opened in Android Studio, and
  // it is the one place the path is already recorded per-machine.
  const localProperties = join(root, 'android', 'local.properties')
  if (existsSync(localProperties)) {
    const match = readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.+)$/m)
    if (match) return match[1].trim().replace(/\\\\/g, '\\')
  }
  return null
}

const javaHome = findJavaHome()
if (!javaHome) {
  console.error(
    'No JDK found.\n' +
      'Gradle needs one. Either set JAVA_HOME, or unzip a JDK 21 and point JAVA_HOME at it:\n' +
      '  https://adoptium.net/temurin/releases/?version=21',
  )
  process.exit(1)
}

const androidSdk = findAndroidSdk()
if (!androidSdk) {
  console.error(
    'No Android SDK found.\n' +
      'Set ANDROID_HOME, or put sdk.dir=<path> in android/local.properties.',
  )
  process.exit(1)
}

console.log(`JDK:         ${javaHome}`)
console.log(`Android SDK: ${androidSdk}`)

// Relative to cwd, and deliberately not absolute. cmd will not resolve a bare
// 'gradlew.bat' from the working directory, so it needs the './' — but an
// absolute path is worse here, because this project lives under a directory
// with a space in its name and a shell-spawned command is not quoted for you.
// './gradlew.bat' has neither problem.
const gradlew = isWindows ? '.\\gradlew.bat' : './gradlew'

const result = spawnSync(gradlew, ['assembleDebug', '--no-daemon'], {
  cwd: join(root, 'android'),
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
    PATH: `${join(javaHome, 'bin')}${isWindows ? ';' : ':'}${process.env.PATH}`,
  },
})

process.exit(result.status ?? 1)
