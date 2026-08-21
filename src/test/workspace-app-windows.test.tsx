import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceAppCard } from '@/features/apps/components/workspace-app-card';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { windowApi } from '@/features/api/window-api';
import { mockWorkspaceApp, mockWorkspaceAppWindow } from '@/test/fixtures';

vi.mock('@/features/api/window-api', () => ({
  windowApi: {
    listWorkspaceAppWindows: vi.fn(),
    focusNativeWindow: vi.fn(),
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

describe('工作区软件卡片窗口列表', () => {
  const first = mockWorkspaceAppWindow({
    id: 'nw-1',
    title: 'Gmail - Google Chrome',
    lastFocusedAt: '2026-08-20T10:00:00Z',
  });
  const second = mockWorkspaceAppWindow({
    id: 'nw-2',
    title: 'Docs - Google Chrome',
    lastFocusedAt: '2026-08-20T09:00:00Z',
  });

  beforeEach(() => {
    useWorkspaceAppStore.getState().reset();
    vi.mocked(windowApi.listWorkspaceAppWindows).mockReset();
    vi.mocked(windowApi.focusNativeWindow).mockReset();
    vi.mocked(windowApi.listWorkspaceAppWindows).mockResolvedValue([first, second]);
    vi.mocked(windowApi.focusNativeWindow).mockResolvedValue(
      mockWorkspaceApp({ windowTitle: second.title }),
    );
  });

  it('展开后列出两扇窗口，点第二项走 focusNativeWindow', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const app = mockWorkspaceApp({
      nativeWindowId: 'hwnd-should-not-render',
      windowTitle: 'Chrome',
    });

    render(
      <WorkspaceAppCard
        app={app}
        onActivate={onActivate}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('workspace-app-windows-toggle'));
    const items = await screen.findAllByTestId('workspace-app-window-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Gmail - Google Chrome');
    expect(items[1]).toHaveTextContent('Docs - Google Chrome');
    expect(document.body.textContent?.toLowerCase()).not.toContain('hwnd');
    expect(document.body.textContent).not.toContain('hwnd-should-not-render');

    await user.click(items[1]);
    expect(windowApi.focusNativeWindow).toHaveBeenCalledWith({ windowId: 'nw-2' });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('点卡片主体仍走 onActivate，不调用 focusNativeWindow', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const app = mockWorkspaceApp({ status: 'running' });

    render(
      <WorkspaceAppCard
        app={app}
        onActivate={onActivate}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('workspace-app-activate-button'));
    expect(onActivate).toHaveBeenCalledWith(app);
    expect(windowApi.focusNativeWindow).not.toHaveBeenCalled();
  });

  it('已关闭窗口不出现在列表里，点列表不会聚焦关闭项', async () => {
    const user = userEvent.setup();
    vi.mocked(windowApi.listWorkspaceAppWindows).mockResolvedValue([
      first,
      mockWorkspaceAppWindow({
        id: 'nw-closed',
        title: 'Old tab',
        status: 'closed',
      }),
    ]);

    render(
      <WorkspaceAppCard
        app={mockWorkspaceApp()}
        onActivate={vi.fn()}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('workspace-app-windows-toggle'));
    const items = await screen.findAllByTestId('workspace-app-window-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Gmail - Google Chrome');
    expect(items[0]).toHaveAttribute('data-window-status', 'running');
    expect(screen.queryByText('Old tab')).not.toBeInTheDocument();
    expect(screen.queryByText('已关闭')).not.toBeInTheDocument();

    await user.click(items[0]);
    expect(windowApi.focusNativeWindow).toHaveBeenCalledWith({ windowId: 'nw-1' });
    expect(windowApi.focusNativeWindow).not.toHaveBeenCalledWith({ windowId: 'nw-closed' });
  });

  it('展开后若没有运行中窗口，显示空提示', async () => {
    const user = userEvent.setup();
    vi.mocked(windowApi.listWorkspaceAppWindows).mockResolvedValue([
      mockWorkspaceAppWindow({
        id: 'nw-closed',
        title: 'Old tab',
        status: 'closed',
      }),
    ]);

    render(
      <WorkspaceAppCard
        app={mockWorkspaceApp()}
        onActivate={vi.fn()}
        onReopen={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('workspace-app-windows-toggle'));
    expect(await screen.findByText('没有打开的窗口')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-app-window-item')).not.toBeInTheDocument();
    expect(screen.queryByText('Old tab')).not.toBeInTheDocument();
    expect(windowApi.focusNativeWindow).not.toHaveBeenCalled();
  });
});
