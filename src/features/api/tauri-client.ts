import type { CommandError } from '@/lib/types';

export type ApiInvokeFn = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI_INVOKE_MOCK__?: ApiInvokeFn;
    __E2E_MOCK_INVOKE__?: ApiInvokeFn;
    __E2E_MOCK_CONTROL__?: {
      failSaveCanvas: boolean;
      failNextFocus: boolean;
    };
    __E2E_ADD_IMAGE__?: (
      fileName: string,
      contentBase64: string,
      mimeType?: string,
    ) => Promise<unknown>;
    __E2E_OPEN_QUICK_SWITCH__?: () => void;
  }
}

export class AppApiError extends Error implements CommandError {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppApiError';
  }
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}

export function normalizeTauriError(error: unknown): CommandError & { details?: unknown } {
  if (error instanceof AppApiError) {
    return { code: error.code, message: error.message, details: error.details };
  }

  const record = asRecord(error);
  if (record) {
    if (typeof record.code === 'string' && typeof record.message === 'string') {
      return { code: record.code, message: record.message, details: record.details };
    }

    if (typeof record.message === 'string') {
      const nested = tryParseJson(record.message);
      if (nested && typeof nested.code === 'string' && typeof nested.message === 'string') {
        return { code: nested.code, message: nested.message, details: nested };
      }
      return { code: 'Internal', message: record.message, details: error };
    }
  }

  if (typeof error === 'string') {
    const nested = tryParseJson(error);
    if (nested && typeof nested.code === 'string' && typeof nested.message === 'string') {
      return { code: nested.code, message: nested.message };
    }
    return { code: 'Internal', message: error };
  }

  if (error instanceof Error && error.message) {
    const nested = tryParseJson(error.message);
    if (nested && typeof nested.code === 'string' && typeof nested.message === 'string') {
      return { code: nested.code, message: nested.message, details: nested };
    }
    return { code: 'Internal', message: error.message, details: error };
  }

  return { code: 'Internal', message: '未知错误', details: error };
}

export function toAppApiError(error: unknown): AppApiError {
  if (error instanceof AppApiError) {
    return error;
  }
  const normalized = normalizeTauriError(error);
  return new AppApiError(normalized.code, normalized.message, normalized.details);
}

function resolveInvoker(): ApiInvokeFn | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (typeof window.__E2E_MOCK_INVOKE__ === 'function') {
    return window.__E2E_MOCK_INVOKE__;
  }
  if (typeof window.__TAURI_INVOKE_MOCK__ === 'function') {
    return window.__TAURI_INVOKE_MOCK__;
  }
  return null;
}

export async function callCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const mocked = resolveInvoker();
    if (mocked) {
      return await mocked<T>(command, args);
    }

    if (import.meta.env.VITE_E2E === '1') {
      throw new AppApiError('Internal', 'E2E mock invoke is not installed');
    }

    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command, args);
  } catch (error) {
    throw toAppApiError(error);
  }
}
