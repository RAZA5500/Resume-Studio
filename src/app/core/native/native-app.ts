import { effect, Injector, runInInjectionContext } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { filter, first } from 'rxjs';
import { ThemeService } from '../services/theme.service';
import { ToastService } from '../services/ui.service';
import { AppNative } from './app-native';
import { nativeHooks } from './platform';

/** Pages where the back button leaves the app instead of going back. */
const ROOT_PAGES = new Set(['/app/dashboard', '/login', '/connect']);

/**
 * Android app start-up (loaded only inside the app, as its own chunk): splash screen, system bar
 * colours, the hardware back button, and native replacements for downloads and printing.
 */
export function initNativeApp(injector: Injector): void {
  const router = injector.get(Router);
  const theme = injector.get(ThemeService);
  const toast = injector.get(ToastService);

  // Hide the splash screen as soon as the first page has painted (it also times out on its own,
  // see capacitor.config.ts).
  router.events
    .pipe(
      filter((event) => event instanceof NavigationEnd),
      first(),
    )
    .subscribe(() =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined)),
      ),
    );

  // Status / navigation bar icons and the area behind them follow the light/dark theme.
  runInInjectionContext(injector, () =>
    effect(() => {
      const dark = theme.theme() === 'dark';
      void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
        .then(() => AppNative.setBackgroundColor({ color: dark ? '#0a0c10' : '#f7f8fa' }))
        .catch(() => undefined);
    }),
  );

  void App.addListener('backButton', ({ canGoBack }) => {
    // Close the top-most dialog or menu first (they all close on a backdrop tap).
    const backdrops = document.querySelectorAll<HTMLElement>('.modal-backdrop:not(.is-leaving)');
    const overlay =
      backdrops[backdrops.length - 1] ??
      document.querySelector<HTMLElement>('.scrim:not(.is-leaving)') ??
      document.querySelector<HTMLElement>('.menu-open .burger');
    if (overlay) {
      overlay.click();
      return;
    }
    if (!canGoBack || ROOT_PAGES.has(location.pathname)) {
      void App.minimizeApp();
      return;
    }
    history.back();
  });

  // Google / Apple sign-in runs in the phone's browser and comes back through the app's deep link
  // (com.resumestudio.app://oauth?code=… — see AndroidManifest.xml); /auth/callback finishes it.
  const openLink = (url: string | undefined) => {
    let link: URL;
    try {
      link = new URL(url ?? '');
    } catch {
      return;
    }
    if (link.protocol === 'com.resumestudio.app:' && link.hostname === 'oauth') {
      void router.navigateByUrl(`/auth/callback${link.search}`);
    }
  };
  void App.addListener('appUrlOpen', ({ url }) => openLink(url));
  // Android may have closed the app while the browser was open: then the link starts it.
  void App.getLaunchUrl()
    .then((launch) => openLink(launch?.url))
    .catch(() => undefined);

  nativeHooks.saveFile = (blob, fileName) => void saveFile(blob, fileName, toast);
  nativeHooks.printHtml = (html, title) =>
    void AppNative.print({ html, name: title }).catch(() => toast.error('Printing is not available on this phone.'));
}

/**
 * Saves into Documents/ResumeStudio (visible in the Files app) and opens the share sheet, so the
 * file can go straight to WhatsApp, email or Drive. Falls back to the app cache when shared
 * storage is not writable (Android 10 and older).
 */
async function saveFile(blob: Blob, fileName: string, toast: ToastService): Promise<void> {
  try {
    const data = await blobToBase64(blob);
    let uri: string;
    try {
      ({ uri } = await Filesystem.writeFile({
        path: `ResumeStudio/${fileName}`,
        data,
        directory: Directory.Documents,
        recursive: true,
      }));
      toast.success(`Saved to Documents › ResumeStudio › ${fileName}`);
    } catch {
      ({ uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache }));
    }
    await Share.share({ title: fileName, files: [uri], dialogTitle: 'Open or share' }).catch(() => undefined);
  } catch {
    toast.error('Could not save the file.');
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
