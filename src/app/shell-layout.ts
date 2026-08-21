export const SHELL_LAYOUT_STORAGE_KEY = 'workspace-hub.shell-layout';

export const LEFT_SIDEBAR_DEFAULT = 292;
export const LEFT_SIDEBAR_MIN = 200;
export const LEFT_SIDEBAR_MAX = 440;
export const LEFT_SIDEBAR_COLLAPSED = 72;

export const RIGHT_SIDEBAR_DEFAULT = 390;
export const RIGHT_SIDEBAR_MIN = 280;
export const RIGHT_SIDEBAR_MAX = 1400;
export const MIDDLE_PANE_MIN = 280;
export const PANEL_HANDLE_WIDTH = 6;

export type ShellLayoutState = {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
};

export function defaultShellLayout(): ShellLayoutState {
  return {
    leftWidth: LEFT_SIDEBAR_DEFAULT,
    rightWidth: RIGHT_SIDEBAR_DEFAULT,
    leftCollapsed: false,
  };
}

export function clampLeftWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return LEFT_SIDEBAR_DEFAULT;
  }
  return Math.min(LEFT_SIDEBAR_MAX, Math.max(LEFT_SIDEBAR_MIN, Math.round(width)));
}

export type RightWidthBounds = {
  viewportWidth?: number;
  leftDisplayed?: number;
};

export function maxRightWidthForViewport(viewportWidth: number, leftDisplayed: number): number {
  const available =
    viewportWidth - leftDisplayed - PANEL_HANDLE_WIDTH * 2 - MIDDLE_PANE_MIN;
  return Math.max(RIGHT_SIDEBAR_MIN, Math.min(RIGHT_SIDEBAR_MAX, available));
}

export function clampRightWidth(width: number, bounds?: RightWidthBounds): number {
  if (!Number.isFinite(width)) {
    return RIGHT_SIDEBAR_DEFAULT;
  }
  const ceiling =
    bounds?.viewportWidth && bounds.viewportWidth > 0
      ? maxRightWidthForViewport(
          bounds.viewportWidth,
          bounds.leftDisplayed ?? LEFT_SIDEBAR_DEFAULT,
        )
      : RIGHT_SIDEBAR_MAX;
  return Math.min(ceiling, Math.max(RIGHT_SIDEBAR_MIN, Math.round(width)));
}

export function resizedLeftWidth(startWidth: number, startX: number, clientX: number): number {
  return clampLeftWidth(startWidth + (clientX - startX));
}

export function resizedRightWidth(
  startWidth: number,
  startX: number,
  clientX: number,
  bounds?: RightWidthBounds,
): number {
  return clampRightWidth(startWidth - (clientX - startX), bounds);
}

export function displayedLeftWidth(layout: ShellLayoutState): number {
  return layout.leftCollapsed ? LEFT_SIDEBAR_COLLAPSED : layout.leftWidth;
}

export function normalizeShellLayout(input: Partial<ShellLayoutState> | null | undefined): ShellLayoutState {
  const fallback = defaultShellLayout();
  return {
    leftWidth: clampLeftWidth(input?.leftWidth ?? fallback.leftWidth),
    rightWidth: clampRightWidth(input?.rightWidth ?? fallback.rightWidth),
    leftCollapsed: Boolean(input?.leftCollapsed),
  };
}

export function readShellLayout(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): ShellLayoutState {
  if (!storage) {
    return defaultShellLayout();
  }
  try {
    const raw = storage.getItem(SHELL_LAYOUT_STORAGE_KEY);
    if (!raw) {
      return defaultShellLayout();
    }
    return normalizeShellLayout(JSON.parse(raw) as Partial<ShellLayoutState>);
  } catch {
    return defaultShellLayout();
  }
}

export function writeShellLayout(
  layout: ShellLayoutState,
  storage: Pick<Storage, 'setItem'> | null = defaultStorage(),
): void {
  if (!storage) {
    return;
  }
  storage.setItem(SHELL_LAYOUT_STORAGE_KEY, JSON.stringify(normalizeShellLayout(layout)));
}

function defaultStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}
