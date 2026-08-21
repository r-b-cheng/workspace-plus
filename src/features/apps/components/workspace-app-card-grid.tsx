import { useAppCardGridLayout } from '@/features/apps/app-card-layout';
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
  const { ref, columns, compact } = useAppCardGridLayout();

  if (apps.length === 0) {
    return null;
  }

  return (
    <section
      ref={ref}
      className="grid min-w-0 gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      data-testid="workspace-app-card-grid"
      data-grid-cols={columns}
      data-layout={compact ? 'stack' : 'grid'}
    >
      {apps.map((app) => (
        <WorkspaceAppCard
          key={app.id}
          app={app}
          compact={compact}
          pending={pendingAppIds.includes(app.id)}
          onActivate={onActivate}
          onReopen={onReopen}
          onRemove={onRemove}
        />
      ))}
    </section>
  );
}
