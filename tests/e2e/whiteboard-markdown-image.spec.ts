// MOCK ONLY — 不是 Windows 置前证据

import { expect, test } from '@playwright/test';

import { createWorkspace, imageNodes, markdownNodes, openMockApp, TINY_PNG_BASE64, waitForSaveState } from './helpers';

test('白板可以新建 Markdown，并走得到图片资源路径', async ({ page }) => {
  await openMockApp(page);
  await createWorkspace(page, '白板工作区');
  await expect(page.getByTestId('create-markdown-card-button')).toBeEnabled();

  await page.getByTestId('create-markdown-card-button').click();
  await expect(markdownNodes(page)).toHaveCount(1);

  await page.locator('[data-testid^="markdown-toggle-"]').click();
  const editor = page.getByTestId('markdown-editor').locator('.cm-content');
  await editor.click();
  await editor.fill('# 验收笔记');
  await page.locator('[data-testid^="markdown-toggle-"]').click();
  await expect(page.locator('[data-testid^="markdown-preview-"]')).toContainText('验收笔记');
  await waitForSaveState(page, 'saved');

  await page.evaluate(async ([fileName, contentBase64]) => {
    if (typeof window.__E2E_ADD_IMAGE__ !== 'function') {
      throw new Error('E2E image hook missing');
    }
    await window.__E2E_ADD_IMAGE__(fileName, contentBase64, 'image/png');
  }, ['note.png', TINY_PNG_BASE64] as const);

  await expect(imageNodes(page)).toHaveCount(1);
  await expect(imageNodes(page).locator('img')).toBeVisible();
  await waitForSaveState(page, 'saved');
});
