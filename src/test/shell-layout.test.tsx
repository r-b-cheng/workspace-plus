import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/workspace-shell';
import {
  clampLeftWidth,
  clampRightWidth,
  LEFT_SIDEBAR_DEFAULT,
  LEFT_SIDEBAR_MAX,
  LEFT_SIDEBAR_MIN,
  normalizeShellLayout,
  resizedLeftWidth,
  resizedRightWidth,
  RIGHT_SIDEBAR_MAX,
  RIGHT_SIDEBAR_MIN,
  SHELL_LAYOUT_STORAGE_KEY,
  writeShellLayout,
} from '@/app/shell-layout';
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

describe('三栏宽度与左侧收缩', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useCanvasStore.getState().reset();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([mockWorkspace()]);
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([]);
    vi.mocked(appApi.listInstalledApps).mockResolvedValue([]);
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1' }));
  });

  it('限制左右栏宽度范围', () => {
    expect(clampLeftWidth(80)).toBe(LEFT_SIDEBAR_MIN);
    expect(clampLeftWidth(999)).toBe(LEFT_SIDEBAR_MAX);
    expect(clampRightWidth(80)).toBe(RIGHT_SIDEBAR_MIN);
    expect(clampRightWidth(999)).toBe(RIGHT_SIDEBAR_MAX);
    expect(clampLeftWidth(Number.NaN)).toBe(LEFT_SIDEBAR_DEFAULT);
    expect(resizedLeftWidth(292, 292, 340)).toBe(340);
    expect(resizedRightWidth(390, 800, 760)).toBe(430);
    expect(normalizeShellLayout({ leftWidth: 80, rightWidth: 900, leftCollapsed: true })).toEqual({
      leftWidth: LEFT_SIDEBAR_MIN,
      rightWidth: RIGHT_SIDEBAR_MAX,
      leftCollapsed: true,
    });
  });

  it('可以收起和展开左侧工作区列表', async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell />);

    expect(await screen.findByTestId('workspace-sidebar')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByRole('heading', { name: '工作区列表' })).toBeInTheDocument();

    await user.click(screen.getByTestId('collapse-workspace-sidebar-button'));

    expect(screen.getByTestId('workspace-sidebar')).toHaveAttribute('data-collapsed', 'true');
    expect(screen.queryByRole('heading', { name: '工作区列表' })).not.toBeInTheDocument();
    expect(screen.getByTestId('create-workspace-button')).toBeInTheDocument();

    await user.click(screen.getByTestId('collapse-workspace-sidebar-button'));
    expect(screen.getByTestId('workspace-sidebar')).toHaveAttribute('data-collapsed', 'false');
    expect(screen.getByRole('heading', { name: '工作区列表' })).toBeInTheDocument();
  });

  it('拖拽分隔条会改变栏宽并写回本地', async () => {
    render(<WorkspaceShell />);
    await screen.findByTestId('workspace-sidebar');
    expect(screen.getByTestId('left-panel-resize-handle')).toBeInTheDocument();
    expect(screen.getByTestId('right-panel-resize-handle')).toBeInTheDocument();

    writeShellLayout({
      leftWidth: resizedLeftWidth(292, 292, 340),
      rightWidth: 390,
      leftCollapsed: false,
    });
    expect(JSON.parse(window.localStorage.getItem(SHELL_LAYOUT_STORAGE_KEY) ?? '{}')).toMatchObject({
      leftWidth: 340,
    });
  });
});
