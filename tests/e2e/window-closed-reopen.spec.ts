// MOCK ONLY — 不是 Windows 置前证据

import { expect, test } from '@playwright/test';

import { addInstalledApp, createWorkspace, openMockApp } from './helpers';

test('mock focus 返回 WindowClosed 时出现关闭提示和重开按钮', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '关闭提示工作区');
  await addInstalledApp(page, 'app-chrome');
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');

  await page.evaluate(() => {
    if (!window.__E2E_MOCK_CONTROL__) {
      throw new Error('E2E mock control missing');
    }
    window.__E2E_MOCK_CONTROL__.failNextFocus = true;
  });

  await page.getByTestId('workspace-app-activate-button').click();

  await expect(page.getByTestId('window-closed-banner')).toBeVisible();
  await expect(page.getByTestId('window-closed-banner')).toContainText('窗口已关闭');
  await expect(page.getByTestId('window-closed-hint')).toBeVisible();
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'closed');
  await expect(page.locator('[data-testid^="workspace-app-reopen-button-"]')).toBeVisible();

  await page.locator('[data-testid^="workspace-app-reopen-button-"]').click();
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');
});
