import { callCommand } from '@/features/api/tauri-client';
import type {
  FocusNativeWindowInput,
  ListWorkspaceAppWindowsInput,
  WorkspaceApp,
  WorkspaceAppWindow,
} from '@/lib/types';

export const windowApi = {
  listWorkspaceAppWindows(input: ListWorkspaceAppWindowsInput): Promise<WorkspaceAppWindow[]> {
    return callCommand<WorkspaceAppWindow[]>('list_workspace_app_windows', {
      workspaceAppId: input.workspaceAppId,
    });
  },

  focusNativeWindow(input: FocusNativeWindowInput): Promise<WorkspaceApp> {
    return callCommand<WorkspaceApp>('focus_native_window', {
      windowId: input.windowId,
    });
  },
};
