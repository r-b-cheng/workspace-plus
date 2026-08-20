import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/workspace-shell';
import { appApi } from '@/features/api/app-api';
import { canvasApi } from '@/features/api/canvas-api';
import { workspaceApi } from '@/features/api/workspace-api';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { mockCanvas, mockWorkspace } from '@/test/fixtures';

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
    pickManualAppPath: vi.fn(),
  },
}));

describe('空状态引导新建工作区', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useCanvasStore.getState().reset();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([]);
    vi.mocked(workspaceApi.createWorkspace).mockReset();
    vi.mocked(workspaceApi.setActiveWorkspace).mockReset();
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([]);
    vi.mocked(appApi.listInstalledApps).mockResolvedValue([]);
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-paper', nodes: [], edges: [] }));
  });

  it('无工作区时展示空状态并引导新建', async () => {
    render(<WorkspaceShell />);

    expect(await screen.findByTestId('empty-workspaces-state')).toBeInTheDocument();
    expect(screen.getByTestId('create-workspace-button')).toBeInTheDocument();
    expect(screen.getByTestId('empty-workspaces-create-button')).toBeInTheDocument();
    expect(screen.queryByTestId('current-workspace-title')).not.toBeInTheDocument();
  });

  it('创建后选中新工作区', async () => {
    const user = userEvent.setup();
    const created = mockWorkspace({ id: 'ws-paper', name: '论文写作' });
    vi.mocked(workspaceApi.createWorkspace).mockResolvedValue(created);
    vi.mocked(workspaceApi.setActiveWorkspace).mockResolvedValue(created);

    render(<WorkspaceShell />);
    await screen.findByTestId('empty-workspaces-state');

    await user.click(screen.getByTestId('create-workspace-button'));
    await user.type(screen.getByTestId('create-workspace-name-input'), '论文写作');
    await user.click(screen.getByTestId('create-workspace-submit'));

    await waitFor(() => {
      expect(workspaceApi.createWorkspace).toHaveBeenCalledWith({
        name: '论文写作',
        color: '#176bff',
      });
    });
    expect(workspaceApi.setActiveWorkspace).toHaveBeenCalledWith({ workspaceId: 'ws-paper' });
    expect(await screen.findByTestId('current-workspace-title')).toHaveTextContent('论文写作');
    expect(screen.queryByTestId('empty-workspaces-state')).not.toBeInTheDocument();
  });
});
