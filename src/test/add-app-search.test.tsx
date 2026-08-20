import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddAppDialog } from '@/features/apps/components/add-app-dialog';
import { AppSearchResults, filterInstalledApps } from '@/features/apps/components/app-search-results';
import { mockInstalledApp } from '@/test/fixtures';

const installedApps = [
  mockInstalledApp({
    id: 'chrome',
    name: 'Chrome',
    alreadyInWorkspace: true,
    displayPath: 'C:\\Apps\\chrome.lnk',
  }),
  mockInstalledApp({
    id: 'code',
    name: 'VS Code',
    alreadyInWorkspace: false,
    category: '编辑器',
    displayPath: 'C:\\Apps\\Code.exe',
  }),
  mockInstalledApp({
    id: 'notes',
    name: 'Notes',
    alreadyInWorkspace: false,
    displayPath: 'C:\\Apps\\notes.exe',
  }),
];

describe('添加软件搜索与已加入状态', () => {
  it('按名称过滤软件列表', () => {
    const filtered = filterInstalledApps(installedApps, 'code');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe('VS Code');
  });

  it('搜索框只显示匹配项', async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();

    const { rerender } = render(
      <AddAppDialog
        open
        query=""
        apps={installedApps}
        onOpenChange={vi.fn()}
        onQueryChange={onQueryChange}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onAddManual={vi.fn()}
      />,
    );

    expect(screen.getByTestId('installed-app-result-chrome')).toBeInTheDocument();
    expect(screen.getByTestId('installed-app-result-code')).toBeInTheDocument();

    await user.type(screen.getByTestId('add-app-search-input'), 'chrome');
    expect(onQueryChange).toHaveBeenCalled();

    rerender(
      <AddAppDialog
        open
        query="chrome"
        apps={installedApps}
        onOpenChange={vi.fn()}
        onQueryChange={onQueryChange}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
        onAddManual={vi.fn()}
      />,
    );

    expect(screen.getByTestId('installed-app-result-chrome')).toBeInTheDocument();
    expect(screen.queryByTestId('installed-app-result-code')).not.toBeInTheDocument();
    expect(screen.queryByTestId('installed-app-result-notes')).not.toBeInTheDocument();
  });

  it('已加入显示“已在当前工作区”', () => {
    render(
      <AppSearchResults apps={installedApps} query="" launchingAppIds={[]} onSelect={vi.fn()} />,
    );

    expect(screen.getByTestId('installed-app-action-chrome')).toHaveTextContent('已在当前工作区');
    expect(screen.getByTestId('installed-app-action-code')).toHaveTextContent('添加并打开');
  });
});
