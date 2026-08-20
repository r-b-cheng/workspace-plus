import type { HostBounds } from '@/lib/types';

export function embedHostBoundsFromElement(el: HTMLElement | null | undefined): HostBounds | undefined {
  if (!el) {
    return undefined;
  }
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    width,
    height,
  };
}

export function queryEmbedHostBounds(): HostBounds | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  return embedHostBoundsFromElement(document.querySelector<HTMLElement>('[data-embed-host-surface]'));
}
