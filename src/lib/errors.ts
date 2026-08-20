import type { CommandError } from '@/lib/types';

export const ERROR_CODES = {
  NOT_FOUND: 'NotFound',
  WINDOW_CLOSED: 'WindowClosed',
  INVALID_TARGET: 'InvalidTarget',
  FOCUS_DENIED: 'FocusDenied',
  PERMISSION_DENIED: 'PermissionDenied',
  LAUNCH_FAILED: 'LaunchFailed',
  UNSUPPORTED_PLATFORM: 'UnsupportedPlatform',
  TIMEOUT: 'Timeout',
  VALIDATION: 'Validation',
  INSTALLED_APP_UNAVAILABLE: 'InstalledAppUnavailable',
  INTERNAL: 'Internal',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const ERROR_COPY: Record<string, string> = {
  [ERROR_CODES.NOT_FOUND]: '未找到该工作区或软件。',
  [ERROR_CODES.WINDOW_CLOSED]: '窗口已关闭，可以重新打开。',
  [ERROR_CODES.INVALID_TARGET]: '路径无效或目标不存在。',
  [ERROR_CODES.FOCUS_DENIED]: '系统拒绝聚焦该窗口。',
  [ERROR_CODES.PERMISSION_DENIED]: '权限不足，无法完成操作。',
  [ERROR_CODES.LAUNCH_FAILED]: '软件启动失败。',
  [ERROR_CODES.UNSUPPORTED_PLATFORM]: '当前平台暂不支持该操作。',
  [ERROR_CODES.TIMEOUT]: '操作超时，请重试。',
  [ERROR_CODES.VALIDATION]: '输入不完整或格式不正确。',
  [ERROR_CODES.INSTALLED_APP_UNAVAILABLE]: '该软件当前不可用。',
  [ERROR_CODES.INTERNAL]: '操作失败，请重试。',
};

export function userMessageForError(error: CommandError): string {
  if (error.code === ERROR_CODES.WINDOW_CLOSED) {
    return ERROR_COPY[ERROR_CODES.WINDOW_CLOSED];
  }
  if (error.message.trim()) {
    return error.message;
  }
  return ERROR_COPY[error.code] ?? ERROR_COPY[ERROR_CODES.INTERNAL];
}

export function isWindowClosedError(error: Pick<CommandError, 'code'>): boolean {
  return error.code === ERROR_CODES.WINDOW_CLOSED;
}

export function isFocusFailedError(error: Pick<CommandError, 'code'>): boolean {
  return error.code === ERROR_CODES.FOCUS_DENIED || error.code === ERROR_CODES.WINDOW_CLOSED;
}
