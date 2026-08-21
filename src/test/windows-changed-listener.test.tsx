import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appApi } from '@/features/api/app-api';
import { windowApi } from '@/features/api/window-api';
import {
  currentEmbedPreviewSeq,
  useWorkspaceAppStore,
} from '@/features/apps/store/workspace-app-store';
import {
  applyWorkspaceWindowsChanged,
  listenWorkspaceWindowsChanged,
  useWindowsChangedBridge,
  WORKSPACE_WINDOWS_CHANGED_EVENT,
  type WorkspaceWindowsChangedPayload,
} from '@/features/windows/listen-windows-changed';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { mockWorkspaceApp, mockWorkspaceAppWindow } from '@/test/fixtures';

const listenMock = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

vi.mock('@/features/api/app-api', () => ({
  appApi: {
    listWorkspaceApps: vi.fn(),
    listInstalledApps: vi.fn(),
    searchInstalledApps: vi.fn(),
    refreshInstalledApps: vi.fn(),
    addManualApp: vi.fn(),
    launchWorkspaceApp: vi.fn(),
    focusWorkspaceApp: vi.fn(),
    removeWorkspaceApp: vi.fn(),
    setWorkspaceAppEmbed: vi.fn(),
    embedWorkspaceAppWindow: vi.fn(),
    releaseEmbeddedWindow: vi.fn(),
    pickManualAppPath: vi.fn(),
  },
}));

vi.mock('@/features/api/window-api', () => ({
  windowApi: {
    listWorkspaceAppWindows: vi.fn(),
    focusNativeWindow: vi.fn(),
  },
}));

function WindowsChangedHost() {
  useWindowsChangedBridge();
  return null;
}

describe('窗口存活事件', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    listenMock.mockReset();
    vi.mocked(appApi.listWorkspaceApps).mockReset();
    vi.mocked(windowApi.listWorkspaceAppWindows).mockReset();
    vi.mocked(appApi.releaseEmbeddedWindow).mockReset();
    vi.mocked(appApi.releaseEmbeddedWindow).mockResolvedValue({ released: true });
    vi.mocked(appApi.embedWorkspaceAppWindow).mockReset();
    vi.mocked(windowApi.listWorkspaceAppWindows).mockResolvedValue([
      mockWorkspaceAppWindow({ status: 'closed' }),
    ]);
  });

  it('当前工作区事件会刷新软件列表和已展开窗口', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      expandedWorkspaceAppIds: ['wa-1'],
      workspaceApps: [mockWorkspaceApp({ status: 'running' })],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ status: 'closed' }),
    ]);

    await applyWorkspaceWindowsChanged({ workspaceId: 'ws-1', workspaceAppId: 'wa-1' });

    expect(appApi.listWorkspaceApps).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    expect(windowApi.listWorkspaceAppWindows).toHaveBeenCalledWith({ workspaceAppId: 'wa-1' });
  });

  it('其他工作区事件不刷新', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      expandedWorkspaceAppIds: ['wa-1'],
    });

    await applyWorkspaceWindowsChanged({ workspaceId: 'ws-other' });

    expect(appApi.listWorkspaceApps).not.toHaveBeenCalled();
    expect(windowApi.listWorkspaceAppWindows).not.toHaveBeenCalled();
  });

  it('预览中的软件不再运行时退出预览', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      embeddedWorkspaceAppId: 'wa-1',
      workspaceApps: [mockWorkspaceApp({ status: 'running' })],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ status: 'closed' }),
    ]);

    await applyWorkspaceWindowsChanged({ workspaceId: 'ws-1' });

    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
  });

  it('listen 收到事件后走同样的刷新', async () => {
    let handler: ((event: { payload: WorkspaceWindowsChangedPayload }) => void) | undefined;
    listenMock.mockImplementation(async (_event: string, cb: typeof handler) => {
      handler = cb;
      return () => undefined;
    });
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      expandedWorkspaceAppIds: ['wa-1'],
      workspaceApps: [mockWorkspaceApp({ status: 'running' })],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ status: 'closed' }),
    ]);

    render(<WindowsChangedHost />);
    await waitFor(() => {
      expect(listenMock).toHaveBeenCalledWith(
        WORKSPACE_WINDOWS_CHANGED_EVENT,
        expect.any(Function),
      );
    });

    handler?.({ payload: { workspaceId: 'ws-1', workspaceAppId: 'wa-1' } });

    await waitFor(() => {
      expect(appApi.listWorkspaceApps).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
      expect(windowApi.listWorkspaceAppWindows).toHaveBeenCalledWith({
        workspaceAppId: 'wa-1',
      });
    });
  });

  it('切走后丢弃进行中的原地刷新，不把旧工作区软件写回来', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' })],
    });

    let resolveList: ((apps: ReturnType<typeof mockWorkspaceApp>[]) => void) | undefined;
    vi.mocked(appApi.listWorkspaceApps).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const pending = applyWorkspaceWindowsChanged({ workspaceId: 'ws-1' });

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-2',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-2' })],
    });

    resolveList?.([
      mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'closed' }),
    ]);
    await pending;

    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-2');
    expect(useWorkspaceAppStore.getState().workspaceApps.map((app) => app.id)).toEqual(['wa-2']);
  });

  it('切走并开始新预览后，过期的 previewReleased 不得释放新宿主', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      expandedWorkspaceAppIds: ['wa-1'],
      embeddedWorkspaceAppId: 'wa-1',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' })],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' }),
    ]);

    let resolveWindows: ((windows: ReturnType<typeof mockWorkspaceAppWindow>[]) => void) | undefined;
    vi.mocked(windowApi.listWorkspaceAppWindows).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWindows = resolve;
        }),
    );

    const pending = applyWorkspaceWindowsChanged({
      workspaceId: 'ws-1',
      previewReleased: true,
    });

    await waitFor(() => {
      expect(windowApi.listWorkspaceAppWindows).toHaveBeenCalledWith({
        workspaceAppId: 'wa-1',
      });
    });

    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-2',
      embeddedWorkspaceAppId: 'wa-2',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-2', status: 'running' })],
    });

    resolveWindows?.([mockWorkspaceAppWindow({ status: 'closed' })]);
    await pending;

    expect(appApi.releaseEmbeddedWindow).not.toHaveBeenCalled();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-2');
  });

  it('同工作区 reload 等待期间新预览不得被过期 previewReleased 释放', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      embeddedWorkspaceAppId: 'wa-1',
      workspaceApps: [
        mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' }),
        mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-1', status: 'running' }),
      ],
    });

    let resolveList: ((apps: ReturnType<typeof mockWorkspaceApp>[]) => void) | undefined;
    vi.mocked(appApi.listWorkspaceApps).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    const pending = applyWorkspaceWindowsChanged({
      workspaceId: 'ws-1',
      previewReleased: true,
    });

    await waitFor(() => {
      expect(appApi.listWorkspaceApps).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    });

    const seqBeforeReembed = currentEmbedPreviewSeq();
    const nextApp = mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-1', status: 'running' });
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: nextApp,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-2', {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });

    expect(currentEmbedPreviewSeq()).toBeGreaterThan(seqBeforeReembed);
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-2');

    resolveList?.([
      mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' }),
      nextApp,
    ]);
    await pending;

    expect(appApi.releaseEmbeddedWindow).not.toHaveBeenCalled();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-2');
  });

  it('previewReleased 时即使软件仍 running 也退出预览', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      embeddedWorkspaceAppId: 'wa-1',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-1', status: 'running' })],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ id: 'wa-1', status: 'running' }),
    ]);

    await applyWorkspaceWindowsChanged({ workspaceId: 'ws-1', previewReleased: true });

    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
  });

  it('同工作区已预览另一软件时，过期 previewReleased 不得释放新宿主', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      workspaceApps: [
        mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' }),
        mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-1', status: 'running' }),
      ],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' }),
      mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-1', status: 'running' }),
    ]);

    const nextApp = mockWorkspaceApp({ id: 'wa-2', workspaceId: 'ws-1', status: 'running' });
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: nextApp,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-2', {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });

    expect(currentEmbedPreviewSeq()).toBeGreaterThan(1);
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-2');
    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-1');

    await applyWorkspaceWindowsChanged({
      workspaceId: 'ws-1',
      workspaceAppId: 'wa-1',
      previewReleased: true,
      previewSeq: 1,
    });

    expect(appApi.releaseEmbeddedWindow).not.toHaveBeenCalled();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-2');
  });

  it('previewReleased 对准当前预览 seq 时退出预览', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: 'ws-1' });
    useWorkspaceAppStore.setState({
      currentWorkspaceId: 'ws-1',
      workspaceApps: [mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' })],
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' }),
    ]);

    const app = mockWorkspaceApp({ id: 'wa-1', workspaceId: 'ws-1', status: 'running' });
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: app,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    await useWorkspaceAppStore.getState().embedWorkspaceAppWindow('wa-1', {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });

    const previewSeq = currentEmbedPreviewSeq();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-1');

    await applyWorkspaceWindowsChanged({
      workspaceId: 'ws-1',
      workspaceAppId: 'wa-1',
      previewReleased: true,
      previewSeq,
    });

    expect(appApi.releaseEmbeddedWindow).toHaveBeenCalledWith({ workspaceAppId: 'wa-1' });
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
  });

  it('无 Tauri 时 listen 静默返回清理函数', async () => {
    listenMock.mockRejectedValue(new Error('no tauri'));
    const unlisten = await listenWorkspaceWindowsChanged(vi.fn());
    expect(typeof unlisten).toBe('function');
    unlisten();
  });
});
