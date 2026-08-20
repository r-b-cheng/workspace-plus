import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/workspace-shell';
import { appApi } from '@/features/api/app-api';
import { canvasApi } from '@/features/api/canvas-api';
import { workspaceApi } from '@/features/api/workspace-api';
import { AppApiError } from '@/features/api/tauri-client';
import { WINDOW_CLOSED_HINT } from '@/features/apps/components/workspace-app-card';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
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

describe('窗口关闭提示与重开', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useCanvasStore.getState().reset();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([mockWorkspace()]);
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([mockWorkspaceApp({ status: 'running' })]);
    vi.mocked(appApi.listInstalledApps).mockResolvedValue([]);
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1' }));
    vi.mocked(appApi.focusWorkspaceApp).mockReset();
    vi.mocked(appApi.launchWorkspaceApp).mockReset();
  });

  it('focus 返回 WindowClosed 时出现关闭提示和重开，且不重载冲掉状态', async () => {
    const user = userEvent.setup();
    vi.mocked(appApi.focusWorkspaceApp).mockRejectedValue(new AppApiError('WindowClosed', 'gone'));

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-card');
    const listCallsAfterLoad = vi.mocked(appApi.listWorkspaceApps).mock.calls.length;

    await user.click(screen.getByTestId('workspace-app-activate-button'));

    expect(await screen.findByTestId('window-closed-banner')).toHaveTextContent(WINDOW_CLOSED_HINT);
    expect(screen.getByTestId('window-closed-hint')).toHaveTextContent(WINDOW_CLOSED_HINT);
    expect(screen.getByTestId('workspace-app-reopen-button-wa-1')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'closed');
    expect(vi.mocked(appApi.listWorkspaceApps).mock.calls.length).toBe(listCallsAfterLoad);
  });

  it('重开走 launch 且不会长出第二张卡', async () => {
    const user = userEvent.setup();
    const closed = mockWorkspaceApp({ status: 'closed', errorMessage: WINDOW_CLOSED_HINT });
    const reopened = mockWorkspaceApp({ status: 'running', windowTitle: 'Chrome' });
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([closed]);
    vi.mocked(appApi.launchWorkspaceApp).mockResolvedValue(reopened);

    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-app-reopen-button-wa-1');
    await user.click(screen.getByTestId('workspace-app-reopen-button-wa-1'));

    await waitFor(() => {
      expect(appApi.launchWorkspaceApp).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        installedAppId: 'app-chrome',
      });
    });
    expect(screen.getAllByTestId('workspace-app-card')).toHaveLength(1);
    expect(screen.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');
  });
});
