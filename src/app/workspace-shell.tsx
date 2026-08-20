import { useCallback, useEffect, useMemo, useState } from 'react';

import { AddAppDialog } from '@/features/apps/components/add-app-dialog';
import { CurrentWorkspaceHeader } from '@/features/apps/components/current-workspace-header';
import { filterWorkspaceApps, WorkspaceAppCardGrid } from '@/features/apps/components/workspace-app-card-grid';
import { WorkspaceAppTabs } from '@/features/apps/components/workspace-app-tabs';
import { WorkspaceOverview } from '@/features/apps/components/workspace-overview';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { CreateWorkspaceDialog } from '@/features/workspaces/components/create-workspace-dialog';
import { DeleteWorkspaceDialog } from '@/features/workspaces/components/delete-workspace-dialog';
import { EmptyWorkspacesState } from '@/features/workspaces/components/empty-workspaces-state';
import { RenameWorkspaceDialog } from '@/features/workspaces/components/rename-workspace-dialog';
import { WorkspaceSidebar } from '@/features/workspaces/components/workspace-sidebar';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { WhiteboardPlaceholder } from '@/app/whiteboard-placeholder';

export function WorkspaceShell() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const selectedWorkspaceId = useWorkspaceStore((state) => state.selectedWorkspaceId);
  const workspaceLoading = useWorkspaceStore((state) => state.workspaceLoading);
  const workspaceMutating = useWorkspaceStore((state) => state.workspaceMutating);
  const workspaceError = useWorkspaceStore((state) => state.workspaceError);
  const createDialogOpen = useWorkspaceStore((state) => state.createDialogOpen);
  const renameWorkspaceId = useWorkspaceStore((state) => state.renameWorkspaceId);
  const deleteWorkspaceId = useWorkspaceStore((state) => state.deleteWorkspaceId);
  const loadWorkspaces = useWorkspaceStore((state) => state.loadWorkspaces);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const selectWorkspace = useWorkspaceStore((state) => state.selectWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const patchWorkspace = useWorkspaceStore((state) => state.patchWorkspace);
  const openCreateDialog = useWorkspaceStore((state) => state.openCreateDialog);
  const closeCreateDialog = useWorkspaceStore((state) => state.closeCreateDialog);
  const openRenameDialog = useWorkspaceStore((state) => state.openRenameDialog);
  const closeRenameDialog = useWorkspaceStore((state) => state.closeRenameDialog);
  const openDeleteDialog = useWorkspaceStore((state) => state.openDeleteDialog);
  const closeDeleteDialog = useWorkspaceStore((state) => state.closeDeleteDialog);

  const workspaceApps = useWorkspaceAppStore((state) => state.workspaceApps);
  const installedApps = useWorkspaceAppStore((state) => state.installedApps);
  const appDialogOpen = useWorkspaceAppStore((state) => state.appDialogOpen);
  const appSearchQuery = useWorkspaceAppStore((state) => state.appSearchQuery);
  const installedAppsLoading = useWorkspaceAppStore((state) => state.installedAppsLoading);
  const workspaceAppsLoading = useWorkspaceAppStore((state) => state.workspaceAppsLoading);
  const refreshingInstalledApps = useWorkspaceAppStore((state) => state.refreshingInstalledApps);
  const launchingInstalledAppIds = useWorkspaceAppStore((state) => state.launchingInstalledAppIds);
  const pendingWorkspaceAppIds = useWorkspaceAppStore((state) => state.pendingWorkspaceAppIds);
  const appError = useWorkspaceAppStore((state) => state.appError);
  const loadWorkspaceApps = useWorkspaceAppStore((state) => state.loadWorkspaceApps);
  const clearWorkspaceApps = useWorkspaceAppStore((state) => state.clearWorkspaceApps);
  const openAddAppDialog = useWorkspaceAppStore((state) => state.openAddAppDialog);
  const closeAddAppDialog = useWorkspaceAppStore((state) => state.closeAddAppDialog);
  const setAppSearchQuery = useWorkspaceAppStore((state) => state.setAppSearchQuery);
  const handleInstalledAppAction = useWorkspaceAppStore((state) => state.handleInstalledAppAction);
  const refreshInstalledApps = useWorkspaceAppStore((state) => state.refreshInstalledApps);
  const addManualAndOpen = useWorkspaceAppStore((state) => state.addManualAndOpen);
  const activateWorkspaceApp = useWorkspaceAppStore((state) => state.activateWorkspaceApp);
  const reopenWorkspaceApp = useWorkspaceAppStore((state) => state.reopenWorkspaceApp);
  const removeWorkspaceApp = useWorkspaceAppStore((state) => state.removeWorkspaceApp);
  const syncWorkspaceAppCount = useWorkspaceAppStore((state) => state.syncWorkspaceAppCount);

  const [contentQuery, setContentQuery] = useState('');

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces],
  );
  const renameTarget = workspaces.find((workspace) => workspace.id === renameWorkspaceId) ?? null;
  const deleteTarget = workspaces.find((workspace) => workspace.id === deleteWorkspaceId) ?? null;
  const visibleApps = useMemo(
    () => filterWorkspaceApps(workspaceApps, contentQuery),
    [contentQuery, workspaceApps],
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await loadWorkspaces();
      if (cancelled) {
        return;
      }
      const workspaceId = useWorkspaceStore.getState().selectedWorkspaceId;
      if (workspaceId) {
        await loadWorkspaceApps(workspaceId);
        useWorkspaceStore.getState().patchWorkspace(workspaceId, {
          appCount: useWorkspaceAppStore.getState().syncWorkspaceAppCount(workspaceId),
        });
      } else {
        clearWorkspaceApps();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearWorkspaceApps, loadWorkspaceApps, loadWorkspaces]);

  const syncAppCount = useCallback(
    (workspaceId: string) => {
      patchWorkspace(workspaceId, { appCount: syncWorkspaceAppCount(workspaceId) });
    },
    [patchWorkspace, syncWorkspaceAppCount],
  );

  const handleSelectWorkspace = useCallback(
    async (workspaceId: string) => {
      setContentQuery('');
      await Promise.all([selectWorkspace(workspaceId), loadWorkspaceApps(workspaceId)]);
      syncAppCount(workspaceId);
    },
    [loadWorkspaceApps, selectWorkspace, syncAppCount],
  );

  const handleCreated = useCallback(
    async (values: { name: string; color: string }) => {
      const workspace = await createWorkspace(values);
      await loadWorkspaceApps(workspace.id);
      syncAppCount(workspace.id);
    },
    [createWorkspace, loadWorkspaceApps, syncAppCount],
  );

  const handleDeleted = useCallback(async () => {
    if (!deleteWorkspaceId) {
      return;
    }
    await deleteWorkspace(deleteWorkspaceId);
    const nextId = useWorkspaceStore.getState().selectedWorkspaceId;
    if (nextId) {
      await loadWorkspaceApps(nextId);
      syncAppCount(nextId);
    } else {
      clearWorkspaceApps();
    }
  }, [clearWorkspaceApps, deleteWorkspace, deleteWorkspaceId, loadWorkspaceApps, syncAppCount]);

  const handleAddApp = useCallback(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    void openAddAppDialog(selectedWorkspaceId);
  }, [openAddAppDialog, selectedWorkspaceId]);

  return (
    <main
      className="grid min-h-screen grid-cols-[292px_minmax(520px,1fr)_390px] bg-background text-foreground max-[1180px]:grid-cols-[260px_minmax(0,1fr)] max-[820px]:grid-cols-1"
      data-testid="workspace-shell"
    >
      <WorkspaceSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onCreate={openCreateDialog}
        onSelect={(workspaceId) => void handleSelectWorkspace(workspaceId)}
        onRename={openRenameDialog}
        onDelete={openDeleteDialog}
      />

      <section className="flex flex-col gap-[18px] bg-card p-6">
        {workspaceError ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{workspaceError.message}</p>
        ) : null}
        {appError ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{appError.message}</p>
        ) : null}

        {workspaceLoading && workspaces.length === 0 ? (
          <p className="text-muted-foreground">正在加载工作区…</p>
        ) : !selectedWorkspace ? (
          <EmptyWorkspacesState onCreate={openCreateDialog} />
        ) : (
          <>
            <CurrentWorkspaceHeader
              workspace={selectedWorkspace}
              contentQuery={contentQuery}
              onContentQueryChange={setContentQuery}
              onAddApp={handleAddApp}
              onSettings={() => openRenameDialog(selectedWorkspace.id)}
            />
            <WorkspaceAppTabs apps={visibleApps} onActivate={(app) => void activateWorkspaceApp(app)} onAddApp={handleAddApp} />
            <WorkspaceOverview
              workspace={selectedWorkspace}
              hasApps={workspaceApps.length > 0}
              loading={workspaceAppsLoading}
              onAddApp={handleAddApp}
            />
            <WorkspaceAppCardGrid
              apps={visibleApps}
              pendingAppIds={pendingWorkspaceAppIds}
              onActivate={(app) => void activateWorkspaceApp(app)}
              onReopen={(app) => void reopenWorkspaceApp(app)}
              onRemove={(app) => {
                void removeWorkspaceApp(app.id).then(() => syncAppCount(app.workspaceId));
              }}
            />
          </>
        )}
      </section>

      <WhiteboardPlaceholder workspaceName={selectedWorkspace?.name} />

      <CreateWorkspaceDialog
        open={createDialogOpen}
        submitting={workspaceMutating}
        errorMessage={createDialogOpen ? workspaceError?.message : null}
        onOpenChange={(open) => (open ? openCreateDialog() : closeCreateDialog())}
        onSubmit={handleCreated}
      />

      <RenameWorkspaceDialog
        open={Boolean(renameWorkspaceId)}
        currentName={renameTarget?.name}
        submitting={workspaceMutating}
        errorMessage={renameWorkspaceId ? workspaceError?.message : null}
        onOpenChange={(open) => {
          if (!open) {
            closeRenameDialog();
          }
        }}
        onSubmit={async (name) => {
          if (renameWorkspaceId) {
            await renameWorkspace(renameWorkspaceId, name);
          }
        }}
      />

      <DeleteWorkspaceDialog
        open={Boolean(deleteWorkspaceId)}
        workspaceName={deleteTarget?.name}
        submitting={workspaceMutating}
        errorMessage={deleteWorkspaceId ? workspaceError?.message : null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
        onConfirm={handleDeleted}
      />

      <AddAppDialog
        open={appDialogOpen}
        query={appSearchQuery}
        apps={installedApps}
        loading={installedAppsLoading}
        refreshing={refreshingInstalledApps}
        launchingAppIds={launchingInstalledAppIds}
        errorMessage={appError?.message}
        onOpenChange={(open) => (open ? undefined : closeAddAppDialog())}
        onQueryChange={setAppSearchQuery}
        onSelect={(app) => {
          if (selectedWorkspaceId) {
            void handleInstalledAppAction(selectedWorkspaceId, app).then(() => {
              syncAppCount(selectedWorkspaceId);
            });
          }
        }}
        onRefresh={() => {
          if (selectedWorkspaceId) {
            void refreshInstalledApps(selectedWorkspaceId);
          }
        }}
        onAddManual={() => {
          if (selectedWorkspaceId) {
            void addManualAndOpen(selectedWorkspaceId).then(() => syncAppCount(selectedWorkspaceId));
          }
        }}
      />
    </main>
  );
}
