import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/workspace-shell';
import { appApi } from '@/features/api/app-api';
import { canvasApi } from '@/features/api/canvas-api';
import { workspaceApi } from '@/features/api/workspace-api';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { QuickSwitchPanel, useQuickSwitchBridge } from '@/features/quick-switch';
import { listenQuickSwitchOpen } from '@/features/quick-switch/listen-quick-switch';
import { useQuickSwitchStore } from '@/features/quick-switch/store/quick-switch-store';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { mockCanvas, mockInstalledApp, mockWorkspace, mockWorkspaceApp } from '@/test/fixtures';

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

function QuickSwitchHost() {
  useQuickSwitchBridge();
  return <QuickSwitchPanel />;
}

function seedPanelStores() {
  const activateWorkspaceApp = vi.fn().mockResolvedValue(null);
  const reopenWorkspaceApp = vi.fn().mockResolvedValue(null);
  const addAndLaunchApp = vi.fn().mockResolvedValue(null);

  useWorkspaceStore.setState({
    workspaces: [mockWorkspace()],
    selectedWorkspaceId: 'ws-1',
  });
  useWorkspaceAppStore.setState({
    workspaceApps: [
      mockWorkspaceApp({
        id: 'wa-chrome',
        installedAppId: 'app-chrome',
        name: 'Chrome',
        status: 'running',
        nativeWindowId: 'should-not-render',
      }),
      mockWorkspaceApp({
        id: 'wa-code',
        installedAppId: 'app-code',
        name: 'VS Code',
        status: 'closed',
      }),
    ],
    installedApps: [
      mockInstalledApp({ id: 'app-chrome', name: 'Chrome', alreadyInWorkspace: true }),
      mockInstalledApp({ id: 'app-figma', name: 'Figma', alreadyInWorkspace: false }),
    ],
    activateWorkspaceApp,
    reopenWorkspaceApp,
    addAndLaunchApp,
  });

  return { activateWorkspaceApp, reopenWorkspaceApp, addAndLaunchApp };
}

describe('快速切换浮层', () => {
  const originalAppActions = {
    activateWorkspaceApp: useWorkspaceAppStore.getState().activateWorkspaceApp,
    reopenWorkspaceApp: useWorkspaceAppStore.getState().reopenWorkspaceApp,
    addAndLaunchApp: useWorkspaceAppStore.getState().addAndLaunchApp,
  };

  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useWorkspaceAppStore.setState(originalAppActions);
    useQuickSwitchStore.getState().reset();
    vi.mocked(appApi.listInstalledApps).mockImplementation(async () => {
      return useWorkspaceAppStore.getState().installedApps;
    });
  });

  it('无工作区时打开面板展示空状态且不报错', async () => {
    useWorkspaceStore.setState({ selectedWorkspaceId: null, workspaces: [] });
    useQuickSwitchStore.getState().openPanel();

    expect(() => render(<QuickSwitchPanel />)).not.toThrow();
    expect(await screen.findByTestId('quick-switch-empty')).toHaveAttribute('data-empty-reason', 'no-workspace');
    expect(screen.getByTestId('quick-switch-empty')).toHaveTextContent('还没有工作区');
    expect(screen.getByTestId('quick-switch-input')).toHaveFocus();
  });

  it('没有匹配项时展示空状态', async () => {
    const user = userEvent.setup();
    seedPanelStores();
    useQuickSwitchStore.getState().openPanel();
    render(<QuickSwitchPanel />);

    await user.type(screen.getByTestId('quick-switch-input'), 'zzz-not-exist');
    expect(screen.getByTestId('quick-switch-empty')).toHaveAttribute('data-empty-reason', 'no-matches');
    expect(screen.getByTestId('quick-switch-empty')).toHaveTextContent('没有匹配的软件');
  });

  it('打开后焦点在输入框，上下选择，Enter 分发对应动作', async () => {
    const user = userEvent.setup();
    const { activateWorkspaceApp, reopenWorkspaceApp, addAndLaunchApp } = seedPanelStores();
    useQuickSwitchStore.getState().openPanel();
    render(<QuickSwitchPanel />);

    const input = screen.getByTestId('quick-switch-input');
    expect(input).toHaveFocus();

    const items = screen.getAllByTestId('quick-switch-item');
    expect(items[0]).toHaveAttribute('data-selected', 'true');
    expect(items[0]).toHaveAttribute('data-action', 'focus');
    expect(within(items[0]).getByTestId('quick-switch-action')).toHaveTextContent('切换窗口');
    expect(within(items[1]).getByTestId('quick-switch-action')).toHaveTextContent('重新打开');
    expect(within(items[2]).getByTestId('quick-switch-action')).toHaveTextContent('添加并打开');

    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByTestId('quick-switch-item')[1]).toHaveAttribute('data-selected', 'true');
    await user.keyboard('{Enter}');

    expect(reopenWorkspaceApp).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wa-code', status: 'closed' }),
    );
    expect(activateWorkspaceApp).not.toHaveBeenCalled();
    expect(addAndLaunchApp).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quick-switch-panel')).not.toBeInTheDocument();
  });

  it('Enter 对运行中软件走聚焦', async () => {
    const user = userEvent.setup();
    const { activateWorkspaceApp, reopenWorkspaceApp, addAndLaunchApp } = seedPanelStores();
    useQuickSwitchStore.getState().openPanel();
    render(<QuickSwitchPanel />);

    await user.keyboard('{Enter}');
    expect(activateWorkspaceApp).toHaveBeenCalledWith(expect.objectContaining({ id: 'wa-chrome' }));
    expect(reopenWorkspaceApp).not.toHaveBeenCalled();
    expect(addAndLaunchApp).not.toHaveBeenCalled();
    expect(screen.queryByTestId('quick-switch-panel')).not.toBeInTheDocument();
  });

  it('Enter 对未加入软件走添加并打开', async () => {
    const user = userEvent.setup();
    const { activateWorkspaceApp, addAndLaunchApp } = seedPanelStores();
    useQuickSwitchStore.getState().openPanel();
    render(<QuickSwitchPanel />);

    await user.type(screen.getByTestId('quick-switch-input'), 'figma');
    await user.keyboard('{Enter}');
    expect(addAndLaunchApp).toHaveBeenCalledWith('ws-1', 'app-figma');
    expect(activateWorkspaceApp).not.toHaveBeenCalled();
  });

  it('Esc 关闭面板，执行失败时面板仍关闭', async () => {
    const user = userEvent.setup();
    const { activateWorkspaceApp } = seedPanelStores();
    activateWorkspaceApp.mockRejectedValue(new Error('focus failed'));
    useQuickSwitchStore.getState().openPanel();
    render(<QuickSwitchPanel />);

    expect(screen.getByTestId('quick-switch-panel')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('quick-switch-panel')).not.toBeInTheDocument();

    act(() => {
      useQuickSwitchStore.getState().openPanel();
    });
    expect(screen.getByTestId('quick-switch-panel')).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(activateWorkspaceApp).toHaveBeenCalled();
    expect(screen.queryByTestId('quick-switch-panel')).not.toBeInTheDocument();
  });

  it('e2e hook 可打开面板', async () => {
    render(<QuickSwitchHost />);
    expect(screen.queryByTestId('quick-switch-panel')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(typeof window.__E2E_OPEN_QUICK_SWITCH__).toBe('function');
    });
    act(() => {
      window.__E2E_OPEN_QUICK_SWITCH__?.();
    });
    expect(screen.getByTestId('quick-switch-panel')).toBeInTheDocument();
  });

  it('组件不直接 invoke，界面不出现原生窗口字段', async () => {
    const user = userEvent.setup();
    seedPanelStores();
    const invoke = vi.fn();
    window.__TAURI_INVOKE_MOCK__ = invoke;
    useQuickSwitchStore.getState().openPanel();
    render(<QuickSwitchPanel />);

    expect(screen.getByTestId('quick-switch-panel').textContent).not.toContain('should-not-render');
    expect(screen.getByTestId('quick-switch-panel').textContent).not.toMatch(/HWND/i);
    await user.keyboard('{Enter}');
    expect(invoke).not.toHaveBeenCalled();
    delete window.__TAURI_INVOKE_MOCK__;
  });
});

describe('工作区壳上的快速切换入口', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useCanvasStore.getState().reset();
    useQuickSwitchStore.getState().reset();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([]);
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([]);
    vi.mocked(appApi.listInstalledApps).mockResolvedValue([]);
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1' }));
  });

  it('无工作区时按钮打开空状态面板', async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell />);

    await screen.findByTestId('empty-workspaces-state');
    await user.click(screen.getByTestId('quick-switch-open-button'));

    expect(screen.getByTestId('quick-switch-panel')).toBeInTheDocument();
    expect(screen.getByTestId('quick-switch-empty')).toHaveAttribute('data-empty-reason', 'no-workspace');
  });

  it('有工作区时按钮打开面板且 listen 失败不白屏', async () => {
    const user = userEvent.setup();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([mockWorkspace()]);
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([mockWorkspaceApp({ status: 'running' })]);

    render(<WorkspaceShell />);
    await screen.findByTestId('current-workspace-title');
    expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();

    await user.click(screen.getByTestId('quick-switch-open-button'));
    expect(screen.getByTestId('quick-switch-panel')).toBeInTheDocument();
    expect(screen.getByTestId('quick-switch-item')).toHaveAttribute('data-action', 'focus');
  });
});

describe('listenQuickSwitchOpen', () => {
  it('无 Tauri 时静默返回清理函数', async () => {
    const onOpen = vi.fn();
    const unlisten = await listenQuickSwitchOpen(onOpen);
    expect(typeof unlisten).toBe('function');
    unlisten();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
