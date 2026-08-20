/**
 * MOCK ONLY — 不是 Windows 置前证据
 * 也不是系统级全局热键已注册成功的证据。本文件用 __E2E_OPEN_QUICK_SWITCH__ 打开面板。
 */
import { expect, test } from '@playwright/test';

import {
  addInstalledApp,
  createWorkspace,
  openMockApp,
  openQuickSwitchViaHook,
  workspaceListItem,
} from './helpers';

test('无工作区时 hook 打开面板是空状态，不崩溃', async ({ page }) => {
  await openMockApp(page);
  await openQuickSwitchViaHook(page);

  await expect(page.getByTestId('quick-switch-empty')).toBeVisible();
  await expect(page.getByTestId('quick-switch-empty')).toHaveAttribute('data-empty-reason', 'no-workspace');
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
});

test('hook 打开后面板可按名称过滤', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '快速切换过滤');
  await addInstalledApp(page, 'app-chrome');

  await openQuickSwitchViaHook(page);
  await page.getByTestId('quick-switch-input').fill('zzz');
  await expect(page.getByTestId('quick-switch-empty')).toHaveAttribute('data-empty-reason', 'no-matches');

  await page.getByTestId('quick-switch-input').fill('chrome');
  await expect(page.getByTestId('quick-switch-item')).toHaveCount(1);
  await expect(page.getByTestId('quick-switch-item')).toContainText('Chrome');
  await expect(page.getByTestId('quick-switch-action')).toHaveText('切换窗口');
});

test('Enter 对 running 项走 mock focus，不是真置前', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '快速切换聚焦');
  await addInstalledApp(page, 'app-chrome');
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');

  const cardId = await page.getByTestId('workspace-app-card').getAttribute('data-workspace-app-card-id');
  expect(cardId).toBeTruthy();

  await openQuickSwitchViaHook(page);
  await page.getByTestId('quick-switch-input').fill('chrome');
  await page.getByTestId('quick-switch-input').press('Enter');

  await expect(page.getByTestId('quick-switch-panel')).toHaveCount(0);
  await expect.poll(async () =>
    page.evaluate(() => window.__E2E_MOCK_CONTROL__?.lastFocusWorkspaceAppId ?? null),
  ).toBe(cardId);
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');
});

test('关闭项在面板里显示重新打开，Enter 后仍是一张 running 卡', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '快速切换重开');
  await addInstalledApp(page, 'app-chrome');
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');

  const cardId = await page.getByTestId('workspace-app-card').getAttribute('data-workspace-app-card-id');
  expect(cardId).toBeTruthy();

  await page.evaluate((id) => {
    if (!window.__E2E_MOCK_CONTROL__?.closeWorkspaceApp) {
      throw new Error('E2E closeWorkspaceApp missing');
    }
    window.__E2E_MOCK_CONTROL__.closeWorkspaceApp(id);
  }, cardId as string);

  await workspaceListItem(page, '快速切换重开').click();
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'closed');

  await openQuickSwitchViaHook(page);
  await page.getByTestId('quick-switch-input').fill('chrome');
  await expect(page.getByTestId('quick-switch-item')).toHaveCount(1);
  await expect(page.getByTestId('quick-switch-action')).toHaveText('重新打开');

  await page.getByTestId('quick-switch-input').press('Enter');
  await expect(page.getByTestId('quick-switch-panel')).toHaveCount(0);
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');
  await expect(page.getByTestId('workspace-app-card')).toContainText('Chrome');
});

test('未加入项显示添加并打开，Enter 后出现一张 running 卡', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '快速切换添加');
  await addInstalledApp(page, 'app-chrome');
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);

  await openQuickSwitchViaHook(page);
  await page.getByTestId('quick-switch-input').fill('VS');
  await expect(page.getByTestId('quick-switch-item')).toHaveCount(1);
  await expect(page.getByTestId('quick-switch-item')).toContainText('VS Code');
  await expect(page.getByTestId('quick-switch-action')).toHaveText('添加并打开');

  await page.getByTestId('quick-switch-input').press('Enter');
  await expect(page.getByTestId('quick-switch-panel')).toHaveCount(0);
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(2);
  await expect(page.getByTestId('workspace-app-card').filter({ hasText: 'VS Code' })).toHaveAttribute(
    'data-app-status',
    'running',
  );
});

test('设置读写快捷键后 hook 仍能打开面板，不是真热键换绑证据', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '设置快捷键');

  await page.getByTestId('workspace-settings-button').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await expect(page.getByTestId('settings-shortcut-input')).toHaveValue('Control+KeyO');

  await page.getByTestId('settings-shortcut-input').fill('Alt+KeyK');
  await page.getByTestId('settings-save-button').click();
  await expect(page.getByTestId('settings-save-button')).toHaveText('保存');
  await expect(page.getByTestId('settings-shortcut-input')).toHaveValue('Alt+KeyK');

  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);

  await page.getByTestId('workspace-settings-button').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await expect(page.getByTestId('settings-shortcut-input')).toHaveValue('Alt+KeyK');

  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);

  await openQuickSwitchViaHook(page);
  await expect(page.getByTestId('quick-switch-input')).toBeVisible();
});
