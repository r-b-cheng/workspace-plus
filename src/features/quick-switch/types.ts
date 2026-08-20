export type QuickSwitchAction = 'focus' | 'reopen' | 'addAndLaunch';

export type QuickSwitchResult = {
  id: string;
  title: string;
  subtitle?: string;
  action: QuickSwitchAction;
  actionLabel: string;
  workspaceAppId?: string;
  installedAppId?: string;
};

export const QUICK_SWITCH_ACTION_LABELS: Record<QuickSwitchAction, string> = {
  focus: '切换窗口',
  reopen: '重新打开',
  addAndLaunch: '添加并打开',
};

export const QUICK_SWITCH_OPEN_EVENT = 'quick-switch:open';
export const QUICK_SWITCH_INSTALLED_LIMIT = 20;
