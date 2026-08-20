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
import { EMBED_PREVIEW_LABEL } from '@/features/windows/embed-copy';
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

describe('在本窗口预览（opt-in）', () => {
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

  it('默认不出现预览按钮，开关文案是在本窗口预览', () => {
    const app = mockWorkspaceApp();
    expect(app.embedEnabled).toBe(false);

    render(
      <WorkspaceAppCard
        app={app}
        onActivate={vi.fn()}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText(EMBED_PREVIEW_LABEL)).toBeInTheDocument();
    expect(screen.getByTestId('workspace-app-embed-toggle-wa-1')).not.toBeChecked();
    expect(screen.queryByTestId('workspace-app-embed-button-wa-1')).not.toBeInTheDocument();
    assertNoHwndOrForbiddenCopy();
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();
  });

  it('打开开关后点预览才调用 embed，点卡片仍只走 activate', async () => {
    const user = userEvent.setup();
    const enabled = mockWorkspaceApp({ embedEnabled: true });
    vi.mocked(appApi.setWorkspaceAppEmbed).mockResolvedValue(enabled);
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: enabled,
      embedded: false,
      fallbackFocused: true,
      reason: '浏览器或 Electron 窗口无法在本窗口预览。',
    });

    const onActivate = vi.fn();
    const { rerender } = render(
      <WorkspaceAppCard
        app={mockWorkspaceApp()}
        onActivate={onActivate}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('workspace-app-embed-toggle-wa-1'));
    expect(appApi.setWorkspaceAppEmbed).toHaveBeenCalledWith({
      workspaceAppId: 'wa-1',
      embedEnabled: true,
    });
    expect(appApi.embedWorkspaceAppWindow).not.toHaveBeenCalled();
    expect(appApi.focusWorkspaceApp).not.toHaveBeenCalled();

    rerender(
      <WorkspaceAppCard
        app={enabled}
        onActivate={onActivate}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('workspace-app-embed-button-wa-1'));
    await waitFor(() => {
      expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceAppId: 'wa-1' }),
      );
    });
    expect(appApi.focusWorkspaceApp).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('workspace-app-activate-button'));
    expect(onActivate).toHaveBeenCalledWith(enabled);
    expect(appApi.embedWorkspaceAppWindow).toHaveBeenCalledTimes(1);
    assertNoHwndOrForbiddenCopy();
  });

  it('点卡片和切换窗口仍只走 focusWorkspaceApp', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ embedEnabled: true, status: 'running' });
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

  it('预览失败时直接展示 reason，不走通用错误文案', async () => {
    const user = userEvent.setup();
    const app = mockWorkspaceApp({ embedEnabled: true, status: 'running' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([app]);
    vi.mocked(appApi.embedWorkspaceAppWindow).mockResolvedValue({
      workspaceApp: app,
      embedded: false,
      fallbackFocused: true,
      reason: '浏览器或 Electron 窗口无法在本窗口预览。',
    });

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-embed-button-wa-1');
    await user.click(screen.getByTestId('workspace-app-embed-button-wa-1'));

    expect(await screen.findByTestId('app-error-banner')).toHaveTextContent(
      '浏览器或 Electron 窗口无法在本窗口预览。',
    );
    expect(screen.getByTestId('app-error-banner')).not.toHaveTextContent('输入不完整或格式不正确');
    expect(appApi.focusWorkspaceApp).not.toHaveBeenCalled();
    assertNoHwndOrForbiddenCopy();
  });

  it('切到另一工作区会退出预览，不把 A 的宿主画到 B', async () => {
    const user = userEvent.setup();
    const appA = mockWorkspaceApp({
      id: 'wa-1',
      workspaceId: 'ws-1',
      embedEnabled: true,
      status: 'running',
    });
    const workspaceB = mockWorkspace({ id: 'ws-2', name: '工作区 B' });
    const appB = mockWorkspaceApp({
      id: 'wa-2',
      workspaceId: 'ws-2',
      name: 'VS Code',
      embedEnabled: false,
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
    await screen.findByTestId('workspace-app-embed-button-wa-1');
    await user.click(screen.getByTestId('workspace-app-embed-button-wa-1'));
    expect(await screen.findByTestId('embed-preview-host')).toBeInTheDocument();

    await user.click(screen.getByTestId('workspace-list-item-ws-2'));
    await waitFor(() => {
      expect(appApi.releaseEmbeddedWindow).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('embed-preview-host')).not.toBeInTheDocument();
    });
    expect(useWorkspaceAppStore.getState().embeddedWorkspaceAppId).toBeNull();
    expect(useWorkspaceAppStore.getState().currentWorkspaceId).toBe('ws-2');
    assertNoHwndOrForbiddenCopy();
  });
});
