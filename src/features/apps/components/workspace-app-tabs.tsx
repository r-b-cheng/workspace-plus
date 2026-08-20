import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { workspaceAppStatusLabel } from '@/features/windows/window-status';
import { cn } from '@/lib/cn';
import type { WorkspaceApp } from '@/lib/types';

type WorkspaceAppTabsProps = {
  apps: WorkspaceApp[];
  onActivate: (app: WorkspaceApp) => void;
  onAddApp: () => void;
};

export function WorkspaceAppTabs({ apps, onActivate, onAddApp }: WorkspaceAppTabsProps) {
  return (
    <nav className="flex flex-wrap gap-3">
      {apps.map((app) => (
        <Button
          key={app.id}
          variant="secondary"
          className={cn(
            'h-auto rounded-lg border border-input bg-[#f9fbfe] px-4 py-2.5',
            app.status === 'running' && 'border-primary/40',
          )}
          data-testid={`workspace-app-tab-${app.id}`}
          onClick={() => onActivate(app)}
        >
          {app.alias ?? app.name}
          <span className="text-xs text-muted-foreground">{workspaceAppStatusLabel(app.status)}</span>
        </Button>
      ))}
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
