import { useEffect } from 'react';

import {
  currentEmbedPreviewSeq,
  useWorkspaceAppStore,
} from '@/features/apps/store/workspace-app-store';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';

export const WORKSPACE_WINDOWS_CHANGED_EVENT = 'workspace-windows-changed';

export type WorkspaceWindowsChangedPayload = {
  workspaceId: string;
  workspaceAppId?: string;
  previewReleased?: boolean;
  previewSeq?: number;
};

export async function listenWorkspaceWindowsChanged(
  onChange: (payload: WorkspaceWindowsChangedPayload) => void,
): Promise<() => void> {
  try {
    const { listen } = await import('@tauri-apps/api/event');
    return await listen<WorkspaceWindowsChangedPayload>(WORKSPACE_WINDOWS_CHANGED_EVENT, (event) => {
      onChange(event.payload);
    });
  } catch {
    return () => undefined;
  }
}

function previewChangedSince(
  previewSeq: number,
  previewAppId: string | null,
): boolean {
  const latest = useWorkspaceAppStore.getState();
  const latestPreviewAppId = latest.embeddedWorkspaceAppId ?? latest.pendingEmbedWorkspaceAppId;
  return (
    currentEmbedPreviewSeq() !== previewSeq ||
    (latestPreviewAppId != null && latestPreviewAppId !== previewAppId)
  );
}

function currentOrPendingEmbedId(): string | null {
  const latest = useWorkspaceAppStore.getState();
  return latest.embeddedWorkspaceAppId ?? latest.pendingEmbedWorkspaceAppId;
}

function shouldHonorPreviewReleased(payload: WorkspaceWindowsChangedPayload): boolean {
  const latest = useWorkspaceAppStore.getState();
  if (latest.currentWorkspaceId !== payload.workspaceId) {
    return false;
  }
  if (payload.workspaceAppId) {
    const embedId = currentOrPendingEmbedId();
    if (embedId != null && embedId !== payload.workspaceAppId) {
      return false;
    }
  }
  if (payload.previewSeq != null && currentEmbedPreviewSeq() !== payload.previewSeq) {
    return false;
  }
  return true;
}

export async function applyWorkspaceWindowsChanged(
  payload: WorkspaceWindowsChangedPayload,
): Promise<void> {
  const selectedWorkspaceId = useWorkspaceStore.getState().selectedWorkspaceId;
  const currentWorkspaceId = useWorkspaceAppStore.getState().currentWorkspaceId;
  if (payload.workspaceId !== currentWorkspaceId && payload.workspaceId !== selectedWorkspaceId) {
    return;
  }

  const started = useWorkspaceAppStore.getState();
  const previewSeq = currentEmbedPreviewSeq();
  const previewAppId = started.embeddedWorkspaceAppId ?? started.pendingEmbedWorkspaceAppId;

  await useWorkspaceAppStore.getState().reloadWorkspaceAppsIfCurrent(payload.workspaceId);

  const afterReload = useWorkspaceAppStore.getState();
  if (afterReload.currentWorkspaceId !== payload.workspaceId) {
    return;
  }
  if (previewChangedSince(previewSeq, previewAppId)) {
    return;
  }

  const expanded = afterReload.expandedWorkspaceAppIds;
  await Promise.all(
    expanded.map((workspaceAppId) =>
      useWorkspaceAppStore.getState().loadWorkspaceAppWindows(workspaceAppId),
    ),
  );

  const latest = useWorkspaceAppStore.getState();
  if (latest.currentWorkspaceId !== payload.workspaceId) {
    return;
  }
  if (previewChangedSince(previewSeq, previewAppId)) {
    return;
  }

  if (payload.previewReleased) {
    if (!shouldHonorPreviewReleased(payload)) {
      return;
    }
    if (payload.workspaceAppId) {
      await latest.releaseEmbeddedWindow({ workspaceAppId: payload.workspaceAppId });
    } else {
      await latest.releaseEmbeddedWindow();
    }
    return;
  }

  const previewId = latest.embeddedWorkspaceAppId ?? latest.pendingEmbedWorkspaceAppId;
  if (!previewId) {
    return;
  }
  const previewApp = latest.workspaceApps.find((app) => app.id === previewId);
  if (!previewApp || previewApp.status !== 'running') {
    await latest.releaseEmbeddedWindow();
  }
}

export function useWindowsChangedBridge() {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listenWorkspaceWindowsChanged((payload) => {
      void applyWorkspaceWindowsChanged(payload);
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
