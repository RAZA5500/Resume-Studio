/**
 * Android app build: `npm run apk`
 *
 *   API_URL=https://your-domain.com npm run apk          (bash)
 *   $env:API_URL="https://your-domain.com"; npm run apk  (PowerShell)
 *
 * Without API_URL the app is a test build that asks for the server address on first launch
 * (and may talk to plain-HTTP servers on the local network). Optional:
 *   APP_VERSION_NAME=1.2.0 APP_VERSION_CODE=5   version shown in Android / required to rise for updates
 *   npm run apk -- --aab                        also build an .aab for the Google Play Store
 *
 * Needs JDK 21 and the Android SDK: JAVA_HOME / ANDROID_HOME, or the portable copies in D:\Android.
 * The release signing key is created on the first run (android/keystore/, android/keystore.properties)
 * and kept out of git. Back both up: every update of the app must be signed with the same key.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const android = join(root, 'android');
const isWindows = process.platform === 'win32';
const wantAab = process.argv.includes('--aab');

const env = { ...process.env };
env.JAVA_HOME ||= firstExisting(['D:/Android/jdk-21']);
env.ANDROID_HOME ||= env.ANDROID_SDK_ROOT || firstExisting(['D:/Android/sdk']);
if (!env.JAVA_HOME || !env.ANDROID_HOME) {
  fail('JDK 21 and the Android SDK were not found. Set JAVA_HOME and ANDROID_HOME (see the comment at the top of scripts/apk.mjs).');
}

const apiUrl = (env.API_URL ?? '').trim();
const versionName = (env.APP_VERSION_NAME ?? '1.0.0').trim();
const versionCode = (env.APP_VERSION_CODE ?? '1').trim();
console.log(
  apiUrl
    ? `\n› Android build for ${apiUrl} (version ${versionName} / ${versionCode})\n`
    : `\n› Android TEST build — the app will ask for the server address (version ${versionName} / ${versionCode})\n`,
);

step('Web build', process.execPath, ['scripts/build.mjs']);
step('Copy into the Android project', process.execPath, [resolve('node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android']);
ensureSigningKey();

const tasks = ['assembleRelease', ...(wantAab ? ['bundleRelease'] : [])];
step(
  'Gradle release build',
  join(android, isWindows ? 'gradlew.bat' : 'gradlew'),
  [...tasks, `-PappVersionCode=${versionCode}`, `-PappVersionName=${versionName}`, '--console=plain'],
  { cwd: android, shell: isWindows },
);

const outDir = join(root, 'dist', 'apk');
mkdirSync(outDir, { recursive: true });
const apk = join(outDir, `ResumeStudio-${versionName}${apiUrl ? '' : '-test'}.apk`);
copyFileSync(join(android, 'app/build/outputs/apk/release/app-release.apk'), apk);
console.log(`\n✔ APK: ${apk}`);
if (wantAab) {
  const aab = join(outDir, `ResumeStudio-${versionName}.aab`);
  copyFileSync(join(android, 'app/build/outputs/bundle/release/app-release.aab'), aab);
  console.log(`✔ Play Store bundle: ${aab}`);
}

function step(title, command, args, options = {}) {
  console.log(`\n── ${title}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env, cwd: root, ...options });
  if (result.status !== 0) fail(`${title} failed.`);
}

/** Creates the release keystore once; Gradle reads android/keystore.properties. */
function ensureSigningKey() {
  const properties = join(android, 'keystore.properties');
  if (existsSync(properties)) return;
  const password = randomBytes(18).toString('base64url');
  mkdirSync(join(android, 'keystore'), { recursive: true });
  step('Create the release signing key', join(env.JAVA_HOME, 'bin', isWindows ? 'keytool.exe' : 'keytool'), [
    '-genkeypair',
    '-keystore', join(android, 'keystore', 'resumestudio-release.jks'),
    '-alias', 'resumestudio',
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', password,
    '-keypass', password,
    '-dname', 'CN=ResumeStudio, O=ResumeStudio, C=PK',
  ]);
  writeFileSync(
    properties,
    [
      '# Release signing key for the Android app — keep this file and keystore/ private and backed up.',
      'storeFile=keystore/resumestudio-release.jks',
      `storePassword=${password}`,
      'keyAlias=resumestudio',
      `keyPassword=${password}`,
      '',
    ].join('\n'),
  );
  console.log('\n⚠ New signing key: android/keystore/resumestudio-release.jks + android/keystore.properties. Back them up.');
}

function firstExisting(paths) {
  return paths.find((path) => existsSync(path)) ?? '';
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
