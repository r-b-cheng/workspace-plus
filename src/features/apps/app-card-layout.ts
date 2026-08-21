import { useLayoutEffect, useRef, useState } from 'react';

export const APP_CARD_STACK_MAX_WIDTH = 560;
export const APP_CARD_TWO_COL_MAX_WIDTH = 880;
export const APP_CARD_MAX_COLUMNS = 3;

export function appCardColumnCount(width: number): number {
  if (!Number.isFinite(width) || width < APP_CARD_STACK_MAX_WIDTH) {
    return 1;
  }
  if (width < APP_CARD_TWO_COL_MAX_WIDTH) {
    return 2;
  }
  return APP_CARD_MAX_COLUMNS;
}

export function useAppCardGridLayout() {
  const ref = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const readWidth = () => {
      const source = el.parentElement ?? el;
      const next = source.getBoundingClientRect().width || source.clientWidth;
      setWidth(next);
    };

    readWidth();
    const onWindowResize = () => readWidth();
    window.addEventListener('resize', onWindowResize);

    if (typeof ResizeObserver === 'undefined') {
      return () => window.removeEventListener('resize', onWindowResize);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const source = (entry?.target as HTMLElement | undefined) ?? el.parentElement ?? el;
      setWidth(entry?.contentRect.width || source.clientWidth);
    });
    observer.observe(el);
    if (el.parentElement) {
      observer.observe(el.parentElement);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
    };
  }, []);

  const columns = appCardColumnCount(width);
  return {
    ref,
    columns,
    compact: columns === 1,
  };
}
