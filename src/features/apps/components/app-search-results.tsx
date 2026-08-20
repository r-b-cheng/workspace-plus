import type { InstalledApp } from '@/lib/types';

export function filterInstalledApps(apps: InstalledApp[], query: string): InstalledApp[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return apps;
  }

  return apps.filter((app) => {
    const haystack = [app.name, app.category, app.displayPath]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

type AppSearchResultsProps = {
  apps: InstalledApp[];
  query: string;
  launchingAppIds?: string[];
  onSelect: (app: InstalledApp) => void;
};

export function AppSearchResults({
  apps,
  query,
  launchingAppIds = [],
  onSelect,
}: AppSearchResultsProps) {
  const visibleApps = filterInstalledApps(apps, query);

  if (visibleApps.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">没有匹配的软件</p>;
  }

  return (
    <div className="grid gap-2 pr-2">
      {visibleApps.map((app) => {
        const launching = launchingAppIds.includes(app.id);
        return (
          <button
            className="flex justify-between rounded-lg bg-[#f8fbff] p-3 text-left disabled:opacity-60"
            key={app.id}
            type="button"
            data-testid={`installed-app-result-${app.id}`}
            disabled={launching}
            onClick={() => onSelect(app)}
          >
            <span className="grid min-w-0 gap-1">
              <span className="truncate">{app.name}</span>
              {app.displayPath ? (
                <small className="truncate text-muted-foreground">{app.displayPath}</small>
              ) : null}
            </span>
            <small className="shrink-0 text-muted-foreground" data-testid={`installed-app-action-${app.id}`}>
              {launching ? '启动中' : app.alreadyInWorkspace ? '已在当前工作区' : '添加并打开'}
            </small>
          </button>
        );
      })}
    </div>
  );
}
