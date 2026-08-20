// MOCK ONLY — 不是 Windows 置前证据

import { expect, test } from '@playwright/test';

import { addInstalledApp, createWorkspace, openMockApp } from './helpers';

test('添加软件后出现卡片，重复添加不长第二张', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '软件工作区');

  await addInstalledApp(page, 'app-chrome');
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
  await expect(page.getByTestId('workspace-app-card')).toContainText('Chrome');
  await expect(page.getByTestId('workspace-app-card')).toHaveAttribute('data-app-status', 'running');

  await page.getByTestId('add-app-button').click();
  await expect(page.getByTestId('add-app-dialog')).toBeVisible();
  await expect(page.getByTestId('installed-app-action-app-chrome')).toHaveText('已在当前工作区');
  await expect(page.getByTestId('installed-app-action-app-code')).toHaveText('添加并打开');

  await page.getByTestId('installed-app-result-app-chrome').click();
  await expect(page.getByTestId('add-app-dialog')).toBeHidden();
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
});
