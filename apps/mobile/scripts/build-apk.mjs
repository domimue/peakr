#!/usr/bin/env node
/**
 * Builds the personal APK on this computer – no EAS, no cloud (docs/personal-build.md).
 *
 *   pnpm apk              personal build (everything unlocked), arm64 phones
 *   pnpm apk --all-abis   all four processor types (slower)
 *   pnpm apk --install    also installs it on the phone connected over USB (adb)
 *
 * Needs the Android SDK and a JDK 17+ – Android Studio brings both; they are found in their
 * usual places or via ANDROID_HOME / JAVA_HOME. Keys for sign-in, sync and maps come from
 * apps/mobile/.env.local (see .env.example); without it the app works offline on the phone.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(mobile, '../..');
const args = new Set(process.argv.slice(2));
const win = platform() === 'win32';
const home = homedir();

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};
const step = (msg) => console.log(`\n▶ ${msg}`);

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p)) ?? null;
}

// --- Android SDK ---------------------------------------------------------------------------
const sdk = firstExisting([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  join(home, 'Library/Android/sdk'), // macOS
  join(home, 'Android/Sdk'), // Linux
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android/Sdk'), // Windows
]);
if (!sdk) {
  fail(
    'Android SDK not found. Install Android Studio (it sets up the SDK on first start) or set ANDROID_HOME.',
  );
}

// --- JDK -----------------------------------------------------------------------------------
const javaHome = firstExisting([
  process.env.JAVA_HOME,
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  'C:/Program Files/Android/Android Studio/jbr',
  join(home, 'android-studio/jbr'),
  '/opt/android-studio/jbr',
  '/snap/android-studio/current/jbr',
]);
if (!javaHome && spawnSync('java', ['-version'], { shell: win }).status !== 0) {
  fail(
    'No Java found. Android Studio brings one (its "jbr" folder) – or set JAVA_HOME to a JDK 17+.',
  );
}

if (!existsSync(join(mobile, '.env.local'))) {
  console.warn(
    '\n! apps/mobile/.env.local is missing – the APK works offline only (no sign-in, sync, Strava or maps).\n  Copy apps/mobile/.env.example to .env.local and fill in the public keys to change that.',
  );
}

const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  // Unlocks everything (only ever for yourself; app.config.ts refuses it for store builds).
  PEAKR_PERSONAL_BUILD: '1',
  NODE_ENV: 'production',
};

function run(cmd, cmdArgs, cwd) {
  const r = spawnSync(cmd, cmdArgs, { cwd, env, stdio: 'inherit', shell: win });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(' ')} failed (exit ${r.status}).`);
}

// --- Native project ------------------------------------------------------------------------
step('Generating the Android project (expo prebuild)…');
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install'], mobile);

const android = join(mobile, 'android');
writeFileSync(join(android, 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
if (!args.has('--all-abis')) {
  // Every current phone is arm64; one processor type makes the build much faster.
  appendFileSync(join(android, 'gradle.properties'), '\nreactNativeArchitectures=arm64-v8a\n');
}

// --- Build ---------------------------------------------------------------------------------
step('Building the APK (Gradle, first run downloads a lot and takes a while)…');
run(win ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--no-daemon'], android);

const built = join(android, 'app/build/outputs/apk/release/app-release.apk');
if (!existsSync(built)) fail(`The APK was not found at ${built}.`);
const outDir = join(repo, 'dist');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'peakr-personal.apk');
copyFileSync(built, out);
console.log(`\n✔ APK ready: ${out}`);

// --- Optional: install over USB ------------------------------------------------------------
if (args.has('--install')) {
  const adb = join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb');
  step('Installing on the connected phone (adb)…');
  const r = spawnSync(existsSync(adb) ? adb : 'adb', ['install', '-r', out], {
    stdio: 'inherit',
    shell: win,
  });
  if (r.status !== 0) {
    fail(
      'Install failed. USB debugging on? If an older Peakr from EAS is installed, uninstall it first (other signature).',
    );
  }
  console.log('✔ Installed.');
} else {
  console.log(
    '  Copy it to the phone and open it, or run "pnpm apk --install" with the phone on USB.',
  );
}
