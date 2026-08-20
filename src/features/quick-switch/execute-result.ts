import type { WorkspaceApp } from '@/lib/types';

import type { QuickSwitchResult } from '@/features/quick-switch/types';

export type ExecuteQuickSwitchDeps = {
  workspaceId: string | null;
  workspaceApps: WorkspaceApp[];
  activateWorkspaceApp: (app: WorkspaceApp) => Promise<unknown>;
  reopenWorkspaceApp: (app: WorkspaceApp) => Promise<unknown>;
  addAndLaunchApp: (workspaceId: string, installedAppId: string) => Promise<unknown>;
};

function findWorkspaceApp(workspaceApps: WorkspaceApp[], workspaceAppId?: string): WorkspaceApp | undefined {
  if (!workspaceAppId) {
    return undefined;
  }
  return workspaceApps.find((app) => app.id === workspaceAppId);
}

export async function executeQuickSwitchResult(
  result: QuickSwitchResult,
  deps: ExecuteQuickSwitchDeps,
): Promise<void> {
  if (result.action === 'addAndLaunch') {
    if (!deps.workspaceId || !result.installedAppId) {
      return;
    }
    await deps.addAndLaunchApp(deps.workspaceId, result.installedAppId);
    return;
  }

  const workspaceApp = findWorkspaceApp(deps.workspaceApps, result.workspaceAppId);
  if (!workspaceApp) {
    return;
  }

  if (result.action === 'focus') {
    await deps.activateWorkspaceApp(workspaceApp);
    return;
  }

  await deps.reopenWorkspaceApp(workspaceApp);
}
