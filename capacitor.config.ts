import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app (Capacitor). Build it with `npm run apk` — see scripts/apk.mjs.
 *
 * The web build is bundled inside the APK, so pages open from the phone itself and only API calls
 * go over the network. API_URL (the same variable the web build uses) decides where they go:
 *   - https://your-domain → a production app; plain-HTTP traffic stays blocked.
 *   - not set or http://… → a test app: it asks for the server address on first launch, and
 *     HTTP servers on the local network (e.g. http://192.168.1.5:3000) are allowed.
 */
const apiUrl = (process.env['API_URL'] ?? '').trim();
const httpsApi = apiUrl.startsWith('https://');

const config: CapacitorConfig = {
  appId: 'com.resumestudio.app',
  appName: 'ResumeStudio',
  webDir: 'dist/frontend/browser',
  backgroundColor: '#0a0c10',
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
    cleartext: !httpsApi,
  },
  android: {
    // The app page is https://localhost; an http:// API would be blocked as mixed content.
    allowMixedContent: !httpsApi,
  },
  plugins: {
    SplashScreen: {
      // Hidden by the app once the first page has rendered (src/app/core/native/native-app.ts).
      launchAutoHide: false,
      backgroundColor: '#0a0c10',
      showSpinner: false,
    },
    SystemBars: {
      // The page does not use viewport-fit=cover, so Android keeps the web view clear of the
      // status and navigation bars and the app paints the area behind them in its theme colour.
      insetsHandling: 'native',
    },
  },
};

export default config;
