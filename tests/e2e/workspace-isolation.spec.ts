// MOCK ONLY — 不是 Windows 置前证据

import { expect, test } from '@playwright/test';

import {
  addInstalledApp,
  createWorkspace,
  markdownNodes,
  openMockApp,
  waitForSaveState,
  workspaceListItem,
} from './helpers';

test('工作区 A/B 的软件和白板互不串', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '工作区 A');
  await addInstalledApp(page, 'app-chrome');
  await expect(page.getByTestId('workspace-app-card')).toContainText('Chrome');

  await expect(page.getByTestId('create-markdown-card-button')).toBeEnabled();
  await page.getByTestId('create-markdown-card-button').click();
  await page.locator('[data-testid^="markdown-toggle-"]').click();
  await page.getByTestId('markdown-editor').locator('.cm-content').fill('# A 的笔记');
  await page.locator('[data-testid^="markdown-toggle-"]').click();
  await expect(page.locator('[data-testid^="markdown-preview-"]')).toContainText('A 的笔记');
  await waitForSaveState(page, 'saved');

  await createWorkspace(page, '工作区 B');
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(0);
  await expect(markdownNodes(page)).toHaveCount(0);

  await addInstalledApp(page, 'app-code');
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
  await expect(page.getByTestId('workspace-app-card')).toContainText('VS Code');

  await page.getByTestId('create-markdown-card-button').click();
  await page.locator('[data-testid^="markdown-toggle-"]').click();
  await page.getByTestId('markdown-editor').locator('.cm-content').fill('# B 的笔记');
  await page.locator('[data-testid^="markdown-toggle-"]').click();
  await expect(page.locator('[data-testid^="markdown-preview-"]')).toContainText('B 的笔记');
  await waitForSaveState(page, 'saved');

  await workspaceListItem(page, '工作区 A').click();
  await expect(page.getByTestId('current-workspace-title')).toHaveText('工作区 A');
  await expect(page.getByTestId('workspace-app-card')).toHaveCount(1);
  await expect(page.getByTestId('workspace-app-card')).toContainText('Chrome');
  await expect(page.getByTestId('workspace-app-card')).not.toContainText('VS Code');
  await expect(markdownNodes(page)).toHaveCount(1);
  await expect(page.locator('[data-testid^="markdown-preview-"]')).toContainText('A 的笔记');
  await expect(page.locator('[data-testid^="markdown-preview-"]')).not.toContainText('B 的笔记');
});
