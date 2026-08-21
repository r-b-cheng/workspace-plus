import { WorkspaceAppCard } from '@/features/apps/components/workspace-app-card';
import type { WorkspaceApp } from '@/lib/types';

export function filterWorkspaceApps(apps: WorkspaceApp[], query: string): WorkspaceApp[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return apps;
  }

  return apps.filter((app) => {
    const haystack = [app.name, app.alias, app.note, app.windowTitle, app.category]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

type WorkspaceAppCardGridProps = {
  apps: WorkspaceApp[];
  pendingAppIds?: string[];
  onActivate: (app: WorkspaceApp) => void;
  onReopen: (app: WorkspaceApp) => void;
  onRemove: (app: WorkspaceApp) => void;
};

export function WorkspaceAppCardGrid({
  apps,
  pendingAppIds = [],
  onActivate,
  onReopen,
  onRemove,
}: WorkspaceAppCardGridProps) {
  if (apps.length === 0) {
    return null;
  }

  return (
    <section
      className="grid min-w-0 grid-cols-1 gap-3 @[420px]:grid-cols-2 @[720px]:grid-cols-3"
      data-testid="workspace-app-card-grid"
    >
      {apps.map((app) => (
        <WorkspaceAppCard
          key={app.id}
          app={app}
          pending={pendingAppIds.includes(app.id)}
          onActivate={onActivate}
          onReopen={onReopen}
          onRemove={onRemove}
        />
      ))}
    </section>
  );
}
