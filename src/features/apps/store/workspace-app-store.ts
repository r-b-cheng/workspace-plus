import { create } from 'zustand';

import { appApi } from '@/features/api/app-api';
import { windowApi } from '@/features/api/window-api';
import { AppApiError } from '@/features/api/tauri-client';
import { queryEmbedHostBounds } from '@/features/windows/embed-host';
import { canFocusWorkspaceApp, statusFromErrorCode } from '@/features/windows/window-status';
import { ERROR_CODES, userMessageForError } from '@/lib/errors';
import type {
  CommandError,
  EmbedWorkspaceAppResult,
  HostBounds,
  InstalledApp,
  WorkspaceApp,
  WorkspaceAppWindow,
} from '@/lib/types';

export type WorkspaceAppStoreData = {
  installedApps: InstalledApp[];
  workspaceAppsByWorkspaceId: Record<string, WorkspaceApp[]>;
  currentWorkspaceId: string | null;
  workspaceApps: WorkspaceApp[];
  appDialogOpen: boolean;
  appSearchQuery: string;
  installedAppsLoading: boolean;
  workspaceAppsLoading: boolean;
  refreshingInstalledApps: boolean;
  launchingInstalledAppIds: string[];
  pendingWorkspaceAppIds: string[];
  windowsByWorkspaceAppId: Record<string, WorkspaceAppWindow[]>;
  windowsLoadingIds: string[];
  expandedWorkspaceAppIds: string[];
  embeddedWorkspaceAppId: string | null;
  pendingEmbedWorkspaceAppId: string | null;
  appError: CommandError | null;
};

export type WorkspaceAppStore = WorkspaceAppStoreData & {
  loadWorkspaceApps: (workspaceId: string) => Promise<void>;
  loadInstalledApps: (workspaceId?: string) => Promise<void>;
  searchInstalledApps: (query: string, workspaceId?: string) => Promise<void>;
  refreshInstalledApps: (workspaceId?: string) => Promise<void>;
  openAddAppDialog: (workspaceId: string) => Promise<void>;
  closeAddAppDialog: () => void;
  setAppSearchQuery: (query: string) => void;
  addAndLaunchApp: (workspaceId: string, installedAppId: string) => Promise<WorkspaceApp | null>;
  focusWorkspaceApp: (workspaceAppId: string) => Promise<WorkspaceApp | null>;
  reopenWorkspaceApp: (app: WorkspaceApp) => Promise<WorkspaceApp | null>;
  activateWorkspaceApp: (app: WorkspaceApp) => Promise<WorkspaceApp | null>;
  handleInstalledAppAction: (workspaceId: string, app: InstalledApp) => Promise<void>;
  addManualAndOpen: (workspaceId: string) => Promise<void>;
  removeWorkspaceApp: (workspaceAppId: string) => Promise<void>;
  loadWorkspaceAppWindows: (workspaceAppId: string) => Promise<void>;
  toggleWorkspaceAppWindows: (workspaceAppId: string) => Promise<void>;
  focusNativeWindow: (windowId: string, workspaceAppId: string) => Promise<WorkspaceApp | null>;
  setWorkspaceAppEmbed: (
    workspaceAppId: string,
    embedEnabled: boolean,
  ) => Promise<WorkspaceApp | null>;
  embedWorkspaceAppWindow: (
    workspaceAppId: string,
    hostBounds?: HostBounds,
  ) => Promise<EmbedWorkspaceAppResult | null>;
  releaseEmbeddedWindow: () => Promise<void>;
  clearWorkspaceApps: () => void;
  syncWorkspaceAppCount: (workspaceId: string) => number;
  clearAppError: () => void;
  reset: () => void;
};

function toCommandError(error: unknown): CommandError {
  if (error instanceof AppApiError) {
    return { code: error.code, message: userMessageForError(error) };
  }
  return { code: 'Internal', message: '操作失败，请重试。' };
}

function toRawCommandError(error: unknown): CommandError {
  if (error instanceof AppApiError && error.message.trim()) {
    return { code: error.code, message: error.message };
  }
  return toCommandError(error);
}

function uniqueIds(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

function upsertWorkspaceApp(apps: WorkspaceApp[], next: WorkspaceApp): WorkspaceApp[] {
  const exists = apps.some((app) => app.id === next.id);
  if (!exists) {
    return [...apps, next];
  }
  return apps.map((app) => (app.id === next.id ? next : app));
}

export const initialWorkspaceAppStoreData: WorkspaceAppStoreData = {
  installedApps: [],
  workspaceAppsByWorkspaceId: {},
  currentWorkspaceId: null,
  workspaceApps: [],
  appDialogOpen: false,
  appSearchQuery: '',
  installedAppsLoading: false,
  workspaceAppsLoading: false,
  refreshingInstalledApps: false,
  launchingInstalledAppIds: [],
  pendingWorkspaceAppIds: [],
  windowsByWorkspaceAppId: {},
  windowsLoadingIds: [],
  expandedWorkspaceAppIds: [],
  embeddedWorkspaceAppId: null,
  pendingEmbedWorkspaceAppId: null,
  appError: null,
};

let workspaceAppsRequestSeq = 0;

export const useWorkspaceAppStore = create<WorkspaceAppStore>((set, get) => ({
  ...initialWorkspaceAppStoreData,

  async loadWorkspaceApps(workspaceId) {
    const seq = ++workspaceAppsRequestSeq;
    const sameWorkspace = get().currentWorkspaceId === workspaceId;
    if (!sameWorkspace) {
      if (get().embeddedWorkspaceAppId || get().pendingEmbedWorkspaceAppId) {
        await get().releaseEmbeddedWindow();
      }
    }
    set({
      currentWorkspaceId: workspaceId,
      workspaceApps: sameWorkspace ? get().workspaceApps : [],
      workspaceAppsLoading: true,
      appError: null,
      embeddedWorkspaceAppId: sameWorkspace ? get().embeddedWorkspaceAppId : null,
      pendingEmbedWorkspaceAppId: sameWorkspace ? get().pendingEmbedWorkspaceAppId : null,
    });

    try {
      const workspaceApps = await appApi.listWorkspaceApps({ workspaceId });
      if (seq !== workspaceAppsRequestSeq) {
        return;
      }
      set({
        workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: workspaceApps,
        },
        workspaceAppsLoading: false,
      });
    } catch (error) {
      if (seq !== workspaceAppsRequestSeq) {
        return;
      }
      set({
        workspaceAppsLoading: false,
        appError: toCommandError(error),
      });
    }
  },

  async loadInstalledApps(workspaceId) {
    set({ installedAppsLoading: true, appError: null });
    try {
      const installedApps = await appApi.listInstalledApps({ workspaceId });
      set({ installedApps, installedAppsLoading: false });
    } catch (error) {
      set({
        installedAppsLoading: false,
        appError: toCommandError(error),
      });
    }
  },

  async searchInstalledApps(query, workspaceId) {
    set({ appSearchQuery: query, installedAppsLoading: true, appError: null });
    try {
      const installedApps = await appApi.searchInstalledApps({ query, workspaceId });
      set({ installedApps, installedAppsLoading: false });
    } catch (error) {
      set({
        installedAppsLoading: false,
        appError: toCommandError(error),
      });
    }
  },

  async refreshInstalledApps(workspaceId) {
    set({ refreshingInstalledApps: true, appError: null });
    try {
      await appApi.refreshInstalledApps();
      const installedApps = await appApi.listInstalledApps({ workspaceId });
      set({ installedApps, refreshingInstalledApps: false });
    } catch (error) {
      set({
        refreshingInstalledApps: false,
        appError: toCommandError(error),
      });
    }
  },

  async openAddAppDialog(workspaceId) {
    set({
      appDialogOpen: true,
      appSearchQuery: '',
      appError: null,
    });
    await get().loadInstalledApps(workspaceId);
  },

  closeAddAppDialog() {
    set({ appDialogOpen: false, appSearchQuery: '' });
  },

  setAppSearchQuery(query) {
    set({ appSearchQuery: query });
  },

  async addAndLaunchApp(workspaceId, installedAppId) {
    set({
      launchingInstalledAppIds: uniqueIds(get().launchingInstalledAppIds, installedAppId),
      appError: null,
    });

    try {
      const launched = await appApi.launchWorkspaceApp({ workspaceId, installedAppId });
      const stillCurrent = get().currentWorkspaceId === workspaceId;
      const cached = upsertWorkspaceApp(
        stillCurrent
          ? get().workspaceApps
          : (get().workspaceAppsByWorkspaceId[workspaceId] ?? []),
        launched,
      );
      if (stillCurrent) {
        workspaceAppsRequestSeq += 1;
      }
      set({
        workspaceApps: stillCurrent ? cached : get().workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: cached,
        },
        workspaceAppsLoading: stillCurrent ? false : get().workspaceAppsLoading,
        launchingInstalledAppIds: withoutId(get().launchingInstalledAppIds, installedAppId),
        installedApps: stillCurrent
          ? get().installedApps.map((app) =>
              app.id === installedAppId ? { ...app, alreadyInWorkspace: true } : app,
            )
          : get().installedApps,
        appDialogOpen: stillCurrent ? false : get().appDialogOpen,
      });
      return launched;
    } catch (error) {
      const appError = toCommandError(error);
      const stillCurrent = get().currentWorkspaceId === workspaceId;
      const source = stillCurrent
        ? get().workspaceApps
        : (get().workspaceAppsByWorkspaceId[workspaceId] ?? []);
      const cached = source.map((app) =>
        app.installedAppId === installedAppId
          ? { ...app, status: statusFromErrorCode(appError.code), errorMessage: appError.message }
          : app,
      );
      set({
        launchingInstalledAppIds: withoutId(get().launchingInstalledAppIds, installedAppId),
        appError: stillCurrent ? appError : get().appError,
        workspaceApps: stillCurrent ? cached : get().workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: cached,
        },
      });
      try {
        const refreshed = await appApi.listWorkspaceApps({ workspaceId });
        set({
          workspaceApps:
            get().currentWorkspaceId === workspaceId ? refreshed : get().workspaceApps,
          workspaceAppsByWorkspaceId: {
            ...get().workspaceAppsByWorkspaceId,
            [workspaceId]: refreshed,
          },
        });
      } catch {
        // Keep the local card list; the banner already shows the launch error.
      }
      return null;
    }
  },

  async focusWorkspaceApp(workspaceAppId) {
    set({
      pendingWorkspaceAppIds: uniqueIds(get().pendingWorkspaceAppIds, workspaceAppId),
      appError: null,
    });

    try {
      const focused = await appApi.focusWorkspaceApp({ workspaceAppId });
      const workspaceId = focused.workspaceId;
      const stillCurrent = get().currentWorkspaceId === workspaceId;
      const cached = upsertWorkspaceApp(
        stillCurrent
          ? get().workspaceApps
          : (get().workspaceAppsByWorkspaceId[workspaceId] ?? []),
        focused,
      );
      set({
        workspaceApps: stillCurrent ? cached : get().workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: cached,
        },
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
      });
      return focused;
    } catch (error) {
      const appError = toCommandError(error);
      const status =
        appError.code === ERROR_CODES.FOCUS_DENIED
          ? 'running'
          : statusFromErrorCode(appError.code);
      const workspaceApps = get().workspaceApps.map((app) =>
        app.id === workspaceAppId
          ? {
              ...app,
              status,
              errorMessage: appError.message,
              windowTitle: status === 'closed' ? undefined : app.windowTitle,
            }
          : app,
      );
      const workspaceId = get().currentWorkspaceId;
      set({
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
        appError,
        workspaceApps,
        workspaceAppsByWorkspaceId: workspaceId
          ? { ...get().workspaceAppsByWorkspaceId, [workspaceId]: workspaceApps }
          : get().workspaceAppsByWorkspaceId,
      });
      return null;
    }
  },

  async reopenWorkspaceApp(app) {
    return get().addAndLaunchApp(app.workspaceId, app.installedAppId);
  },

  async activateWorkspaceApp(app) {
    if (app.status === 'launching') {
      return app;
    }
    if (canFocusWorkspaceApp(app.status)) {
      return get().focusWorkspaceApp(app.id);
    }
    return get().reopenWorkspaceApp(app);
  },

  async handleInstalledAppAction(workspaceId, app) {
    if (get().launchingInstalledAppIds.includes(app.id)) {
      return;
    }

    if (app.alreadyInWorkspace) {
      const existing =
        get().workspaceApps.find((item) => item.installedAppId === app.id) ??
        get().workspaceAppsByWorkspaceId[workspaceId]?.find((item) => item.installedAppId === app.id);

      if (existing) {
        if (canFocusWorkspaceApp(existing.status)) {
          await get().focusWorkspaceApp(existing.id);
        } else {
          await get().reopenWorkspaceApp(existing);
        }
        set({ appDialogOpen: false });
        return;
      }

      await get().loadWorkspaceApps(workspaceId);
      const refreshed = get().workspaceApps.find((item) => item.installedAppId === app.id);
      if (refreshed) {
        if (canFocusWorkspaceApp(refreshed.status)) {
          await get().focusWorkspaceApp(refreshed.id);
        } else {
          await get().reopenWorkspaceApp(refreshed);
        }
        set({ appDialogOpen: false });
        return;
      }
    }

    await get().addAndLaunchApp(workspaceId, app.id);
  },

  async addManualAndOpen(workspaceId) {
    set({ appError: null });
    try {
      const path = await appApi.pickManualAppPath();
      if (!path) {
        return;
      }

      const added = await appApi.addManualApp({ path });
      const catalog = await appApi.listInstalledApps({ workspaceId });
      set({ installedApps: catalog });
      const inCatalog = catalog.find((item) => item.id === added.id) ?? { ...added, alreadyInWorkspace: false };
      await get().handleInstalledAppAction(workspaceId, inCatalog);
    } catch (error) {
      set({ appError: toCommandError(error) });
    }
  },

  async removeWorkspaceApp(workspaceAppId) {
    set({
      pendingWorkspaceAppIds: uniqueIds(get().pendingWorkspaceAppIds, workspaceAppId),
      appError: null,
    });

    try {
      await appApi.removeWorkspaceApp({ workspaceAppId });
      const removed = get().workspaceApps.find((app) => app.id === workspaceAppId);
      const workspaceApps = get().workspaceApps.filter((app) => app.id !== workspaceAppId);
      const workspaceId = get().currentWorkspaceId;
      const { [workspaceAppId]: _removedWindows, ...windowsByWorkspaceAppId } =
        get().windowsByWorkspaceAppId;
      set({
        workspaceApps,
        workspaceAppsByWorkspaceId: workspaceId
          ? { ...get().workspaceAppsByWorkspaceId, [workspaceId]: workspaceApps }
          : get().workspaceAppsByWorkspaceId,
        windowsByWorkspaceAppId,
        windowsLoadingIds: withoutId(get().windowsLoadingIds, workspaceAppId),
        expandedWorkspaceAppIds: withoutId(get().expandedWorkspaceAppIds, workspaceAppId),
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
        embeddedWorkspaceAppId:
          get().embeddedWorkspaceAppId === workspaceAppId ? null : get().embeddedWorkspaceAppId,
        pendingEmbedWorkspaceAppId:
          get().pendingEmbedWorkspaceAppId === workspaceAppId
            ? null
            : get().pendingEmbedWorkspaceAppId,
        installedApps: removed
          ? get().installedApps.map((app) =>
              app.id === removed.installedAppId ? { ...app, alreadyInWorkspace: false } : app,
            )
          : get().installedApps,
      });
    } catch (error) {
      set({
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
        appError: toCommandError(error),
      });
    }
  },

  async loadWorkspaceAppWindows(workspaceAppId) {
    set({
      windowsLoadingIds: uniqueIds(get().windowsLoadingIds, workspaceAppId),
    });
    try {
      const windows = await windowApi.listWorkspaceAppWindows({ workspaceAppId });
      set({
        windowsByWorkspaceAppId: {
          ...get().windowsByWorkspaceAppId,
          [workspaceAppId]: windows,
        },
        windowsLoadingIds: withoutId(get().windowsLoadingIds, workspaceAppId),
      });
    } catch (error) {
      set({
        windowsLoadingIds: withoutId(get().windowsLoadingIds, workspaceAppId),
        appError: toCommandError(error),
      });
    }
  },

  async toggleWorkspaceAppWindows(workspaceAppId) {
    const expanded = get().expandedWorkspaceAppIds.includes(workspaceAppId);
    if (expanded) {
      set({
        expandedWorkspaceAppIds: withoutId(get().expandedWorkspaceAppIds, workspaceAppId),
      });
      return;
    }
    set({
      expandedWorkspaceAppIds: uniqueIds(get().expandedWorkspaceAppIds, workspaceAppId),
    });
    await get().loadWorkspaceAppWindows(workspaceAppId);
  },

  async focusNativeWindow(windowId, workspaceAppId) {
    set({
      pendingWorkspaceAppIds: uniqueIds(get().pendingWorkspaceAppIds, workspaceAppId),
      appError: null,
    });

    try {
      const focused = await windowApi.focusNativeWindow({ windowId });
      const workspaceId = focused.workspaceId;
      const stillCurrent = get().currentWorkspaceId === workspaceId;
      const cached = upsertWorkspaceApp(
        stillCurrent
          ? get().workspaceApps
          : (get().workspaceAppsByWorkspaceId[workspaceId] ?? []),
        focused,
      );
      set({
        workspaceApps: stillCurrent ? cached : get().workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: cached,
        },
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
      });
      await get().loadWorkspaceAppWindows(workspaceAppId);
      return focused;
    } catch (error) {
      const appError = toCommandError(error);
      set({
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
        appError,
      });
      try {
        const windows = await windowApi.listWorkspaceAppWindows({ workspaceAppId });
        const hasRunning = windows.some((item) => item.status === 'running');
        const workspaceApps = get().workspaceApps.map((app) =>
          app.id === workspaceAppId
            ? {
                ...app,
                status: hasRunning
                  ? app.status
                  : appError.code === ERROR_CODES.FOCUS_DENIED
                    ? 'running'
                    : statusFromErrorCode(appError.code),
                errorMessage: appError.message,
              }
            : app,
        );
        const workspaceId = get().currentWorkspaceId;
        set({
          windowsByWorkspaceAppId: {
            ...get().windowsByWorkspaceAppId,
            [workspaceAppId]: windows,
          },
          workspaceApps,
          workspaceAppsByWorkspaceId: workspaceId
            ? { ...get().workspaceAppsByWorkspaceId, [workspaceId]: workspaceApps }
            : get().workspaceAppsByWorkspaceId,
        });
      } catch {
        // Keep the local list; the banner already shows the focus error.
      }
      return null;
    }
  },

  async setWorkspaceAppEmbed(workspaceAppId, embedEnabled) {
    set({ appError: null });
    try {
      const updated = await appApi.setWorkspaceAppEmbed({ workspaceAppId, embedEnabled });
      const workspaceId = updated.workspaceId;
      const stillCurrent = get().currentWorkspaceId === workspaceId;
      const cached = upsertWorkspaceApp(
        stillCurrent
          ? get().workspaceApps
          : (get().workspaceAppsByWorkspaceId[workspaceId] ?? []),
        updated,
      );
      set({
        workspaceApps: stillCurrent ? cached : get().workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: cached,
        },
        embeddedWorkspaceAppId:
          !embedEnabled && get().embeddedWorkspaceAppId === workspaceAppId
            ? null
            : get().embeddedWorkspaceAppId,
        pendingEmbedWorkspaceAppId:
          !embedEnabled && get().pendingEmbedWorkspaceAppId === workspaceAppId
            ? null
            : get().pendingEmbedWorkspaceAppId,
      });
      return updated;
    } catch (error) {
      set({ appError: toCommandError(error) });
      return null;
    }
  },

  async embedWorkspaceAppWindow(workspaceAppId, hostBounds) {
    const startedWorkspaceId = get().currentWorkspaceId;
    set({
      pendingWorkspaceAppIds: uniqueIds(get().pendingWorkspaceAppIds, workspaceAppId),
      pendingEmbedWorkspaceAppId: workspaceAppId,
      appError: null,
    });

    let bounds = hostBounds;
    if (!bounds && typeof window !== 'undefined') {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => resolve());
        } else {
          resolve();
        }
      });
      bounds = queryEmbedHostBounds();
    }

    try {
      const result = await appApi.embedWorkspaceAppWindow({
        workspaceAppId,
        hostBounds: bounds,
      });
      const workspaceId = result.workspaceApp.workspaceId;
      const stillCurrent = get().currentWorkspaceId === workspaceId;
      const cached = upsertWorkspaceApp(
        stillCurrent
          ? get().workspaceApps
          : (get().workspaceAppsByWorkspaceId[workspaceId] ?? []),
        result.workspaceApp,
      );
      if (!stillCurrent && result.embedded) {
        await appApi.releaseEmbeddedWindow();
      }
      set({
        workspaceApps: stillCurrent ? cached : get().workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: cached,
        },
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
        pendingEmbedWorkspaceAppId:
          stillCurrent && result.embedded ? workspaceAppId : stillCurrent ? null : get().pendingEmbedWorkspaceAppId,
        embeddedWorkspaceAppId:
          stillCurrent && result.embedded ? workspaceAppId : stillCurrent ? null : get().embeddedWorkspaceAppId,
        appError:
          stillCurrent && result.reason
            ? { code: ERROR_CODES.VALIDATION, message: result.reason }
            : stillCurrent
              ? null
              : get().appError,
      });
      return result;
    } catch (error) {
      const stillCurrent = get().currentWorkspaceId === startedWorkspaceId;
      set({
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
        pendingEmbedWorkspaceAppId: stillCurrent ? null : get().pendingEmbedWorkspaceAppId,
        embeddedWorkspaceAppId: stillCurrent ? null : get().embeddedWorkspaceAppId,
        appError: stillCurrent ? toRawCommandError(error) : get().appError,
      });
      return null;
    }
  },

  async releaseEmbeddedWindow() {
    const embeddedWorkspaceAppId = get().embeddedWorkspaceAppId;
    try {
      await appApi.releaseEmbeddedWindow();
      set({
        embeddedWorkspaceAppId: null,
        pendingEmbedWorkspaceAppId: null,
      });
    } catch (error) {
      set({
        embeddedWorkspaceAppId: embeddedWorkspaceAppId,
        appError: toRawCommandError(error),
      });
    }
  },

  clearWorkspaceApps() {
    workspaceAppsRequestSeq += 1;
    if (get().embeddedWorkspaceAppId || get().pendingEmbedWorkspaceAppId) {
      void get().releaseEmbeddedWindow();
    }
    set({
      currentWorkspaceId: null,
      workspaceApps: [],
      workspaceAppsLoading: false,
      embeddedWorkspaceAppId: null,
      pendingEmbedWorkspaceAppId: null,
    });
  },

  syncWorkspaceAppCount(workspaceId) {
    return get().workspaceAppsByWorkspaceId[workspaceId]?.length ?? get().workspaceApps.length;
  },

  clearAppError() {
    set({ appError: null });
  },

  reset() {
    workspaceAppsRequestSeq += 1;
    set({ ...initialWorkspaceAppStoreData });
  },
}));
