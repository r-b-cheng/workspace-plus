import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { buildQuickSwitchResults } from '@/features/quick-switch/build-results';
import { executeQuickSwitchResult } from '@/features/quick-switch/execute-result';
import { QUICK_SWITCH_ACTION_LABELS, QUICK_SWITCH_INSTALLED_LIMIT } from '@/features/quick-switch/types';
import { mockInstalledApp, mockWorkspaceApp } from '@/test/fixtures';

const workspaceApps = [
  mockWorkspaceApp({
    id: 'wa-chrome',
    installedAppId: 'app-chrome',
    name: 'Chrome',
    alias: '浏览器',
    note: '查资料',
    windowTitle: '论文草稿 - Chrome',
    status: 'running',
  }),
  mockWorkspaceApp({
    id: 'wa-code',
    installedAppId: 'app-code',
    name: 'VS Code',
    status: 'closed',
  }),
  mockWorkspaceApp({
    id: 'wa-notes',
    installedAppId: 'app-notes',
    name: 'Notes',
    status: 'notStarted',
  }),
];

const installedApps = [
  mockInstalledApp({ id: 'app-chrome', name: 'Chrome', alreadyInWorkspace: true }),
  mockInstalledApp({ id: 'app-code', name: 'VS Code', alreadyInWorkspace: true }),
  mockInstalledApp({ id: 'app-figma', name: 'Figma', alreadyInWorkspace: false }),
  mockInstalledApp({ id: 'app-slack', name: 'Slack', alreadyInWorkspace: false }),
];

describe('buildQuickSwitchResults', () => {
  it('按名称、别名、备注、窗口标题过滤', () => {
    expect(buildQuickSwitchResults({ query: 'chrome', workspaceApps, installedApps }).map((item) => item.id)).toEqual([
      'wa-chrome',
    ]);
    expect(buildQuickSwitchResults({ query: '浏览', workspaceApps, installedApps }).map((item) => item.id)).toEqual([
      'wa-chrome',
    ]);
    expect(buildQuickSwitchResults({ query: '查资料', workspaceApps, installedApps }).map((item) => item.id)).toEqual([
      'wa-chrome',
    ]);
    expect(buildQuickSwitchResults({ query: '论文草稿', workspaceApps, installedApps }).map((item) => item.id)).toEqual([
      'wa-chrome',
    ]);
  });

  it('running 走 focus，closed 走 reopen，未加入走 addAndLaunch', () => {
    const results = buildQuickSwitchResults({ query: '', workspaceApps, installedApps });
    expect(results[0]).toMatchObject({
      id: 'wa-chrome',
      action: 'focus',
      actionLabel: QUICK_SWITCH_ACTION_LABELS.focus,
    });
    expect(results[1]).toMatchObject({
      id: 'wa-code',
      action: 'reopen',
      actionLabel: QUICK_SWITCH_ACTION_LABELS.reopen,
    });
    expect(results.find((item) => item.id === 'installed:app-figma')).toMatchObject({
      action: 'addAndLaunch',
      actionLabel: QUICK_SWITCH_ACTION_LABELS.addAndLaunch,
      installedAppId: 'app-figma',
    });
  });

  it('工作区结果优先，未加入项排在后面且默认限制数量', () => {
    const extraInstalled = Array.from({ length: 30 }, (_, index) =>
      mockInstalledApp({ id: `app-extra-${index}`, name: `Extra ${index}`, alreadyInWorkspace: false }),
    );
    const results = buildQuickSwitchResults({
      query: '',
      workspaceApps,
      installedApps: [...installedApps, ...extraInstalled],
    });

    expect(results.slice(0, 3).map((item) => item.id)).toEqual(['wa-chrome', 'wa-code', 'wa-notes']);
    expect(results.some((item) => item.id.startsWith('installed:'))).toBe(true);
    expect(results.filter((item) => item.action === 'addAndLaunch')).toHaveLength(QUICK_SWITCH_INSTALLED_LIMIT);
  });

  it('以当前工作区绑定为准，不沿用上一区的 alreadyInWorkspace', () => {
    const results = buildQuickSwitchResults({
      query: '',
      workspaceApps: [workspaceApps[1]],
      installedApps: [
        mockInstalledApp({ id: 'app-chrome', name: 'Chrome', alreadyInWorkspace: true }),
        mockInstalledApp({ id: 'app-code', name: 'VS Code', alreadyInWorkspace: true }),
        mockInstalledApp({ id: 'app-figma', name: 'Figma', alreadyInWorkspace: false }),
      ],
    });

    expect(results.map((item) => item.id)).toEqual(['wa-code', 'installed:app-chrome', 'installed:app-figma']);
    expect(results.find((item) => item.id === 'installed:app-chrome')?.action).toBe('addAndLaunch');
    expect(results.some((item) => item.id === 'installed:app-code')).toBe(false);
  });

  it('无工作区软件时结果为空数组', () => {
    expect(buildQuickSwitchResults({ query: 'chrome', workspaceApps: [], installedApps: [] })).toEqual([]);
  });

  it('结果不包含原生窗口字段', () => {
    const results = buildQuickSwitchResults({
      query: '',
      workspaceApps: [mockWorkspaceApp({ nativeWindowId: 'native-window-1', status: 'running' })],
      installedApps: [],
    });
    expect(results[0]).not.toHaveProperty('nativeWindowId');
    expect(JSON.stringify(results[0])).not.toContain('nativeWindow');
  });
});

describe('executeQuickSwitchResult', () => {
  it('三种动作只调用对应依赖', async () => {
    const activateWorkspaceApp = vi.fn().mockResolvedValue(null);
    const reopenWorkspaceApp = vi.fn().mockResolvedValue(null);
    const addAndLaunchApp = vi.fn().mockResolvedValue(null);
    const deps = {
      workspaceId: 'ws-1',
      workspaceApps,
      activateWorkspaceApp,
      reopenWorkspaceApp,
      addAndLaunchApp,
    };

    await executeQuickSwitchResult(
      { id: 'wa-chrome', title: 'Chrome', action: 'focus', actionLabel: '切换窗口', workspaceAppId: 'wa-chrome' },
      deps,
    );
    await executeQuickSwitchResult(
      { id: 'wa-code', title: 'VS Code', action: 'reopen', actionLabel: '重新打开', workspaceAppId: 'wa-code' },
      deps,
    );
    await executeQuickSwitchResult(
      {
        id: 'installed:app-figma',
        title: 'Figma',
        action: 'addAndLaunch',
        actionLabel: '添加并打开',
        installedAppId: 'app-figma',
      },
      deps,
    );

    expect(activateWorkspaceApp).toHaveBeenCalledWith(workspaceApps[0]);
    expect(reopenWorkspaceApp).toHaveBeenCalledWith(workspaceApps[1]);
    expect(addAndLaunchApp).toHaveBeenCalledWith('ws-1', 'app-figma');
  });

  it('无工作区时不执行 addAndLaunch', async () => {
    const addAndLaunchApp = vi.fn();
    await executeQuickSwitchResult(
      {
        id: 'installed:app-figma',
        title: 'Figma',
        action: 'addAndLaunch',
        actionLabel: '添加并打开',
        installedAppId: 'app-figma',
      },
      {
        workspaceId: null,
        workspaceApps: [],
        activateWorkspaceApp: vi.fn(),
        reopenWorkspaceApp: vi.fn(),
        addAndLaunchApp,
      },
    );
    expect(addAndLaunchApp).not.toHaveBeenCalled();
  });
});

describe('quick-switch 源码约束', () => {
  it('feature 源码不含 HWND 和 invoke', () => {
    const files = [
      'src/features/quick-switch/types.ts',
      'src/features/quick-switch/build-results.ts',
      'src/features/quick-switch/execute-result.ts',
      'src/features/quick-switch/listen-quick-switch.ts',
      'src/features/quick-switch/store/quick-switch-store.ts',
      'src/features/quick-switch/components/quick-switch-panel.tsx',
      'src/features/quick-switch/components/quick-switch-open-button.tsx',
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/HWND/);
      expect(source, file).not.toMatch(/\binvoke\s*\(/);
      expect(source, file).not.toMatch(/globalShortcut|global-shortcut|register\(/);
    }
  });
});
