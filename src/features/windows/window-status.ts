import { ERROR_CODES } from '@/lib/errors';
import type { WorkspaceApp, WorkspaceAppStatus } from '@/lib/types';

export function workspaceAppStatusLabel(status: WorkspaceAppStatus): string {
  switch (status) {
    case 'launching':
      return '启动中';
    case 'running':
      return '运行中';
    case 'closed':
      return '窗口已关闭';
    case 'launchFailed':
      return '启动失败';
    case 'focusFailed':
      return '聚焦失败';
    default:
      return '未启动';
  }
}

export function canFocusWorkspaceApp(status: WorkspaceAppStatus): boolean {
  return status === 'running';
}

export function canReopenWorkspaceApp(status: WorkspaceAppStatus): boolean {
  return status === 'closed' || status === 'focusFailed' || status === 'launchFailed' || status === 'notStarted';
}

export function statusFromErrorCode(code: string): WorkspaceAppStatus {
  switch (code) {
    case ERROR_CODES.WINDOW_CLOSED:
      return 'closed';
    case ERROR_CODES.FOCUS_DENIED:
      return 'focusFailed';
    default:
      return 'launchFailed';
  }
}

export function displayWorkspaceAppTitle(app: WorkspaceApp): string {
  if (app.alias) {
    return `${app.name} - ${app.alias}`;
  }
  return app.name;
}
