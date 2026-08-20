import { create } from 'zustand';

import { appApi } from '@/features/api/app-api';
import { AppApiError } from '@/features/api/tauri-client';
import { statusFromErrorCode } from '@/features/windows/window-status';
import { userMessageForError } from '@/lib/errors';
import type { CommandError, InstalledApp, WorkspaceApp } from '@/lib/types';

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
  appError: null,
};

let workspaceAppsRequestSeq = 0;

export const useWorkspaceAppStore = create<WorkspaceAppStore>((set, get) => ({
  ...initialWorkspaceAppStoreData,

  async loadWorkspaceApps(workspaceId) {
    const seq = ++workspaceAppsRequestSeq;
    set({
      currentWorkspaceId: workspaceId,
      workspaceApps: [],
      workspaceAppsLoading: true,
      appError: null,
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
      const workspaceApps = upsertWorkspaceApp(get().workspaceApps, launched);
      set({
        workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: workspaceApps,
        },
        launchingInstalledAppIds: withoutId(get().launchingInstalledAppIds, installedAppId),
        installedApps: get().installedApps.map((app) =>
          app.id === installedAppId ? { ...app, alreadyInWorkspace: true } : app,
        ),
        appDialogOpen: false,
      });
      return launched;
    } catch (error) {
      const appError = toCommandError(error);
      set({
        launchingInstalledAppIds: withoutId(get().launchingInstalledAppIds, installedAppId),
        appError,
      });
      await get().loadWorkspaceApps(workspaceId);
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
      const workspaceApps = upsertWorkspaceApp(get().workspaceApps, focused);
      const workspaceId = focused.workspaceId;
      set({
        workspaceApps,
        workspaceAppsByWorkspaceId: {
          ...get().workspaceAppsByWorkspaceId,
          [workspaceId]: workspaceApps,
        },
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
      });
      return focused;
    } catch (error) {
      const appError = toCommandError(error);
      const status = statusFromErrorCode(appError.code);
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
    if (app.status === 'running') {
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
        if (existing.status === 'running') {
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
        if (refreshed.status === 'running') {
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
      set({
        workspaceApps,
        workspaceAppsByWorkspaceId: workspaceId
          ? { ...get().workspaceAppsByWorkspaceId, [workspaceId]: workspaceApps }
          : get().workspaceAppsByWorkspaceId,
        pendingWorkspaceAppIds: withoutId(get().pendingWorkspaceAppIds, workspaceAppId),
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

  clearWorkspaceApps() {
    workspaceAppsRequestSeq += 1;
    set({
      currentWorkspaceId: null,
      workspaceApps: [],
      workspaceAppsLoading: false,
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
