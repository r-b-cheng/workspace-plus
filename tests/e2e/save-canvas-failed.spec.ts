// MOCK ONLY — 不是 Windows 置前证据

import { expect, test } from '@playwright/test';

import { createWorkspace, openMockApp, waitForSaveState } from './helpers';

test('mock save_canvas 失败时 save-status 为 save-failed 且可重试', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '保存失败工作区');
  await expect(page.getByTestId('create-markdown-card-button')).toBeEnabled();

  await page.evaluate(() => {
    if (!window.__E2E_MOCK_CONTROL__) {
      throw new Error('E2E mock control missing');
    }
    window.__E2E_MOCK_CONTROL__.failSaveCanvas = true;
  });

  await page.getByTestId('create-markdown-card-button').click();
  await waitForSaveState(page, 'save-failed');
  await expect(page.getByTestId('retry-save-button')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText(/保存失败/);

  await page.evaluate(() => {
    if (!window.__E2E_MOCK_CONTROL__) {
      throw new Error('E2E mock control missing');
    }
    window.__E2E_MOCK_CONTROL__.failSaveCanvas = false;
  });
  await page.getByTestId('retry-save-button').click();
  await waitForSaveState(page, 'saved');
});
