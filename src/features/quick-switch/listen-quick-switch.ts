import { useEffect } from 'react';

import { useQuickSwitchStore } from '@/features/quick-switch/store/quick-switch-store';
import { QUICK_SWITCH_OPEN_EVENT } from '@/features/quick-switch/types';

export async function listenQuickSwitchOpen(onOpen: () => void): Promise<() => void> {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen(QUICK_SWITCH_OPEN_EVENT, () => {
      onOpen();
    });
  } catch {
    return () => undefined;
  }
}

export function useQuickSwitchBridge() {
  useEffect(() => {
    const openPanel = () => {
      useQuickSwitchStore.getState().openPanel();
    };

    window.__E2E_OPEN_QUICK_SWITCH__ = openPanel;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listenQuickSwitchOpen(openPanel).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      cancelled = true;
      unlisten?.();
      if (window.__E2E_OPEN_QUICK_SWITCH__ === openPanel) {
        delete window.__E2E_OPEN_QUICK_SWITCH__;
      }
    };
  }, []);
}
