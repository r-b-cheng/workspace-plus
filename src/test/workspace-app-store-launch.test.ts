import { waitFor } from '@testing-library/react';
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
    setWorkspaceAppEmbed: vi.fn(),
    embedWorkspaceAppWindow: vi.fn(),
    releaseEmbeddedWindow: vi.fn(),
  },
}));

describe('addAndLaunchApp 不串工作区', () => {
  beforeEach(() => {
    useWorkspaceAppStore.getState().reset();
    vi.mocked(appApi.launchWorkspaceApp).mockReset();
    vi.mocked(appApi.listWorkspaceApps).mockReset();
    vi.mocked(appApi.embedWorkspaceAppWindow).mockReset();
    vi.mocked(appApi.releaseEmbeddedWindow).mockReset();
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

  it('预览返回前切到另一工作区时，不把 A 的预览态画到 B，并释放宿主', async () => {
    const launched = mockWorkspaceApp({
      id: 'wa-a',
      workspaceId: 'ws-a',
      embedEnabled: true,
    });
    const bApps = [
      mockWorkspaceApp({
        id: 'wa-b',
        workspaceId: 'ws-b',
        installedAppId: 'app-code',
        name: 'VS Code',
      }),
    ];

    let finishEmbed: (value: {
      workspaceApp: typeof launched;
      embedded: boolean;
      fallbackFocused: boolean;
      reason: string | null;
    }) => void = () => undefined;
    vi.mocked(appApi.embedWorkspaceAppWindow).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishEmbed = resolve;
        }),
    );
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue(bApps);
    vi.mocked(appApi.releaseEmbeddedWindow).mockResolvedValue({ released: true });

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [launched],
    });

    const pending = useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-a');
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBe('wa-a');
    });
    await useWorkspaceAppStore.getState().loadWorkspaceApps('ws-b');

    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-b');
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();

    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalled();
    });
    finishEmbed({
      workspaceApp: launched,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await pending;

    const state = useWorkspaceAppStore.getState();
    expect(state.currentWorkspaceId).toBe('ws-b');
    expect(state.workspaceApps.map((app) => app.id)).toEqual(['wa-b']);
    expect(state.embeddedWorkspaceAppId).toBeNull();
    expect(state.pendingEmbedWorkspaceAppId).toBeNull();
    expect(state.appError).toBeNull();
    expect(vi.mocked(appApi.releaseEmbeddedWindow).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('预览失败返回前切到另一工作区时，不把 A 的错误写到 B', async () => {
    let finishEmbed: (error: Error) => void = () => undefined;
    vi.mocked(appApi.embedWorkspaceAppWindow).mockImplementation(
      () =>
        new Promise((_, reject) => {
          finishEmbed = reject;
        }),
    );
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({
        id: 'wa-b',
        workspaceId: 'ws-b',
        installedAppId: 'app-code',
        name: 'VS Code',
      }),
    ]);
    vi.mocked(appApi.releaseEmbeddedWindow).mockResolvedValue({ released: true });

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-a', workspaceId: 'ws-a', embedEnabled: true })],
    });

    const pending = useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-a');
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBe('wa-a');
    });
    await useWorkspaceAppStore.getState().loadWorkspaceApps('ws-b');
    useWorkspaceAppStore.setState({
      embeddedWorkspaceAppId: 'wa-b',
      pendingEmbedWorkspaceAppId: 'wa-b',
      appError: null,
    });

    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalled();
    });
    finishEmbed(new Error('focus failed'));
    await pending;

    const state = useWorkspaceAppStore.getState();
    expect(state.currentWorkspaceId).toBe('ws-b');
    expect(state.embeddedWorkspaceAppId).toBe('wa-b');
    expect(state.pendingEmbedWorkspaceAppId).toBe('wa-b');
    expect(state.appError).toBeNull();
  });
});
