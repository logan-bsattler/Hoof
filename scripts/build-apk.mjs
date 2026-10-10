// Builds a debug APK: copy the game into www/, sync it into the Capacitor Android project,
// then run Gradle. With --install, also adb-installs it on a USB-connected phone.
// Needs the Android SDK (ANDROID_HOME or android/local.properties) and a JDK 21.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
// Gradle finds the SDK via ANDROID_HOME or android/local.properties (git-ignored, machine-specific).
const props = join(root, 'android', 'local.properties');
if (!process.env.ANDROID_HOME && !existsSync(props) && existsSync(sdk)) {
  writeFileSync(props, `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
}

run('node scripts/build-web.mjs');
run('npx cap sync android');
run(process.platform === 'win32' ? '.\\gradlew.bat assembleDebug' : './gradlew assembleDebug', `${root}android`);

const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(built)) throw new Error(`Build finished but no APK at ${built}`);
// A copy with a findable name; dist/ sits in OneDrive, so the phone's OneDrive app can open it too.
mkdirSync(join(root, 'dist'), { recursive: true });
const apk = join(root, 'dist', 'true-hoof-debug.apk');
copyFileSync(built, apk);
console.log(`\nAPK ready: ${apk}`);

if (process.argv.includes('--install')) {
  const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  run(`"${existsSync(adb) ? adb : 'adb'}" install -r "${apk}"`);
} else {
  console.log('Install on a USB-connected phone: npm run android:install');
}
