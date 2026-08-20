import { MoreHorizontal, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { WorkspaceList } from '@/features/workspaces/components/workspace-list';
import type { Workspace } from '@/lib/types';

type WorkspaceSidebarProps = {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onCreate: () => void;
  onSelect: (workspaceId: string) => void;
  onRename: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
};

export function WorkspaceSidebar({
  workspaces,
  selectedWorkspaceId,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: WorkspaceSidebarProps) {
  return (
    <aside
      className="flex flex-col border-r border-border bg-card px-4 py-[22px] max-[820px]:hidden"
      data-testid="workspace-sidebar"
    >
      <div className="mb-7 flex items-center gap-3.5 font-bold">
        <div className="grid size-[34px] place-items-center rounded-lg bg-[#1f78ff] text-white">X</div>
        <span>Workspace Hub</span>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3.5">
        <h1 className="m-0 text-lg font-semibold">工作区列表</h1>
        <Button variant="outline" size="icon" className="size-9" aria-label="工作区更多">
          <MoreHorizontal size={18} />
        </Button>
      </div>

      <Button className="h-auto w-full rounded-lg px-3.5 py-3" data-testid="create-workspace-button" onClick={onCreate}>
        <Plus size={18} />
        新建工作区
      </Button>

      <Separator className="my-4" />

      <ScrollArea className="min-h-0 flex-1">
        <WorkspaceList
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      </ScrollArea>
    </aside>
  );
}
