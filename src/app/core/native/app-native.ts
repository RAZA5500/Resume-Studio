import { registerPlugin } from '@capacitor/core';

/** App-specific native helpers — android/app/src/main/java/com/resumestudio/app/AppNativePlugin.java */
export interface AppNativePlugin {
  /** Opens Android's print screen ("Save as PDF") for a standalone HTML page. */
  print(options: { html: string; name: string }): Promise<void>;
  /** Colours the area behind the status and navigation bars. */
  setBackgroundColor(options: { color: string }): Promise<void>;
}

export const AppNative = registerPlugin<AppNativePlugin>('AppNative');
