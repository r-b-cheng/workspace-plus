// MOCK ONLY — 不是 Windows 置前证据

import { expect, test } from '@playwright/test';

import { createWorkspace, openMockApp, workspaceListItem } from './helpers';

test('空状态可以创建工作区', async ({ page }) => {
  await openMockApp(page);

  await expect(page.getByTestId('empty-workspaces-state')).toBeVisible();
  await expect(page.getByTestId('empty-workspaces-create-button')).toBeVisible();
  await expect(page.getByTestId('current-workspace-title')).toHaveCount(0);

  await createWorkspace(page, '验收工作区');

  await expect(page.getByTestId('empty-workspaces-state')).toHaveCount(0);
  await expect(page.getByTestId('current-workspace-title')).toHaveText('验收工作区');
  await expect(workspaceListItem(page, '验收工作区')).toBeVisible();
});
