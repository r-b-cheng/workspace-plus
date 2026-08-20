import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceShell } from '@/app/workspace-shell';
import { appApi } from '@/features/api/app-api';
import { canvasApi } from '@/features/api/canvas-api';
import { settingsApi } from '@/features/api/settings-api';
import { AppApiError } from '@/features/api/tauri-client';
import { workspaceApi } from '@/features/api/workspace-api';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { SettingsDialog } from '@/features/settings/components/settings-dialog';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import type { AppSettings } from '@/lib/types';
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

vi.mock('@/features/api/settings-api', () => ({
  settingsApi: {
    getAppSettings: vi.fn(),
    updateAppSettings: vi.fn(),
  },
}));

function mockSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    quickSwitchShortcut: 'Control+KeyO',
    registrationStatus: 'registered',
    lastError: null,
    ...overrides,
  };
}

describe('全局设置弹窗', () => {
  it('展示当前快捷键和注册状态', () => {
    render(
      <SettingsDialog
        open
        settings={mockSettings({ quickSwitchShortcut: 'Alt+KeyK', registrationStatus: 'registered' })}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('settings-shortcut-input')).toHaveValue('Alt+KeyK');
    expect(screen.getByTestId('settings-registration-status')).toHaveTextContent('已注册');
    expect(screen.queryByTestId('settings-last-error')).not.toBeInTheDocument();
  });

  it('保存时调用 onSubmit，不直接 invoke', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const invoke = vi.fn();
    window.__TAURI_INVOKE_MOCK__ = invoke;

    render(
      <SettingsDialog open settings={mockSettings()} onOpenChange={vi.fn()} onSubmit={onSubmit} />,
    );

    await user.clear(screen.getByTestId('settings-shortcut-input'));
    await user.type(screen.getByTestId('settings-shortcut-input'), 'Control+Shift+KeyP');
    await user.click(screen.getByTestId('settings-save-button'));

    expect(onSubmit).toHaveBeenCalledWith('Control+Shift+KeyP');
    expect(invoke).not.toHaveBeenCalled();
    delete window.__TAURI_INVOKE_MOCK__;
  });

  it('conflict 时展示失败文案', () => {
    render(
      <SettingsDialog
        open
        settings={mockSettings({
          registrationStatus: 'conflict',
          lastError: '快捷键冲突：该组合可能已被其他程序占用。',
        })}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-registration-status')).toHaveTextContent('快捷键冲突');
    expect(screen.getByTestId('settings-last-error')).toHaveTextContent('快捷键冲突');
  });

  it('本次 errorMessage 优先于陈旧 conflict lastError', () => {
    render(
      <SettingsDialog
        open
        settings={mockSettings({
          registrationStatus: 'conflict',
          lastError: '快捷键冲突：该组合可能已被其他程序占用。',
        })}
        errorMessage="快捷键至少需要 Control、Alt 或 Meta 之一"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-last-error')).toHaveTextContent(
      '快捷键至少需要 Control、Alt 或 Meta 之一',
    );
    expect(screen.getByTestId('settings-last-error')).not.toHaveTextContent('快捷键冲突');
  });

  it('展示具体 Validation 文案而不是泛化格式不正确', () => {
    render(
      <SettingsDialog
        open
        settings={mockSettings()}
        errorMessage="快捷键缺少主键，请使用例如 Control+KeyO"
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-last-error')).toHaveTextContent(
      '快捷键缺少主键，请使用例如 Control+KeyO',
    );
    expect(screen.getByTestId('settings-last-error')).not.toHaveTextContent(
      '输入不完整或格式不正确',
    );
  });

  it('denied 时展示系统拒绝文案', () => {
    render(
      <SettingsDialog
        open
        settings={mockSettings({
          registrationStatus: 'denied',
          lastError: '系统拒绝注册该快捷键。',
        })}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-registration-status')).toHaveTextContent('系统拒绝注册');
    expect(screen.getByTestId('settings-last-error')).toHaveTextContent('系统拒绝注册该快捷键');
  });
});

describe('顶栏设置打开全局设置', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().reset();
    useWorkspaceAppStore.getState().reset();
    useCanvasStore.getState().reset();
    vi.mocked(workspaceApi.listWorkspaces).mockResolvedValue([mockWorkspace()]);
    vi.mocked(appApi.listWorkspaceApps).mockResolvedValue([]);
    vi.mocked(appApi.listInstalledApps).mockResolvedValue([]);
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1' }));
    vi.mocked(settingsApi.getAppSettings).mockResolvedValue(mockSettings());
    vi.mocked(settingsApi.updateAppSettings).mockReset();
  });

  it('顶栏设置打开全局设置而不是重命名', async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell />);

    await screen.findByTestId('current-workspace-title');
    expect(screen.getByTestId('workspace-settings-button')).toHaveTextContent('设置');

    await user.click(screen.getByTestId('workspace-settings-button'));

    expect(await screen.findByTestId('settings-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('rename-workspace-dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(settingsApi.getAppSettings).toHaveBeenCalled();
    });
  });

  it('保存快捷键走 settingsApi', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.updateAppSettings).mockResolvedValue(
      mockSettings({ quickSwitchShortcut: 'Alt+KeyK', registrationStatus: 'registered' }),
    );

    render(<WorkspaceShell />);
    await screen.findByTestId('current-workspace-title');
    await user.click(screen.getByTestId('workspace-settings-button'));
    await screen.findByTestId('settings-dialog');

    await user.clear(screen.getByTestId('settings-shortcut-input'));
    await user.type(screen.getByTestId('settings-shortcut-input'), 'Alt+KeyK');
    await user.click(screen.getByTestId('settings-save-button'));

    await waitFor(() => {
      expect(settingsApi.updateAppSettings).toHaveBeenCalledWith({
        quickSwitchShortcut: 'Alt+KeyK',
      });
    });
  });

  it('保存非法快捷键时展示后端 Validation 原文', async () => {
    const user = userEvent.setup();
    vi.mocked(settingsApi.getAppSettings).mockResolvedValue(
      mockSettings({
        registrationStatus: 'conflict',
        lastError: '快捷键冲突：该组合可能已被其他程序占用。',
      }),
    );
    vi.mocked(settingsApi.updateAppSettings).mockRejectedValue(
      new AppApiError('Validation', '快捷键至少需要 Control、Alt 或 Meta 之一'),
    );

    render(<WorkspaceShell />);
    await screen.findByTestId('current-workspace-title');
    await user.click(screen.getByTestId('workspace-settings-button'));
    await screen.findByTestId('settings-dialog');
    expect(screen.getByTestId('settings-last-error')).toHaveTextContent('快捷键冲突');

    await user.clear(screen.getByTestId('settings-shortcut-input'));
    await user.type(screen.getByTestId('settings-shortcut-input'), 'O');
    await user.click(screen.getByTestId('settings-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-last-error')).toHaveTextContent(
        '快捷键至少需要 Control、Alt 或 Meta 之一',
      );
    });
    expect(screen.getByTestId('settings-last-error')).not.toHaveTextContent('快捷键冲突');
    expect(screen.getByTestId('settings-last-error')).not.toHaveTextContent(
      '输入不完整或格式不正确',
    );
    expect(settingsApi.updateAppSettings).toHaveBeenCalledWith({ quickSwitchShortcut: 'O' });
  });
});
