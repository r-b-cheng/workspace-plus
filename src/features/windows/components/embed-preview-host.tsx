import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { EXIT_EMBED_PREVIEW_LABEL } from '@/features/windows/embed-copy';
import { embedHostBoundsFromElement } from '@/features/windows/embed-host';

type EmbedPreviewHostProps = {
  active: boolean;
  pending?: boolean;
  onExit: () => void;
};

const BOUNDS_UPDATE_DEBOUNCE_MS = 80;

export function EmbedPreviewHost({ active, pending = false, onExit }: EmbedPreviewHostProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    const surface = surfaceRef.current;
    if (!surface || typeof ResizeObserver === 'undefined') {
      return;
    }

    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const state = useWorkspaceAppStore.getState();
        if (!state.embeddedWorkspaceAppId || state.pendingEmbedWorkspaceAppId) {
          return;
        }
        const bounds = embedHostBoundsFromElement(surfaceRef.current);
        if (!bounds) {
          return;
        }
        void state.embedWorkspaceAppWindow(state.embeddedWorkspaceAppId, bounds);
      }, BOUNDS_UPDATE_DEBOUNCE_MS);
    });
    observer.observe(surface);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [active]);

  useEffect(() => {
    if (!active || pending) {
      return;
    }
    const state = useWorkspaceAppStore.getState();
    if (!state.embeddedWorkspaceAppId || state.pendingEmbedWorkspaceAppId) {
      return;
    }
    const bounds = embedHostBoundsFromElement(surfaceRef.current);
    if (!bounds) {
      return;
    }
    void state.embedWorkspaceAppWindow(state.embeddedWorkspaceAppId, bounds);
  }, [active, pending]);

  if (!active) {
    return null;
  }

  return (
    <section className="relative flex min-h-0 flex-1 flex-col" data-testid="embed-preview-host">
      <Button
        variant="ghost"
        className="absolute right-2 top-2 z-10 h-auto rounded-md bg-card/90 px-2 py-1 text-xs text-muted-foreground"
        data-testid="embed-preview-exit-button"
        onClick={onExit}
      >
        {EXIT_EMBED_PREVIEW_LABEL}
      </Button>
      <div
        ref={surfaceRef}
        data-embed-host-surface
        data-testid="embed-preview-host-surface"
        className="flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-dashed border-border bg-muted/30"
      >
        {pending ? <span className="text-sm text-muted-foreground">正在放入窗口…</span> : null}
      </div>
    </section>
  );
}
