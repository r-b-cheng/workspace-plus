import { WorkspaceListItem } from '@/features/workspaces/components/workspace-list-item';
import type { Workspace } from '@/lib/types';

type WorkspaceListProps = {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelect: (workspaceId: string) => void;
  onRename: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
};

export function WorkspaceList({
  workspaces,
  selectedWorkspaceId,
  onSelect,
  onRename,
  onDelete,
}: WorkspaceListProps) {
  if (workspaces.length === 0) {
    return <p className="px-1 text-sm text-muted-foreground">还没有工作区，先新建一个。</p>;
  }

  return (
    <div className="grid gap-2.5 pr-2">
      {workspaces.map((workspace) => (
        <WorkspaceListItem
          key={workspace.id}
          workspace={workspace}
          selected={workspace.id === selectedWorkspaceId}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
