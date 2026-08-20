import { afterEach, describe, expect, it } from 'vitest';

import { AppApiError, callCommand, normalizeTauriError } from '@/features/api/tauri-client';

describe('callCommand 错误归一', () => {
  afterEach(() => {
    delete window.__TAURI_INVOKE_MOCK__;
  });

  it('把后端 AppError 形状归一成 code + message', () => {
    const normalized = normalizeTauriError({ code: 'WindowClosed', message: '窗口已关闭' });
    expect(normalized).toMatchObject({ code: 'WindowClosed', message: '窗口已关闭' });
  });

  it('通过 mock invoke 返回数据，不走真实 Tauri', async () => {
    window.__TAURI_INVOKE_MOCK__ = async (command) => {
      if (command === 'list_workspaces') {
        return [] as never;
      }
      throw { code: 'NotFound', message: 'missing' };
    };

    await expect(callCommand('list_workspaces')).resolves.toEqual([]);
  });

  it('mock 失败时抛出 AppApiError', async () => {
    window.__TAURI_INVOKE_MOCK__ = async () => {
      throw { code: 'WindowClosed', message: 'window is gone' };
    };

    await expect(callCommand('focus_workspace_app', { workspaceAppId: 'wa-1' })).rejects.toMatchObject({
      name: 'AppApiError',
      code: 'WindowClosed',
      message: 'window is gone',
    });
    await expect(callCommand('focus_workspace_app')).rejects.toBeInstanceOf(AppApiError);
  });
});
