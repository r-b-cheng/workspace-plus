import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appApi } from '@/features/api/app-api';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { mockInstalledApp, mockWorkspaceApp } from '@/test/fixtures';

vi.mock('@/features/api/app-api', () => ({
  appApi: {
    listWorkspaceApps: vi.fn(),
    listInstalledApps: vi.fn(),
    launchWorkspaceApp: vi.fn(),
    focusWorkspaceApp: vi.fn(),
    removeWorkspaceApp: vi.fn(),
    searchInstalledApps: vi.fn(),
    refreshInstalledApps: vi.fn(),
    addManualApp: vi.fn(),
    pickManualAppPath: vi.fn(),
  },
}));

describe('addAndLaunchApp 不串工作区', () => {
  beforeEach(() => {
    useWorkspaceAppStore.getState().reset();
    vi.mocked(appApi.launchWorkspaceApp).mockReset();
    vi.mocked(appApi.listWorkspaceApps).mockReset();
  });

  it('启动返回前切到另一工作区时，不把 A 的软件画到 B', async () => {
    const launched = mockWorkspaceApp({
      id: 'wa-a',
      workspaceId: 'ws-a',
      installedAppId: 'app-chrome',
      name: 'Chrome',
    });
    const bApps = [
      mockWorkspaceApp({
        id: 'wa-b',
        workspaceId: 'ws-b',
        installedAppId: 'app-code',
        name: 'VS Code',
      }),
    ];

    let finishLaunch: (value: typeof launched) => void = () => undefined;
    vi.mocked(appApi.launchWorkspaceApp).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLaunch = resolve;
        }),
    );
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue(bApps);

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [],
      installedApps: [mockInstalledApp({ id: 'app-chrome' })],
    });

    const pending = useWorkspaceAppStore.getState().addAndLaunchApp('ws-a', 'app-chrome');
    await useWorkspaceAppStore.getState().loadWorkspaceApps('ws-b');

    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-b');
    expect(useWorkspaceAppStore.getState().workspaceApps.map((app) => app.id)).toEqual(['wa-b']);

    finishLaunch(launched);
    await pending;

    const state = useWorkspaceAppStore.getState();
    expect(state.currentWorkspaceId).toBe('ws-b');
    expect(state.workspaceApps.map((app) => app.id)).toEqual(['wa-b']);
    expect(state.workspaceAppsByWorkspaceId['ws-a']?.map((app) => app.id)).toEqual(['wa-a']);
    expect(state.workspaceAppsByWorkspaceId['ws-b']?.map((app) => app.id)).toEqual(['wa-b']);
    expect(state.installedApps[0]?.alreadyInWorkspace).toBe(false);
  });
});
