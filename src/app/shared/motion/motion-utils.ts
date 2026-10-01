/** True when the visitor asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True for a mouse / trackpad (hover effects make no sense on touch screens). */
export function hasFinePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** easeOutExpo — fast start, gentle landing. */
export function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

type VisibilityCallback = (entry: IntersectionObserverEntry) => void;

interface SharedObserver {
  observer: IntersectionObserver;
  /** Several directives may watch the same element (e.g. appReveal + appInView). */
  callbacks: WeakMap<Element, Set<VisibilityCallback>>;
}

const shared = new Map<string, SharedObserver>();

/**
 * Shared IntersectionObservers (one per option set) so hundreds of animated
 * elements cost a single observer. Returns an unsubscribe function.
 */
export function observeVisibility(
  element: Element,
  callback: VisibilityCallback,
  options: { threshold?: number; rootMargin?: string } = {},
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    queueMicrotask(() =>
      callback({ isIntersecting: true, intersectionRatio: 1, target: element } as IntersectionObserverEntry),
    );
    return () => undefined;
  }

  const threshold = options.threshold ?? 0.12;
  const rootMargin = options.rootMargin ?? '0px 0px -8% 0px';
  const key = `${threshold}|${rootMargin}`;
  let entry = shared.get(key);
  if (!entry) {
    const callbacks = new WeakMap<Element, Set<VisibilityCallback>>();
    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          for (const cb of Array.from(callbacks.get(record.target) ?? [])) {
            try {
              cb(record);
            } catch (error) {
              console.error(error);
            }
          }
        }
      },
      { threshold, rootMargin },
    );
    entry = { observer, callbacks };
    shared.set(key, entry);
  }

  const { observer, callbacks } = entry;
  let set = callbacks.get(element);
  if (!set) {
    set = new Set();
    callbacks.set(element, set);
    observer.observe(element);
  }
  set.add(callback);

  return () => {
    const current = callbacks.get(element);
    if (!current?.delete(callback) || current.size) return;
    callbacks.delete(element);
    observer.unobserve(element);
  };
}
