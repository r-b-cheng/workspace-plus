import type { HostBounds } from '@/lib/types';

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    resolve();
  });
}

export function embedHostBoundsFromElement(el: HTMLElement | null | undefined): HostBounds | undefined {
  if (!el) {
    return undefined;
  }
  const rect = el.getBoundingClientRect();
  const viewport = window.visualViewport;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    x: Math.round((rect.left + (viewport?.offsetLeft ?? 0)) * dpr),
    y: Math.round((rect.top + (viewport?.offsetTop ?? 0)) * dpr),
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

export async function waitForEmbedHostBounds(maxFrames = 4): Promise<HostBounds | undefined> {
  for (let attempt = 0; attempt < maxFrames; attempt += 1) {
    const bounds = queryEmbedHostBounds();
    if (bounds) {
      return bounds;
    }
    await nextAnimationFrame();
  }
  return queryEmbedHostBounds();
}
