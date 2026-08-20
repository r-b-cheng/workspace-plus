import { afterEach, describe, expect, it } from 'vitest';

import { AppApiError, callCommand, normalizeTauriError } from '@/features/api/tauri-client';

describe('callCommand 错误归一', () => {
  afterEach(() => {
    delete window.__TAURI_INVOKE_MOCK__;
    delete window.__E2E_MOCK_INVOKE__;
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

  it('优先使用 __E2E_MOCK_INVOKE__', async () => {
    window.__TAURI_INVOKE_MOCK__ = async () => 'legacy' as never;
    window.__E2E_MOCK_INVOKE__ = async () => 'e2e' as never;

    await expect(callCommand('list_workspaces')).resolves.toBe('e2e');
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
