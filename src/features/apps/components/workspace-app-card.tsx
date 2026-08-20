import { Button } from '@/components/ui/button';
import {
  canReopenWorkspaceApp,
  displayWorkspaceAppTitle,
  workspaceAppStatusLabel,
} from '@/features/windows/window-status';
import type { WorkspaceApp } from '@/lib/types';

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

  return (
    <article
      className="flex min-h-[112px] flex-col justify-between rounded-[10px] border border-border bg-card p-4"
      data-testid={`workspace-app-card-${app.id}`}
    >
      <button type="button" className="grid gap-1 text-left" onClick={() => onActivate(app)}>
        <strong>{displayWorkspaceAppTitle(app)}</strong>
        <span className="text-sm text-muted-foreground">{app.windowTitle ?? workspaceAppStatusLabel(app.status)}</span>
        {app.errorMessage ? <span className="text-sm text-destructive">{app.errorMessage}</span> : null}
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {app.status === 'running' ? (
          <Button
            variant="ghost"
            className="h-auto w-fit rounded-lg bg-accent px-2.5 py-2 text-accent-foreground"
            disabled={pending}
            onClick={() => onActivate(app)}
          >
            切换窗口
          </Button>
        ) : null}
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
          disabled={pending}
          onClick={() => onRemove(app)}
        >
          移出工作区
        </Button>
      </div>
    </article>
  );
}
