import { canFocusWorkspaceApp } from '@/features/windows/window-status';
import type { InstalledApp, WorkspaceApp } from '@/lib/types';

import {
  QUICK_SWITCH_ACTION_LABELS,
  QUICK_SWITCH_INSTALLED_LIMIT,
  type QuickSwitchAction,
  type QuickSwitchResult,
} from '@/features/quick-switch/types';

export type BuildQuickSwitchResultsInput = {
  query: string;
  workspaceApps: WorkspaceApp[];
  installedApps: InstalledApp[];
  installedLimit?: number;
};

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function includesQuery(value: string | undefined, query: string): boolean {
  if (!query) {
    return true;
  }
  return normalize(value).includes(query);
}

function workspaceAppMatches(app: WorkspaceApp, query: string): boolean {
  if (!query) {
    return true;
  }
  return (
    includesQuery(app.name, query) ||
    includesQuery(app.alias, query) ||
    includesQuery(app.note, query) ||
    includesQuery(app.windowTitle, query)
  );
}

function toWorkspaceResult(app: WorkspaceApp): QuickSwitchResult {
  const action: QuickSwitchAction = canFocusWorkspaceApp(app.status) ? 'focus' : 'reopen';
  const alias = app.alias?.trim();
  const note = app.note?.trim();
  const windowTitle = app.windowTitle?.trim();
  return {
    id: app.id,
    title: alias || app.name,
    subtitle: note || windowTitle || undefined,
    action,
    actionLabel: QUICK_SWITCH_ACTION_LABELS[action],
    workspaceAppId: app.id,
    installedAppId: app.installedAppId,
  };
}

function toCatalogResult(app: InstalledApp): QuickSwitchResult {
  return {
    id: `installed:${app.id}`,
    title: app.name,
    action: 'addAndLaunch',
    actionLabel: QUICK_SWITCH_ACTION_LABELS.addAndLaunch,
    installedAppId: app.id,
  };
}

export function buildQuickSwitchResults({
  query,
  workspaceApps,
  installedApps,
  installedLimit = QUICK_SWITCH_INSTALLED_LIMIT,
}: BuildQuickSwitchResultsInput): QuickSwitchResult[] {
  const normalized = query.trim().toLowerCase();
  const workspaceResults = workspaceApps.filter((app) => workspaceAppMatches(app, normalized)).map(toWorkspaceResult);
  const coveredInstalledIds = new Set(workspaceApps.map((app) => app.installedAppId));

  const catalogResults = installedApps
    .filter((app) => !coveredInstalledIds.has(app.id))
    .filter((app) => includesQuery(app.name, normalized))
    .slice(0, installedLimit)
    .map(toCatalogResult);

  return [...workspaceResults, ...catalogResults];
}
