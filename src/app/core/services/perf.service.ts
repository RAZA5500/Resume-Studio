import { DOCUMENT } from '@angular/common';
import { inject, Injectable, signal } from '@angular/core';

export type PerfTier = 'lite' | 'full';

/** Set by ?perf=lite|full (index.html) — always wins. */
const FORCED_KEY = 'rs_perf';
/** Set by the frame-rate check below. */
const AUTO_KEY = 'rs_perf_auto';

/** Frames slower than this count as janky (about three dropped frames at 60 Hz). */
const SLOW_FRAME_MS = 50;
const SAMPLE_MS = 4000;

/**
 * Performance tier of this device. index.html chooses it before the first paint and writes it to
 * <html data-perf> (touch screen, memory, CPU cores, Data Saver, reduced motion). Devices that start
 * on "full" get a short frame-rate check once the page has settled: if too many frames are slow,
 * the app switches to "lite" right away and remembers it for the next visits.
 */
@Injectable({ providedIn: 'root' })
export class PerfService {
  private readonly document = inject(DOCUMENT);
  private readonly root = this.document.documentElement;
  readonly tier = signal<PerfTier>(this.root.dataset['perf'] === 'lite' ? 'lite' : 'full');

  constructor() {
    if (this.tier() === 'full' && !this.stored(FORCED_KEY) && !this.stored(AUTO_KEY)) this.scheduleCheck();
  }

  get lite(): boolean {
    return this.tier() === 'lite';
  }

  private set(tier: PerfTier): void {
    this.tier.set(tier);
    this.root.dataset['perf'] = tier;
  }

  private stored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private scheduleCheck(): void {
    const view = this.document.defaultView;
    if (!view || typeof requestAnimationFrame !== 'function') return;
    const start = () => view.setTimeout(() => this.measure(), 1500);
    if (this.document.readyState === 'complete') start();
    else view.addEventListener('load', start, { once: true });
  }

  /** Samples frame intervals for a few seconds; hidden tabs are skipped (rAF is paused there). */
  private measure(): void {
    if (this.document.hidden) {
      this.document.addEventListener('visibilitychange', () => this.scheduleCheck(), { once: true });
      return;
    }
    let frames = 0;
    let slow = 0;
    let last = performance.now();
    const end = last + SAMPLE_MS;
    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      frames++;
      if (delta > SLOW_FRAME_MS) slow++;
      if (now < end && !this.document.hidden) {
        requestAnimationFrame(tick);
        return;
      }
      if (this.document.hidden || frames < 20) return;
      const fps = (frames * 1000) / (now - (end - SAMPLE_MS));
      const verdict: PerfTier = slow / frames > 0.12 || fps < 32 ? 'lite' : 'full';
      try {
        localStorage.setItem(AUTO_KEY, verdict);
      } catch {
        // private mode: the check simply runs again next time
      }
      if (verdict === 'lite') this.set('lite');
    };
    requestAnimationFrame(tick);
  }
}
