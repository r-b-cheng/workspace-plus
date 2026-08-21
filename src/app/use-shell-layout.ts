import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampRightWidth,
  displayedLeftWidth,
  LEFT_SIDEBAR_MIN,
  normalizeShellLayout,
  readShellLayout,
  resizedLeftWidth,
  resizedRightWidth,
  type ShellLayoutState,
  writeShellLayout,
} from '@/app/shell-layout';

export function useShellLayout() {
  const [layout, setLayout] = useState<ShellLayoutState>(defaultLayout);
  const layoutRef = useRef(layout);
  const dragRef = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null);

  const persist = useCallback((next: ShellLayoutState) => {
    const normalized = normalizeShellLayout(next);
    layoutRef.current = normalized;
    setLayout(normalized);
    writeShellLayout(normalized);
  }, []);

  useEffect(() => {
    const next = fitLayoutToViewport(readShellLayout());
    layoutRef.current = next;
    setLayout(next);
    writeShellLayout(next);

    const onViewportResize = () => {
      persist(fitLayoutToViewport(layoutRef.current));
    };
    window.addEventListener('resize', onViewportResize);
    return () => window.removeEventListener('resize', onViewportResize);
  }, [persist]);

  const setLeftCollapsed = useCallback(
    (leftCollapsed: boolean) => {
      persist({ ...layoutRef.current, leftCollapsed });
    },
    [persist],
  );

  const toggleLeftCollapsed = useCallback(() => {
    setLeftCollapsed(!layoutRef.current.leftCollapsed);
  }, [setLeftCollapsed]);

  const beginResize = useCallback((side: 'left' | 'right', clientX: number) => {
    const current = layoutRef.current;
    dragRef.current = {
      side,
      startX: clientX,
      startWidth: side === 'left' ? current.leftWidth : current.rightWidth,
    };
  }, []);

  const applyResize = useCallback((clientX: number) => {
    const drag = dragRef.current;
    if (!drag || !Number.isFinite(clientX) || !Number.isFinite(drag.startX)) {
      return;
    }
    const current = layoutRef.current;
    const bounds = viewportBounds(current);
    if (drag.side === 'left') {
      const nextWidth = resizedLeftWidth(drag.startWidth, drag.startX, clientX);
      if (current.leftCollapsed && nextWidth >= LEFT_SIDEBAR_MIN) {
        persist(fitLayoutToViewport({ ...current, leftWidth: nextWidth, leftCollapsed: false }));
        return;
      }
      if (!current.leftCollapsed && drag.startWidth + (clientX - drag.startX) < LEFT_SIDEBAR_MIN - 24) {
        persist(fitLayoutToViewport({ ...current, leftCollapsed: true }));
        return;
      }
      persist(fitLayoutToViewport({ ...current, leftWidth: nextWidth, leftCollapsed: false }));
      return;
    }
    persist({
      ...current,
      rightWidth: resizedRightWidth(drag.startWidth, drag.startX, clientX, bounds),
    });
  }, [persist]);

  const endResize = useCallback(() => {
    dragRef.current = null;
  }, []);

  return {
    layout,
    setLeftCollapsed,
    toggleLeftCollapsed,
    beginResize,
    applyResize,
    endResize,
  };
}

function defaultLayout(): ShellLayoutState {
  return readShellLayout();
}

function viewportBounds(layout: ShellLayoutState) {
  return {
    viewportWidth: typeof window === 'undefined' ? 0 : window.innerWidth,
    leftDisplayed: displayedLeftWidth(layout),
  };
}

function fitLayoutToViewport(layout: ShellLayoutState): ShellLayoutState {
  return {
    ...layout,
    rightWidth: clampRightWidth(layout.rightWidth, viewportBounds(layout)),
  };
}
