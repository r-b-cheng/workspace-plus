import { useCallback, useEffect, useRef, useState } from 'react';

import {
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

  useEffect(() => {
    const next = readShellLayout();
    layoutRef.current = next;
    setLayout(next);
  }, []);

  const persist = useCallback((next: ShellLayoutState) => {
    const normalized = normalizeShellLayout(next);
    layoutRef.current = normalized;
    setLayout(normalized);
    writeShellLayout(normalized);
  }, []);

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
    if (drag.side === 'left') {
      const nextWidth = resizedLeftWidth(drag.startWidth, drag.startX, clientX);
      if (current.leftCollapsed && nextWidth >= LEFT_SIDEBAR_MIN) {
        persist({ ...current, leftWidth: nextWidth, leftCollapsed: false });
        return;
      }
      if (!current.leftCollapsed && drag.startWidth + (clientX - drag.startX) < LEFT_SIDEBAR_MIN - 24) {
        persist({ ...current, leftCollapsed: true });
        return;
      }
      persist({ ...current, leftWidth: nextWidth, leftCollapsed: false });
      return;
    }
    persist({
      ...current,
      rightWidth: resizedRightWidth(drag.startWidth, drag.startX, clientX),
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
