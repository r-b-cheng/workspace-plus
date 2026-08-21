import { Button } from '@/components/ui/button';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import {
  canFocusWorkspaceApp,
  canReopenWorkspaceApp,
  displayWorkspaceAppTitle,
  workspaceAppStatusLabel,
  workspaceAppWindowStatusLabel,
} from '@/features/windows/window-status';
import type { WorkspaceApp, WorkspaceAppWindow } from '@/lib/types';

export const REMOVE_WORKSPACE_APP_COPY = '移出工作区不会关闭真实窗口，也不会卸载软件。';
export const WINDOW_CLOSED_HINT = '窗口已关闭，可以重新打开。';

const EMPTY_WINDOWS: WorkspaceAppWindow[] = [];

type WorkspaceAppCardProps = {
  app: WorkspaceApp;
  pending?: boolean;
  onActivate: (app: WorkspaceApp) => void;
  onReopen: (app: WorkspaceApp) => void;
  onRemove: (app: WorkspaceApp) => void;
};

export function WorkspaceAppCard({
  app,
  pending = false,
  onActivate,
  onReopen,
  onRemove,
}: WorkspaceAppCardProps) {
  const showReopen = canReopenWorkspaceApp(app.status);
  const windows = useWorkspaceAppStore(
    (state) => state.windowsByWorkspaceAppId[app.id] ?? EMPTY_WINDOWS,
  );
  const windowsExpanded = useWorkspaceAppStore((state) =>
    state.expandedWorkspaceAppIds.includes(app.id),
  );
  const windowsLoading = useWorkspaceAppStore((state) =>
    state.windowsLoadingIds.includes(app.id),
  );
  const toggleWorkspaceAppWindows = useWorkspaceAppStore(
    (state) => state.toggleWorkspaceAppWindows,
  );
  const focusNativeWindow = useWorkspaceAppStore((state) => state.focusNativeWindow);
  const runningWindows = windows.filter((item) => item.status === 'running');

  return (
    <article
      className="flex min-h-[112px] min-w-0 flex-col justify-between overflow-hidden rounded-[10px] border border-border bg-card p-4"
      data-testid="workspace-app-card"
      data-workspace-app-card-id={app.id}
      data-app-status={app.status}
    >
      <button
        type="button"
        className="grid min-w-0 gap-1 text-left"
        data-testid="workspace-app-activate-button"
        onClick={() => onActivate(app)}
      >
        <strong className="min-w-0 truncate">{displayWorkspaceAppTitle(app)}</strong>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {app.windowTitle ?? workspaceAppStatusLabel(app.status)}
        </span>
        {app.status === 'closed' ? (
          <span className="min-w-0 truncate text-sm text-destructive" data-testid="window-closed-hint">
            {WINDOW_CLOSED_HINT}
          </span>
        ) : app.errorMessage ? (
          <span className="min-w-0 break-words text-sm text-destructive">{app.errorMessage}</span>
        ) : null}
      </button>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        {canFocusWorkspaceApp(app.status) ? (
          <Button
            variant="ghost"
            className="h-auto w-fit max-w-full min-w-0 shrink whitespace-normal rounded-lg bg-accent px-2.5 py-2 text-accent-foreground"
            disabled={pending}
            onClick={() => onActivate(app)}
          >
            切换窗口
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="h-auto w-fit max-w-full min-w-0 shrink whitespace-normal rounded-lg px-2.5 py-2 text-muted-foreground"
          data-testid="workspace-app-windows-toggle"
          disabled={pending}
          onClick={() => void toggleWorkspaceAppWindows(app.id)}
        >
          窗口列表
        </Button>
        {showReopen ? (
          <Button
            variant="ghost"
            className="h-auto w-fit max-w-full min-w-0 shrink whitespace-normal rounded-lg bg-accent px-2.5 py-2 text-accent-foreground"
            data-testid={`workspace-app-reopen-button-${app.id}`}
            disabled={pending || app.status === 'launching'}
            onClick={() => onReopen(app)}
          >
            {app.status === 'launching' ? '启动中…' : '重新打开'}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="h-auto w-fit max-w-full min-w-0 shrink whitespace-normal rounded-lg px-2.5 py-2 text-muted-foreground"
          data-testid={`workspace-app-remove-button-${app.id}`}
          title={REMOVE_WORKSPACE_APP_COPY}
          disabled={pending}
          onClick={() => onRemove(app)}
        >
          移出工作区
        </Button>
      </div>
      {windowsExpanded ? (
        <ul className="mt-3 grid min-w-0 gap-1" data-testid="workspace-app-windows">
          {windowsLoading && runningWindows.length === 0 ? (
            <li className="text-sm text-muted-foreground">正在加载窗口…</li>
          ) : runningWindows.length === 0 ? (
            <li className="text-sm text-muted-foreground">没有打开的窗口</li>
          ) : (
            runningWindows.map((item) => (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                  data-testid="workspace-app-window-item"
                  data-window-status={item.status}
                  disabled={pending}
                  onClick={() => void focusNativeWindow(item.id, app.id)}
                >
                  <span className="min-w-0 truncate">{item.title || '未命名窗口'}</span>
                  <span className="shrink-0 text-muted-foreground">{workspaceAppWindowStatusLabel(item.status)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </article>
  );
}
