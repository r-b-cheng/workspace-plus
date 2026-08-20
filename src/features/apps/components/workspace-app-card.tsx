import { Button } from '@/components/ui/button';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { EMBED_PREVIEW_ACTION, EMBED_PREVIEW_LABEL } from '@/features/windows/embed-copy';
import {
  canFocusWorkspaceApp,
  canFocusWorkspaceAppWindow,
  canPreviewWorkspaceApp,
  canReopenWorkspaceApp,
  displayWorkspaceAppTitle,
  isWorkspaceAppEmbedEnabled,
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
  const setWorkspaceAppEmbed = useWorkspaceAppStore((state) => state.setWorkspaceAppEmbed);
  const embedWorkspaceAppWindow = useWorkspaceAppStore((state) => state.embedWorkspaceAppWindow);
  const embedEnabled = isWorkspaceAppEmbedEnabled(app);
  const showPreview = canPreviewWorkspaceApp(app);

  return (
    <article
      className="flex min-h-[112px] flex-col justify-between rounded-[10px] border border-border bg-card p-4"
      data-testid="workspace-app-card"
      data-workspace-app-card-id={app.id}
      data-app-status={app.status}
    >
      <button
        type="button"
        className="grid gap-1 text-left"
        data-testid="workspace-app-activate-button"
        onClick={() => onActivate(app)}
      >
        <strong>{displayWorkspaceAppTitle(app)}</strong>
        <span className="text-sm text-muted-foreground">{app.windowTitle ?? workspaceAppStatusLabel(app.status)}</span>
        {app.status === 'closed' ? (
          <span className="text-sm text-destructive" data-testid="window-closed-hint">
            {WINDOW_CLOSED_HINT}
          </span>
        ) : app.errorMessage ? (
          <span className="text-sm text-destructive">{app.errorMessage}</span>
        ) : null}
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canFocusWorkspaceApp(app.status) ? (
          <Button
            variant="ghost"
            className="h-auto w-fit rounded-lg bg-accent px-2.5 py-2 text-accent-foreground"
            disabled={pending}
            onClick={() => onActivate(app)}
          >
            切换窗口
          </Button>
        ) : null}
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={embedEnabled}
            disabled={pending}
            data-testid={`workspace-app-embed-toggle-${app.id}`}
            onChange={(event) => {
              event.stopPropagation();
              void setWorkspaceAppEmbed(app.id, event.target.checked);
            }}
          />
          {EMBED_PREVIEW_LABEL}
        </label>
        {showPreview ? (
          <Button
            variant="ghost"
            className="h-auto w-fit rounded-lg px-2.5 py-2 text-muted-foreground"
            data-testid={`workspace-app-embed-button-${app.id}`}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation();
              void embedWorkspaceAppWindow(app.id);
            }}
          >
            {EMBED_PREVIEW_ACTION}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="h-auto w-fit rounded-lg px-2.5 py-2 text-muted-foreground"
          data-testid="workspace-app-windows-toggle"
          disabled={pending}
          onClick={() => void toggleWorkspaceAppWindows(app.id)}
        >
          窗口列表
        </Button>
        {showReopen ? (
          <Button
            variant="ghost"
            className="h-auto w-fit rounded-lg bg-accent px-2.5 py-2 text-accent-foreground"
            data-testid={`workspace-app-reopen-button-${app.id}`}
            disabled={pending || app.status === 'launching'}
            onClick={() => onReopen(app)}
          >
            {app.status === 'launching' ? '启动中…' : '重新打开'}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="h-auto w-fit rounded-lg px-2.5 py-2 text-muted-foreground"
          data-testid={`workspace-app-remove-button-${app.id}`}
          title={REMOVE_WORKSPACE_APP_COPY}
          disabled={pending}
          onClick={() => onRemove(app)}
        >
          移出工作区
        </Button>
      </div>
      {windowsExpanded ? (
        <ul className="mt-3 grid gap-1" data-testid="workspace-app-windows">
          {windowsLoading && windows.length === 0 ? (
            <li className="text-sm text-muted-foreground">正在加载窗口…</li>
          ) : null}
          {windows.map((item) => (
            <li key={item.id}>
              {canFocusWorkspaceAppWindow(item.status) ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                  data-testid="workspace-app-window-item"
                  data-window-status={item.status}
                  disabled={pending}
                  onClick={() => void focusNativeWindow(item.id, app.id)}
                >
                  <span>{item.title || '未命名窗口'}</span>
                  <span className="text-muted-foreground">{workspaceAppWindowStatusLabel(item.status)}</span>
                </button>
              ) : (
                <div
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm"
                  data-testid="workspace-app-window-item"
                  data-window-status={item.status}
                >
                  <span className="text-muted-foreground">{item.title || '未命名窗口'}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-destructive">{workspaceAppWindowStatusLabel(item.status)}</span>
                    <Button
                      variant="ghost"
                      className="h-auto w-fit px-2 py-1 text-xs"
                      disabled={pending || app.status === 'launching'}
                      onClick={() => onReopen(app)}
                    >
                      重新打开
                    </Button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
