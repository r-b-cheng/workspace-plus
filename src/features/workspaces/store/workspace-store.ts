import { create } from 'zustand';

import { workspaceApi } from '@/features/api/workspace-api';
import { AppApiError } from '@/features/api/tauri-client';
import { userMessageForError } from '@/lib/errors';
import type { CommandError, CreateWorkspaceInput, Workspace } from '@/lib/types';

export type WorkspaceStoreData = {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  workspaceLoading: boolean;
  workspaceMutating: boolean;
  workspaceError: CommandError | null;
  createDialogOpen: boolean;
  renameWorkspaceId: string | null;
  deleteWorkspaceId: string | null;
};

export type WorkspaceStore = WorkspaceStoreData & {
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<Workspace>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  patchWorkspace: (workspaceId: string, patch: Partial<Workspace>) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openRenameDialog: (workspaceId: string) => void;
  closeRenameDialog: () => void;
  openDeleteDialog: (workspaceId: string) => void;
  closeDeleteDialog: () => void;
  clearWorkspaceError: () => void;
  reset: () => void;
};

function pickSelectedWorkspace(workspaces: Workspace[]): string | null {
  return workspaces.find((workspace) => workspace.isActive)?.id ?? workspaces[0]?.id ?? null;
}

function markActive(workspaces: Workspace[], selectedWorkspaceId: string | null): Workspace[] {
  return workspaces.map((workspace) => ({
    ...workspace,
    isActive: workspace.id === selectedWorkspaceId,
  }));
}

function toCommandError(error: unknown): CommandError {
  if (error instanceof AppApiError) {
    return { code: error.code, message: userMessageForError(error) };
  }
  return { code: 'Internal', message: '操作失败，请重试。' };
}

export const initialWorkspaceStoreData: WorkspaceStoreData = {
  workspaces: [],
  selectedWorkspaceId: null,
  workspaceLoading: false,
  workspaceMutating: false,
  workspaceError: null,
  createDialogOpen: false,
  renameWorkspaceId: null,
  deleteWorkspaceId: null,
};

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  ...initialWorkspaceStoreData,

  async loadWorkspaces() {
    set({ workspaceLoading: true, workspaceError: null });
    try {
      const workspaces = await workspaceApi.listWorkspaces();
      const selectedWorkspaceId = pickSelectedWorkspace(workspaces);
      set({
        workspaces: markActive(workspaces, selectedWorkspaceId),
        selectedWorkspaceId,
        workspaceLoading: false,
      });
    } catch (error) {
      set({
        workspaceLoading: false,
        workspaceError: toCommandError(error),
      });
    }
  },

  async createWorkspace(input) {
    set({ workspaceMutating: true, workspaceError: null });
    try {
      const created = await workspaceApi.createWorkspace(input);
      const activated = await workspaceApi.setActiveWorkspace({ workspaceId: created.id });
      const workspaces = markActive(
        [...get().workspaces.filter((workspace) => workspace.id !== activated.id), activated],
        activated.id,
      );
      set({
        workspaces,
        selectedWorkspaceId: activated.id,
        workspaceMutating: false,
        createDialogOpen: false,
      });
      return activated;
    } catch (error) {
      const workspaceError = toCommandError(error);
      set({ workspaceMutating: false, workspaceError });
      throw error;
    }
  },

  async selectWorkspace(workspaceId) {
    if (!workspaceId || get().selectedWorkspaceId === workspaceId) {
      set({ selectedWorkspaceId: workspaceId });
      return;
    }

    set({
      selectedWorkspaceId: workspaceId,
      workspaces: markActive(get().workspaces, workspaceId),
      workspaceError: null,
    });

    try {
      const activated = await workspaceApi.setActiveWorkspace({ workspaceId });
      set({
        workspaces: markActive(
          get().workspaces.map((workspace) => (workspace.id === activated.id ? activated : workspace)),
          activated.id,
        ),
        selectedWorkspaceId: activated.id,
      });
    } catch (error) {
      set({ workspaceError: toCommandError(error) });
      throw error;
    }
  },

  async renameWorkspace(workspaceId, name) {
    set({ workspaceMutating: true, workspaceError: null });
    try {
      const renamed = await workspaceApi.renameWorkspace({ workspaceId, name });
      set({
        workspaces: get().workspaces.map((workspace) =>
          workspace.id === renamed.id ? { ...workspace, ...renamed } : workspace,
        ),
        workspaceMutating: false,
        renameWorkspaceId: null,
      });
      return renamed;
    } catch (error) {
      const workspaceError = toCommandError(error);
      set({ workspaceMutating: false, workspaceError });
      throw error;
    }
  },

  async deleteWorkspace(workspaceId) {
    set({ workspaceMutating: true, workspaceError: null });
    try {
      await workspaceApi.deleteWorkspace({ workspaceId });
      const remaining = get().workspaces.filter((workspace) => workspace.id !== workspaceId);
      const selectedWorkspaceId =
        get().selectedWorkspaceId === workspaceId ? pickSelectedWorkspace(remaining) : get().selectedWorkspaceId;

      if (selectedWorkspaceId) {
        try {
          await workspaceApi.setActiveWorkspace({ workspaceId: selectedWorkspaceId });
        } catch {
          // Keep the local selection even if marking active fails.
        }
      }

      set({
        workspaces: markActive(remaining, selectedWorkspaceId),
        selectedWorkspaceId,
        workspaceMutating: false,
        deleteWorkspaceId: null,
      });
    } catch (error) {
      const workspaceError = toCommandError(error);
      set({ workspaceMutating: false, workspaceError });
      throw error;
    }
  },

  patchWorkspace(workspaceId, patch) {
    set({
      workspaces: get().workspaces.map((workspace) =>
        workspace.id === workspaceId ? { ...workspace, ...patch } : workspace,
      ),
    });
  },

  openCreateDialog() {
    set({ createDialogOpen: true, workspaceError: null });
  },

  closeCreateDialog() {
    set({ createDialogOpen: false });
  },

  openRenameDialog(workspaceId) {
    set({ renameWorkspaceId: workspaceId, workspaceError: null });
  },

  closeRenameDialog() {
    set({ renameWorkspaceId: null });
  },

  openDeleteDialog(workspaceId) {
    set({ deleteWorkspaceId: workspaceId, workspaceError: null });
  },

  closeDeleteDialog() {
    set({ deleteWorkspaceId: null });
  },

  clearWorkspaceError() {
    set({ workspaceError: null });
  },

  reset() {
    set({ ...initialWorkspaceStoreData });
  },
}));
