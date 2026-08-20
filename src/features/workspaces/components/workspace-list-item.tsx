import { LayoutGrid, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { formatDisplayTime } from '@/lib/datetime';
import { cn } from '@/lib/cn';
import { DEFAULT_WORKSPACE_COLOR } from '@/lib/workspace-colors';
import type { Workspace } from '@/lib/types';

type WorkspaceListItemProps = {
  workspace: Workspace;
  selected: boolean;
  onSelect: (workspaceId: string) => void;
  onRename: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
};

export function WorkspaceListItem({
  workspace,
  selected,
  onSelect,
  onRename,
  onDelete,
}: WorkspaceListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  return (
    <div
      className={cn(
        'relative flex w-full items-center gap-2 rounded-[10px] border border-[#e7ebf3] bg-card p-2.5',
        selected && 'border-primary bg-[#f3f7ff]',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left"
        data-testid={`workspace-list-item-${workspace.id}`}
        onClick={() => onSelect(workspace.id)}
      >
        <span
          className="grid size-10 shrink-0 place-items-center rounded-[10px] text-white"
          style={{ backgroundColor: workspace.color ?? DEFAULT_WORKSPACE_COLOR }}
        >
          <LayoutGrid size={18} />
        </span>
        <span className="grid min-w-0 gap-1.5">
          <strong className="truncate">{workspace.name}</strong>
          <small className="truncate text-muted-foreground">
            {workspace.appCount} 个软件 · {formatDisplayTime(workspace.updatedAt)}
          </small>
        </span>
      </button>

      <div className="relative" ref={menuRef}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`${workspace.name} 更多操作`}
          data-testid={`workspace-item-menu-${workspace.id}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={16} />
        </Button>
        {menuOpen ? (
          <div className="absolute top-9 right-0 z-20 grid min-w-28 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg">
            <button
              type="button"
              className="px-3 py-2 text-left text-sm hover:bg-accent"
              data-testid={`workspace-rename-${workspace.id}`}
              onClick={() => {
                setMenuOpen(false);
                onRename(workspace.id);
              }}
            >
              重命名
            </button>
            <button
              type="button"
              className="px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
              data-testid={`workspace-delete-${workspace.id}`}
              onClick={() => {
                setMenuOpen(false);
                onDelete(workspace.id);
              }}
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
