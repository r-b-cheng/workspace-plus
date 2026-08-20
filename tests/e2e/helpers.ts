/**
 * MOCK ONLY — 不是 Windows 置前证据。
 */
import { expect, type Page } from '@playwright/test';

import { installE2eMockInvoke } from './install-mock';

export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2n2ZcAAAAASUVORK5CYII=';

export async function openMockApp(page: Page) {
  await page.addInitScript(installE2eMockInvoke);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(page.getByTestId('workspace-shell')).toBeVisible();
}

export async function createWorkspace(page: Page, name: string) {
  const emptyCreate = page.getByTestId('empty-workspaces-create-button');
  if (await emptyCreate.isVisible().catch(() => false)) {
    await emptyCreate.click();
  } else {
    await page.getByTestId('create-workspace-button').click();
  }
  await expect(page.getByTestId('create-workspace-dialog')).toBeVisible();
  await page.getByTestId('create-workspace-name-input').fill(name);
  await page.getByTestId('create-workspace-submit').click();
  await expect(page.getByTestId('current-workspace-title')).toHaveText(name);
}

export async function addInstalledApp(page: Page, appId: string) {
  await page.getByTestId('add-app-button').click();
  await expect(page.getByTestId('add-app-dialog')).toBeVisible();
  await page.getByTestId(`installed-app-result-${appId}`).click();
  await expect(page.getByTestId('add-app-dialog')).toBeHidden();
}

export function workspaceListItem(page: Page, name: string) {
  return page.getByTestId(/^workspace-list-item-/).filter({ hasText: name });
}

export function markdownNodes(page: Page) {
  return page.locator('[data-testid^="canvas-markdown-node-"]');
}

export function imageNodes(page: Page) {
  return page.locator('[data-testid^="canvas-image-node-"]');
}

export async function waitForSaveState(page: Page, state: 'saved' | 'save-failed' | 'saving' | 'idle') {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-save-state', state);
}
