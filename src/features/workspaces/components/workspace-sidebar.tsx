import { MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { WorkspaceList } from '@/features/workspaces/components/workspace-list';
import { cn } from '@/lib/cn';
import type { Workspace } from '@/lib/types';

type WorkspaceSidebarProps = {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onCreate: () => void;
  onSelect: (workspaceId: string) => void;
  onRename: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
};

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  collapsed = false,
  onToggleCollapsed,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full min-h-screen w-full flex-col border-r border-border bg-card',
        collapsed ? 'items-center px-2 py-4' : 'px-4 py-[22px]',
      )}
      data-testid="workspace-sidebar"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className={cn('flex items-center font-bold', collapsed ? 'mb-4 flex-col gap-2' : 'mb-7 gap-3.5')}>
        <div className="grid size-[34px] place-items-center rounded-lg bg-[#1f78ff] text-white">X</div>
        {collapsed ? null : <span>Workspace Hub</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('size-8', !collapsed && 'ml-auto')}
          aria-label={collapsed ? '展开工作区列表' : '收起工作区列表'}
          data-testid="collapse-workspace-sidebar-button"
          onClick={onToggleCollapsed}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </Button>
      </div>

      {collapsed ? null : (
        <div className="mb-4 flex items-center justify-between gap-3.5">
          <h1 className="m-0 text-lg font-semibold">工作区列表</h1>
          <Button variant="outline" size="icon" className="size-9" aria-label="工作区更多">
            <MoreHorizontal size={18} />
          </Button>
        </div>
      )}

      <Button
        className={cn('rounded-lg', collapsed ? 'size-10 px-0' : 'h-auto w-full px-3.5 py-3')}
        data-testid="create-workspace-button"
        aria-label="新建工作区"
        onClick={onCreate}
      >
        <Plus size={18} />
        {collapsed ? null : '新建工作区'}
      </Button>

      <Separator className="my-4" />

      <ScrollArea className="min-h-0 w-full flex-1">
        <WorkspaceList
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          compact={collapsed}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      </ScrollArea>
    </aside>
  );
}
