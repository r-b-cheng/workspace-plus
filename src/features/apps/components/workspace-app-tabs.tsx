import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EMBED_PREVIEW_ACTION, EXIT_EMBED_PREVIEW_LABEL } from '@/features/windows/embed-copy';
import { canPreviewWorkspaceApp, workspaceAppStatusLabel } from '@/features/windows/window-status';
import { cn } from '@/lib/cn';
import type { WorkspaceApp } from '@/lib/types';

type WorkspaceAppTabsProps = {
  apps: WorkspaceApp[];
  onActivate: (app: WorkspaceApp) => void;
  onAddApp: () => void;
  previewWorkspaceAppId?: string | null;
  onPreview?: (app: WorkspaceApp) => void;
  onExitPreview?: () => void;
};

export function WorkspaceAppTabs({
  apps,
  onActivate,
  onAddApp,
  previewWorkspaceAppId = null,
  onPreview,
  onExitPreview,
}: WorkspaceAppTabsProps) {
  return (
    <nav className="flex min-w-0 max-w-full shrink-0 flex-wrap gap-3">
      {apps.map((app) => {
        const previewing = previewWorkspaceAppId === app.id;
        const showPreview = Boolean(onPreview) && canPreviewWorkspaceApp(app);

        if (!showPreview) {
          return (
            <Button
              key={app.id}
              variant="secondary"
              className={cn(
                'h-auto max-w-full min-w-0 shrink whitespace-normal rounded-lg border border-input bg-[#f9fbfe] px-4 py-2.5',
                app.status === 'running' && 'border-primary/40',
              )}
              data-testid={`workspace-app-tab-${app.id}`}
              onClick={() => onActivate(app)}
            >
              <span className="min-w-0 max-w-full truncate">{app.alias ?? app.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{workspaceAppStatusLabel(app.status)}</span>
            </Button>
          );
        }

        return (
          <div
            key={app.id}
            className={cn(
              'inline-flex max-w-full min-w-0 items-stretch overflow-hidden rounded-lg border border-input bg-[#f9fbfe]',
              app.status === 'running' && 'border-primary/40',
              previewing && 'border-primary bg-primary/5',
            )}
          >
            <Button
              variant="ghost"
              className="h-auto min-w-0 max-w-full shrink whitespace-normal rounded-none px-4 py-2.5"
              data-testid={`workspace-app-tab-${app.id}`}
              onClick={() => onActivate(app)}
            >
              <span className="min-w-0 max-w-full truncate">{app.alias ?? app.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{workspaceAppStatusLabel(app.status)}</span>
            </Button>
            <Button
              variant="ghost"
              className="h-auto shrink-0 rounded-none border-l border-input px-2.5 py-2.5 text-xs text-muted-foreground"
              data-testid={`workspace-app-tab-preview-${app.id}`}
              onClick={() => {
                if (previewing) {
                  onExitPreview?.();
                  return;
                }
                onPreview?.(app);
              }}
            >
              {previewing ? EXIT_EMBED_PREVIEW_LABEL : EMBED_PREVIEW_ACTION}
            </Button>
          </div>
        );
      })}
      <Button
        variant="secondary"
        size="icon"
        className="rounded-lg border border-input bg-[#f9fbfe]"
        aria-label="添加软件"
        data-testid="workspace-app-tab-add"
        onClick={onAddApp}
      >
        <Plus size={18} />
      </Button>
    </nav>
  );
}
