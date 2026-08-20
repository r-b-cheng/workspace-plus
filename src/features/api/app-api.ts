import { AppApiError, callCommand } from '@/features/api/tauri-client';
import type {
  AddManualAppInput,
  InstalledApp,
  LaunchWorkspaceAppInput,
  ListInstalledAppsInput,
  RemoveWorkspaceAppResult,
  SearchInstalledAppsInput,
  WorkspaceApp,
  WorkspaceAppIdInput,
  WorkspaceIdInput,
} from '@/lib/types';

export async function pickManualAppPath(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: '可执行文件或快捷方式', extensions: ['exe', 'lnk'] }],
    });

    if (typeof selected === 'string' && selected.trim()) {
      return selected;
    }
    return null;
  } catch (error) {
    if (error instanceof AppApiError) {
      throw error;
    }
    throw new AppApiError('Internal', '无法打开文件选择对话框', error);
  }
}

export const appApi = {
  listWorkspaceApps(input: WorkspaceIdInput): Promise<WorkspaceApp[]> {
    return callCommand<WorkspaceApp[]>('list_workspace_apps', {
      workspaceId: input.workspaceId,
    });
  },

  listInstalledApps(input: ListInstalledAppsInput = {}): Promise<InstalledApp[]> {
    return callCommand<InstalledApp[]>('list_installed_apps', {
      workspaceId: input.workspaceId,
    });
  },

  searchInstalledApps(input: SearchInstalledAppsInput): Promise<InstalledApp[]> {
    return callCommand<InstalledApp[]>('search_installed_apps', {
      query: input.query,
      workspaceId: input.workspaceId,
    });
  },

  refreshInstalledApps(): Promise<InstalledApp[]> {
    return callCommand<InstalledApp[]>('refresh_installed_apps');
  },

  addManualApp(input: AddManualAppInput): Promise<InstalledApp> {
    return callCommand<InstalledApp>('add_manual_app', {
      path: input.path,
      workspaceId: input.workspaceId,
    });
  },

  launchWorkspaceApp(input: LaunchWorkspaceAppInput): Promise<WorkspaceApp> {
    return callCommand<WorkspaceApp>('launch_workspace_app', {
      workspaceId: input.workspaceId,
      installedAppId: input.installedAppId,
    });
  },

  focusWorkspaceApp(input: WorkspaceAppIdInput): Promise<WorkspaceApp> {
    return callCommand<WorkspaceApp>('focus_workspace_app', {
      workspaceAppId: input.workspaceAppId,
    });
  },

  removeWorkspaceApp(input: WorkspaceAppIdInput): Promise<RemoveWorkspaceAppResult> {
    return callCommand<RemoveWorkspaceAppResult>('remove_workspace_app', {
      workspaceAppId: input.workspaceAppId,
    });
  },

  pickManualAppPath,
};
