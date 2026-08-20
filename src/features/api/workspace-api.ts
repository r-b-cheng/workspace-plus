import { callCommand } from '@/features/api/tauri-client';
import type {
  CreateWorkspaceInput,
  DeleteWorkspaceResult,
  RenameWorkspaceInput,
  Workspace,
  WorkspaceIdInput,
} from '@/lib/types';

export const workspaceApi = {
  listWorkspaces(): Promise<Workspace[]> {
    return callCommand<Workspace[]>('list_workspaces');
  },

  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    return callCommand<Workspace>('create_workspace', {
      name: input.name,
      description: input.description,
      icon: input.icon,
      color: input.color,
    });
  },

  renameWorkspace(input: RenameWorkspaceInput): Promise<Workspace> {
    return callCommand<Workspace>('rename_workspace', {
      workspaceId: input.workspaceId,
      name: input.name,
    });
  },

  deleteWorkspace(input: WorkspaceIdInput): Promise<DeleteWorkspaceResult> {
    return callCommand<DeleteWorkspaceResult>('delete_workspace', {
      workspaceId: input.workspaceId,
    });
  },

  setActiveWorkspace(input: WorkspaceIdInput): Promise<Workspace> {
    return callCommand<Workspace>('set_active_workspace', {
      workspaceId: input.workspaceId,
    });
  },
};
