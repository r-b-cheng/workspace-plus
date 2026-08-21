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
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalled();
    });
    await useWorkspaceAppStore.getState().loadWorkspaceApps('ws-b');

    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-b');
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();

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
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalledWith({ workspaceAppId: 'wa-a' });
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
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalled();
    });
    await useWorkspaceAppStore.getState().loadWorkspaceApps('ws-b');
    useWorkspaceAppStore.setState({
      embeddedWorkspaceAppId: 'wa-b',
      pendingEmbedWorkspaceAppId: 'wa-b',
      appError: null,
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

describe('预览请求世代与定向释放', () => {
  beforeEach(() => {
    useWorkspaceAppStore.getState().reset();
    vi.mocked(appApi.embedWorkspaceAppWindow).mockReset();
    vi.mocked(appApi.releaseEmbeddedWindow).mockReset();
    vi.mocked(appApi.releaseEmbeddedWindow).mockResolvedValue({ released: true });
  });

  it('预览 A 未返回时开始预览 B，A 的成功不得释放 B', async () => {
    const appA = mockWorkspaceApp({ id: 'wa-a', workspaceId: 'ws-a', name: '记事本' });
    const appB = mockWorkspaceApp({
      id: 'wa-b',
      workspaceId: 'ws-a',
      name: '计算器',
      installedAppId: 'app-calc',
    });
    let finishA: (value: {
      workspaceApp: typeof appA;
      embedded: boolean;
      fallbackFocused: boolean;
      reason: string | null;
    }) => void = () => undefined;
    let finishB: (value: {
      workspaceApp: typeof appB;
      embedded: boolean;
      fallbackFocused: boolean;
      reason: string | null;
    }) => void = () => undefined;
    vi.mocked(appApi.embedWorkspaceAppWindow).mockImplementation(({ workspaceAppId }) => {
      return new Promise((resolve) => {
        if (workspaceAppId === 'wa-a') {
          finishA = resolve;
          return;
        }
        finishB = resolve;
      });
    });

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [appA, appB],
    });

    const pendingA = useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-a');
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBe('wa-a');
    });
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAppId: 'wa-a' }),
      );
    });
    const pendingB = useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-b');
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBe('wa-b');
    });
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAppId: 'wa-b' }),
      );
    });

    finishA({
      workspaceApp: appA,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await pendingA;

    const mid = useWorkspaceAppStore.getState();
    expect(mid.embeddedWorkspaceAppId === 'wa-b' || mid.pendingEmbedWorkspaceAppId === 'wa-b').toBe(
      true,
    );
    expect(mid.embeddedWorkspaceAppId).not.toBe('wa-a');
    expect(mid.pendingEmbedWorkspaceAppId).not.toBe('wa-a');
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalledWith({ workspaceAppId: 'wa-a' });
    expect(
      vi.mocked(appApi.releaseEmbeddedWindow).mock.calls.every(([input]) => {
        return Boolean(input?.workspaceAppId);
      }),
    ).toBe(true);

    finishB({
      workspaceApp: appB,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await pendingB;

    const state = useWorkspaceAppStore.getState();
    expect(state.embeddedWorkspaceAppId).toBe('wa-b');
    expect(state.pendingEmbedWorkspaceAppId).toBeNull();
    expect(state.appError).toBeNull();
  });

  it('预览 A 未返回时退出，A 的成功只定向释放 A', async () => {
    const appA = mockWorkspaceApp({ id: 'wa-a', workspaceId: 'ws-a' });
    let finishA: (value: {
      workspaceApp: typeof appA;
      embedded: boolean;
      fallbackFocused: boolean;
      reason: string | null;
    }) => void = () => undefined;
    vi.mocked(appApi.embedWorkspaceAppWindow).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishA = resolve;
        }),
    );

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [appA],
    });

    const pendingA = useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-a');
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBe('wa-a');
    });
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalled();
    });
    await useWorkspaceAppStore.getState().releaseEmbeddedWindow();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
    expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBeNull();

    finishA({
      workspaceApp: appA,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await pendingA;

    const state = useWorkspaceAppStore.getState();
    expect(state.embeddedWorkspaceAppId).toBeNull();
    expect(state.pendingEmbedWorkspaceAppId).toBeNull();
    expect(state.appError).toBeNull();
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalledWith();
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalledWith({ workspaceAppId: 'wa-a' });
  });

  it('releaseEmbeddedWindow 先清预览 id，不等待 command', async () => {
    let finishRelease: (value: { released: boolean }) => void = () => undefined;
    vi.mocked(appApi.releaseEmbeddedWindow).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRelease = resolve;
        }),
    );

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-a', workspaceId: 'ws-a' })],
      embeddedWorkspaceAppId: 'wa-a',
      pendingEmbedWorkspaceAppId: null,
    });

    const pending = useWorkspaceAppStore.getState().releaseEmbeddedWindow();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
    expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBeNull();
    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();

    finishRelease({ released: true });
    await pending;
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
  });

  it('已嵌入时 bounds 更新抛错会回到调度台并写出原因', async () => {
    const appA = mockWorkspaceApp({ id: 'wa-a', workspaceId: 'ws-a' });
    vi.mocked(appApi.embedWorkspaceAppWindow).mockRejectedValue(new Error('focus failed'));

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-a',
      workspaceApps: [appA],
      embeddedWorkspaceAppId: 'wa-a',
      pendingEmbedWorkspaceAppId: null,
      appError: null,
    });

    const result = await useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-a', {
      x: 8,
      y: 16,
      width: 320,
      height: 240,
    });

    expect(result).toBeNull();
    const state = useWorkspaceAppStore.getState();
    expect(state.embeddedWorkspaceAppId).toBeNull();
    expect(state.pendingEmbedWorkspaceAppId).toBeNull();
    expect(state.appError).not.toBeNull();
  });
});
