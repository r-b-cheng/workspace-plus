import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';

import { Input } from '@/components/ui/input';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { buildQuickSwitchResults } from '@/features/quick-switch/build-results';
import { executeQuickSwitchResult } from '@/features/quick-switch/execute-result';
import { useQuickSwitchStore } from '@/features/quick-switch/store/quick-switch-store';
import type { QuickSwitchResult } from '@/features/quick-switch/types';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { cn } from '@/lib/cn';

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, index));
}

export function QuickSwitchPanel() {
  const open = useQuickSwitchStore((state) => state.open);
  const query = useQuickSwitchStore((state) => state.query);
  const selectedIndex = useQuickSwitchStore((state) => state.selectedIndex);
  const closePanel = useQuickSwitchStore((state) => state.closePanel);
  const setQuery = useQuickSwitchStore((state) => state.setQuery);
  const setSelectedIndex = useQuickSwitchStore((state) => state.setSelectedIndex);

  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId);
  const workspaceApps = useWorkspaceAppStore((state) => state.workspaceApps);
  const installedApps = useWorkspaceAppStore((state) => state.installedApps);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => buildQuickSwitchResults({ query, workspaceApps, installedApps }),
    [installedApps, query, workspaceApps],
  );
  const safeIndex = clampIndex(selectedIndex, results.length);

  useEffect(() => {
    if (!open || !selectedWorkspaceId) {
      return;
    }
    void useWorkspaceAppStore.getState().loadInstalledApps(selectedWorkspaceId);
  }, [open, selectedWorkspaceId]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  async function runResult(result: QuickSwitchResult) {
    closePanel();
    try {
      const workspaceStore = useWorkspaceStore.getState();
      const appStore = useWorkspaceAppStore.getState();
      await executeQuickSwitchResult(result, {
        workspaceId: workspaceStore.selectedWorkspaceId,
        workspaceApps: appStore.workspaceApps,
        activateWorkspaceApp: appStore.activateWorkspaceApp,
        reopenWorkspaceApp: appStore.reopenWorkspaceApp,
        addAndLaunchApp: appStore.addAndLaunchApp,
      });
    } catch {
      // Errors stay on the existing workspace app store banner.
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(clampIndex(safeIndex + 1, results.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(clampIndex(safeIndex - 1, results.length));
      return;
    }
    if (event.key === 'Enter') {
      const result = results[safeIndex];
      if (!result) {
        return;
      }
      event.preventDefault();
      void runResult(result);
    }
  }

  if (!open) {
    return null;
  }

  const hasWorkspace = Boolean(selectedWorkspaceId);
  const emptyReason = !hasWorkspace ? 'no-workspace' : results.length === 0 ? 'no-matches' : null;
  const emptyCopy = emptyReason === 'no-workspace' ? '还没有工作区，先创建一个再快速切换。' : '没有匹配的软件';

  return (
    <div className="fixed inset-0 z-50" data-testid="quick-switch-panel" onKeyDown={handleKeyDown}>
      <button
        type="button"
        className="absolute inset-0 bg-[rgb(23_32_51/0.18)]"
        data-testid="quick-switch-backdrop"
        aria-label="关闭快速切换"
        onClick={closePanel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="快速切换"
        className="relative mx-auto mt-[12vh] grid w-full max-w-xl gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg"
      >
        <Input
          ref={inputRef}
          data-testid="quick-switch-input"
          placeholder="搜索名称、别名、备注或窗口标题"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        {emptyReason ? (
          <p className="py-6 text-sm text-muted-foreground" data-testid="quick-switch-empty" data-empty-reason={emptyReason}>
            {emptyCopy}
          </p>
        ) : (
          <ul className="grid max-h-[50vh] gap-1 overflow-auto" role="listbox" aria-label="快速切换结果">
            {results.map((result, index) => {
              const selected = index === safeIndex;
              return (
                <li key={result.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left',
                      selected ? 'bg-accent text-accent-foreground' : 'bg-[#f8fbff]',
                    )}
                    data-testid="quick-switch-item"
                    data-selected={selected ? 'true' : 'false'}
                    data-action={result.action}
                    role="option"
                    aria-selected={selected}
                    onClick={() => void runResult(result)}
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium">{result.title}</span>
                      {result.subtitle ? (
                        <small className="truncate text-muted-foreground">{result.subtitle}</small>
                      ) : null}
                    </span>
                    <small className="shrink-0 text-muted-foreground" data-testid="quick-switch-action">
                      {result.actionLabel}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
