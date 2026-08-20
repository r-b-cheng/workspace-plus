import type { InstalledApp, Workspace, WorkspaceApp } from '@/lib/types';

export function mockWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'ws-1',
    name: '论文写作',
    appCount: 0,
    updatedAt: '2026-08-20T10:00:00Z',
    archived: false,
    isActive: true,
    color: '#176bff',
    ...overrides,
  };
}

export function mockInstalledApp(overrides: Partial<InstalledApp> = {}): InstalledApp {
  return {
    id: 'app-chrome',
    name: 'Chrome',
    source: 'startMenu',
    launchKind: 'shortcut',
    alreadyInWorkspace: false,
    category: '浏览器',
    displayPath: undefined,
    isAvailable: true,
    platform: 'windows',
    ...overrides,
  };
}

export function mockWorkspaceApp(overrides: Partial<WorkspaceApp> = {}): WorkspaceApp {
  return {
    id: 'wa-1',
    workspaceId: 'ws-1',
    installedAppId: 'app-chrome',
    name: 'Chrome',
    status: 'running',
    ...overrides,
  };
}
