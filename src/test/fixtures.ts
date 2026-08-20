import type { Canvas, CanvasNode, InstalledApp, Workspace, WorkspaceApp } from '@/lib/types';

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

export function mockCanvasNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'n-1',
    workspaceId: 'ws-1',
    nodeType: 'markdown',
    title: '笔记',
    contentMarkdown: '# hello',
    x: 40,
    y: 80,
    width: 280,
    height: 200,
    zIndex: 1,
    createdAt: '2026-08-20T10:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    ...overrides,
  };
}

export function mockCanvas(overrides: Partial<Canvas> = {}): Canvas {
  const workspaceId = overrides.workspaceId ?? 'ws-1';
  return {
    workspaceId,
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
    updatedAt: '2026-08-20T10:00:00Z',
    ...overrides,
  };
}
