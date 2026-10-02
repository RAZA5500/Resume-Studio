/**
 * Android-app helpers that are safe to import anywhere: they never load Capacitor itself, so the
 * web build stays as small as before. Capacitor's bridge defines window.Capacitor before the page
 * starts, which is all the detection needs; the native code lives in native-app.ts (lazy chunk).
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

/** True inside the Android app. */
export function isNativeApp(): boolean {
  const capacitor = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}

/**
 * Replacements the Android app installs for browser-only features: a WebView ignores
 * `<a download>` and has no print dialog.
 */
export const nativeHooks: {
  saveFile?: (blob: Blob, fileName: string) => void;
  printHtml?: (html: string, title: string) => void;
} = {};
