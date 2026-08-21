import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/workspace-shell';
import { appApi } from '@/features/api/app-api';
import { canvasApi } from '@/features/api/canvas-api';
import { workspaceApi } from '@/features/api/workspace-api';
import { WorkspaceAppCard } from '@/features/apps/components/workspace-app-card';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { EMBED_PREVIEW_ACTION, EMBED_PREVIEW_LABEL, EXIT_EMBED_PREVIEW_LABEL } from '@/features/windows/embed-copy';
import { embedHostBoundsFromElement } from '@/features/windows/embed-host';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { mockCanvas, mockWorkspace, mockWorkspaceApp } from '@/test/fixtures';

vi.mock('@/features/api/workspace-api', () => ({
  workspaceApi: {
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    setActiveWorkspace: vi.fn(),
  },
}));

vi.mock('@/features/api/canvas-api', () => ({
  canvasApi: {
    getCanvas: vi.fn(),
    saveCanvas: vi.fn(),
    upsertCanvasNode: vi.fn(),
    deleteCanvasNode: vi.fn(),
    saveCanvasAsset: vi.fn(),
    readCanvasAsset: vi.fn(),
  },
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

function assertNoHwndOrForbiddenCopy() {
  const text = document.body.textContent ?? '';
  expect(text.toLowerCase()).not.toContain('hwnd');
  expect(text).not.toMatch(/内置浏览器|在此操作外部软件/);
}

describe('工作区预览模式', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useCanvasStore.getState().reset();
    vi.mocked(appApi.setWorkspaceAppEmbed).mockReset();
    vi.mocked(appApi.embedWorkspaceAppWindow).mockReset();
    vi.mocked(appApi.releaseEmbeddedWindow).mockReset();
    vi.mocked(appApi.focusWorkspaceApp).mockReset();
    vi.mocked(appApi.listWorkspaceApps).mockReset();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([mockWorkspace()]);
    vi.mocked(appApi.listInstalledApps).mockResolvedValue([]);
    vi.mocked(canvasApi.getCanvas).mockImplementation(async ({ workspaceId }) =>
      mockCanvas({ workspaceId: workspaceId ?? 'ws-1' }),
    );
    vi.mocked(appApi.focusWorkspaceApp).mockResolvedValue(mockWorkspaceApp());
    vi.mocked(appApi.releaseEmbeddedWindow).mockResolvedValue({ released: false });
  });

  it('卡片不再出现勾选或预览按钮', () => {
    render(
      <WorkspaceAppCard
        app={mockWorkspaceApp({ embedEnabled: true, status: 'running' })}
        onActivate={vi.fn()}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByText(EMBED_PREVIEW_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-app-embed-toggle-wa-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-app-embed-button-wa-1')).not.toBeInTheDocument();
    assertNoHwndOrForbiddenCopy();
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();
  });

  it('调度台点标签只走 activate，不进入预览', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ status: 'running' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([app]);
    vi.mocked(appApi.focusWorkspaceApp).mockResolvedValue(app);

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-wa-1');

    expect(screen.getByTestId('workspace-middle-pane')).toHaveAttribute('data-workspace-view', 'dispatcher');
    expect(screen.getByTestId('workspace-app-tab-preview-wa-1')).toHaveTextContent(EMBED_PREVIEW_ACTION);

    await user.click(screen.getByTestId('workspace-app-tab-wa-1'));
    await waitFor(() => {
      expect(appApi.focusWorkspaceApp).toHaveBeenCalledWith({ workspaceAppId: 'wa-1' });
    });
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();
    expect(screen.queryByTestId('workspace-overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-app-card')).toBeInTheDocument();
    expect(screen.queryByTestId('embed-preview-host')).not.toBeInTheDocument();
    assertNoHwndOrForbiddenCopy();
  });

  it('点卡片和切换窗口仍只走 focusWorkspaceApp', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ status: 'running' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([app]);
    vi.mocked(appApi.focusWorkspaceApp).mockResolvedValue(app);

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-card');

    await user.click(screen.getByTestId('workspace-app-activate-button'));
    await waitFor(() => {
      expect(appApi.focusWorkspaceApp).toHaveBeenCalledWith({ workspaceAppId: 'wa-1' });
    });
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '切换窗口' }));
    await waitFor(() => {
      expect(appApi.focusWorkspaceApp).toHaveBeenCalledTimes(2);
    });
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();
    assertNoHwndOrForbiddenCopy();
  });

  it('未运行标签不显示预览', async () => {
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([
      mockWorkspaceApp({ status: 'closed' }),
    ]);

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-wa-1');

    expect(screen.queryByTestId('workspace-app-tab-preview-wa-1')).not.toBeInTheDocument();
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();
  });

  it('运行中标签点预览会调用 embed，成功后中间栏切到预览', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ status: 'running' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([app]);
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: app,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-preview-wa-1');
    await user.click(screen.getByTestId('workspace-app-tab-preview-wa-1'));

    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAppId: 'wa-1' }),
      );
    });
    expect(appApi.focusWorkspaceApp).not.toHaveBeenCalled();

    expect(await screen.findByTestId('embed-preview-host')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-middle-pane')).toHaveAttribute('data-workspace-view', 'preview');
    expect(screen.getByTestId('embed-preview-host-surface').className).toMatch(/flex-1/);
    expect(screen.getByTestId('embed-preview-host-surface').className).toMatch(/min-h-0/);
    expect(screen.getByTestId('embed-preview-host-surface').className).toMatch(/pointer-events-none/);
    expect(screen.getByTestId('embed-preview-host-surface').className).not.toMatch(/min-h-\[240px\]/);
    expect(screen.getByTestId('embed-preview-exit-button')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-app-tab-preview-wa-1')).toHaveTextContent(EXIT_EMBED_PREVIEW_LABEL);
    expect(screen.queryByTestId('workspace-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-app-card')).not.toBeInTheDocument();
    assertNoHwndOrForbiddenCopy();
  });

  it('预览失败时回到调度台并展示 reason，不留下空宿主', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ status: 'running' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([app]);
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: app,
      embedded: false,
      fallbackFocused: true,
      reason: '浏览器或 Electron 窗口无法在本窗口预览。',
    });

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-preview-wa-1');
    await user.click(screen.getByTestId('workspace-app-tab-preview-wa-1'));

    expect(await screen.findByTestId('app-error-banner')).toHaveTextContent(
      '浏览器或 Electron 窗口无法在本窗口预览。',
    );
    expect(screen.getByTestId('app-error-banner')).not.toHaveTextContent('输入不完整或格式不正确');
    expect(screen.getByTestId('workspace-middle-pane')).toHaveAttribute('data-workspace-view', 'dispatcher');
    expect(screen.queryByTestId('embed-preview-host')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-app-card')).toBeInTheDocument();
    expect(appApi.focusWorkspaceApp).not.toHaveBeenCalled();
    assertNoHwndOrForbiddenCopy();
  });

  it('退出预览会 release 并回到调度台', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ status: 'running' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([app]);
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: app,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    vi.mocked(appApi.releaseEmbeddedWindow).mockResolvedValue({ released: true });

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-preview-wa-1');
    await user.click(screen.getByTestId('workspace-app-tab-preview-wa-1'));
    expect(await screen.findByTestId('embed-preview-host')).toBeInTheDocument();
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-1');
    });

    await user.click(screen.getByTestId('embed-preview-exit-button'));
    await waitFor(() => {
      expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('embed-preview-host')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('workspace-middle-pane')).toHaveAttribute('data-workspace-view', 'dispatcher');
    expect(screen.queryByTestId('workspace-overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-app-card')).toBeInTheDocument();
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
  });

  it('对另一个运行中软件点预览会换目标，点标签主体仍走 activate', async () => {
    const user = userEvent.setup();
    const first = mockWorkspaceApp({ id: 'wa-1', name: '记事本', status: 'running' });
    const second = mockWorkspaceApp({
      id: 'wa-2',
      name: '计算器',
      installedAppId: 'app-calc',
      status: 'running',
    });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([first, second]);
    vi.mocked(appApi.embedWorkspaceAppWindow).mockImplementation(async ({ workspaceAppId }) => ({
      workspaceApp: workspaceAppId === 'wa-2' ? second : first,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    }));
    vi.mocked(appApi.focusWorkspaceApp).mockResolvedValue(second);

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-preview-wa-1');
    await user.click(screen.getByTestId('workspace-app-tab-preview-wa-1'));
    expect(await screen.findByTestId('embed-preview-host')).toBeInTheDocument();
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-1');
    });

    await user.click(screen.getByTestId('workspace-app-tab-wa-2'));
    await waitFor(() => {
      expect(appApi.focusWorkspaceApp).toHaveBeenCalledWith({ workspaceAppId: 'wa-2' });
    });
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-1');

    await user.click(screen.getByTestId('workspace-app-tab-preview-wa-2'));
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAppId: 'wa-2' }),
      );
    });
    await waitFor(() => {
      expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBe('wa-2');
    });
    expect(screen.getByTestId('workspace-app-tab-preview-wa-2')).toHaveTextContent(EXIT_EMBED_PREVIEW_LABEL);
    expect(screen.getByTestId('workspace-middle-pane')).toHaveAttribute('data-workspace-view', 'preview');
    assertNoHwndOrForbiddenCopy();
  });

  it('切到另一工作区会退出预览，不把 A 的宿主画到 B', async () => {
    const user = userEvent.setup();
    const appA = mockWorkspaceApp({
      id: 'wa-1',
      workspaceId: 'ws-1',
      status: 'running',
    });
    const workspaceB = mockWorkspace({ id: 'ws-2', name: '工作区 B' });
    const appB = mockWorkspaceApp({
      id: 'wa-2',
      workspaceId: 'ws-2',
      name: 'VS Code',
      status: 'notStarted',
    });
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([
      mockWorkspace(),
      workspaceB,
    ]);
    vi.mocked(appApi.listWorkspaceApps).mockImplementation(async ({ workspaceId }) =>
      workspaceId === 'ws-2' ? [appB] : [appA],
    );
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: appA,
      embedded: true,
      fallbackFocused: false,
      reason: null,
    });
    vi.mocked(workspaceApi.setActiveWorkspace).mockResolvedValue(workspaceB);

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-tab-preview-wa-1');
    await user.click(screen.getByTestId('workspace-app-tab-preview-wa-1'));
    expect(await screen.findByTestId('embed-preview-host')).toBeInTheDocument();

    await user.click(screen.getByTestId('workspace-list-item-ws-2'));
    await waitFor(() => {
      expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('embed-preview-host')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('workspace-middle-pane')).toHaveAttribute('data-workspace-view', 'dispatcher');
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
    expect(useWorkspaceAppStore.getState().pendingEmbedWorkspaceAppId).toBeNull();
    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-2');
    assertNoHwndOrForbiddenCopy();
  });

  it('宿主 bounds 按视口 CSS 像素乘 DPR', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 100,
      width: 100,
      height: 80,
      toJSON() {
        return {};
      },
    });
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });

    expect(embedHostBoundsFromElement(el)).toEqual({
      x: 20,
      y: 40,
      width: 200,
      height: 160,
    });
  });
});
