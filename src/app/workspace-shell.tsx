import { useCallback, useEffect, useMemo, useState } from 'react';

import { PanelResizeHandle } from '@/app/panel-resize-handle';
import { displayedLeftWidth } from '@/app/shell-layout';
import { useShellLayout } from '@/app/use-shell-layout';
import { AddAppDialog } from '@/features/apps/components/add-app-dialog';
import { CurrentWorkspaceHeader } from '@/features/apps/components/current-workspace-header';
import { filterWorkspaceApps, WorkspaceAppCardGrid } from '@/features/apps/components/workspace-app-card-grid';
import { WorkspaceAppTabs } from '@/features/apps/components/workspace-app-tabs';
import { WorkspaceOverview } from '@/features/apps/components/workspace-overview';
import { useWorkspaceAppStore } from '@/features/apps/store/workspace-app-store';
import { EmbedPreviewHost } from '@/features/windows/components/embed-preview-host';
import { useWindowsChangedBridge } from '@/features/windows/listen-windows-changed';
import { WhiteboardPanel } from '@/features/canvas/components/whiteboard-panel';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { settingsApi } from '@/features/api/settings-api';
import { toAppApiError } from '@/features/api/tauri-client';
import { QuickSwitchOpenButton, QuickSwitchPanel, useQuickSwitchBridge } from '@/features/quick-switch';
import { SettingsDialog } from '@/features/settings/components/settings-dialog';
import { CreateWorkspaceDialog } from '@/features/workspaces/components/create-workspace-dialog';
import { DeleteWorkspaceDialog } from '@/features/workspaces/components/delete-workspace-dialog';
import { EmptyWorkspacesState } from '@/features/workspaces/components/empty-workspaces-state';
import { RenameWorkspaceDialog } from '@/features/workspaces/components/rename-workspace-dialog';
import { WorkspaceSidebar } from '@/features/workspaces/components/workspace-sidebar';
import { useWorkspaceStore } from '@/features/workspaces/store/workspace-store';
import { isWindowClosedError, userMessageForError } from '@/lib/errors';
import type { AppSettings, WorkspaceView } from '@/lib/types';

function settingsCommandErrorMessage(error: unknown): string {
  const err = toAppApiError(error);
  return err.message.trim() || userMessageForError(err);
}

export function WorkspaceShell() {
  useQuickSwitchBridge();
  useWindowsChangedBridge();
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
  const embeddedWorkspaceAppId = useWorkspaceAppStore((state) => state.embeddedWorkspaceAppId);
  const pendingEmbedWorkspaceAppId = useWorkspaceAppStore((state) => state.pendingEmbedWorkspaceAppId);
  const embedWorkspaceAppWindow = useWorkspaceAppStore((state) => state.embedWorkspaceAppWindow);
  const releaseEmbeddedWindow = useWorkspaceAppStore((state) => state.releaseEmbeddedWindow);

  const saveStatus = useCanvasStore((state) => state.saveStatus);
  const lastSavedAt = useCanvasStore((state) => state.lastSavedAt);
  const loadCanvas = useCanvasStore((state) => state.loadCanvas);
  const clearCanvas = useCanvasStore((state) => state.clearCanvas);
  const retrySave = useCanvasStore((state) => state.retrySave);

  const [contentQuery, setContentQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [settingsSubmitting, setSettingsSubmitting] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const { layout, toggleLeftCollapsed, beginResize, applyResize, endResize } = useShellLayout();
  const leftWidth = displayedLeftWidth(layout);

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
  const workspaceView: WorkspaceView =
    selectedWorkspace && (embeddedWorkspaceAppId || pendingEmbedWorkspaceAppId)
      ? 'preview'
      : 'dispatcher';

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await loadWorkspaces();
      if (cancelled) {
        return;
      }
      const workspaceId = useWorkspaceStore.getState().selectedWorkspaceId;
      if (workspaceId) {
        await Promise.all([loadWorkspaceApps(workspaceId), loadCanvas(workspaceId)]);
        useWorkspaceStore.getState().patchWorkspace(workspaceId, {
          appCount: useWorkspaceAppStore.getState().syncWorkspaceAppCount(workspaceId),
        });
      } else {
        clearWorkspaceApps();
        clearCanvas();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clearCanvas, clearWorkspaceApps, loadCanvas, loadWorkspaceApps, loadWorkspaces]);

  const syncAppCount = useCallback(
    (workspaceId: string) => {
      patchWorkspace(workspaceId, { appCount: syncWorkspaceAppCount(workspaceId) });
    },
    [patchWorkspace, syncWorkspaceAppCount],
  );

  const handleSelectWorkspace = useCallback(
    async (workspaceId: string) => {
      setContentQuery('');
      await loadCanvas(workspaceId);
      if (useCanvasStore.getState().workspaceId !== workspaceId) {
        return;
      }
      await Promise.all([selectWorkspace(workspaceId), loadWorkspaceApps(workspaceId)]);
      syncAppCount(workspaceId);
    },
    [loadCanvas, loadWorkspaceApps, selectWorkspace, syncAppCount],
  );

  const handleCreated = useCallback(
    async (values: { name: string; color: string }) => {
      const workspace = await createWorkspace(values);
      await Promise.all([loadWorkspaceApps(workspace.id), loadCanvas(workspace.id)]);
      syncAppCount(workspace.id);
    },
    [createWorkspace, loadCanvas, loadWorkspaceApps, syncAppCount],
  );

  const handleDeleted = useCallback(async () => {
    if (!deleteWorkspaceId) {
      return;
    }
    await deleteWorkspace(deleteWorkspaceId);
    const nextId = useWorkspaceStore.getState().selectedWorkspaceId;
    if (nextId) {
      await Promise.all([loadWorkspaceApps(nextId), loadCanvas(nextId)]);
      syncAppCount(nextId);
    } else {
      clearWorkspaceApps();
      clearCanvas();
    }
  }, [clearCanvas, clearWorkspaceApps, deleteWorkspace, deleteWorkspaceId, loadCanvas, loadWorkspaceApps, syncAppCount]);

  const handleAddApp = useCallback(() => {
    if (!selectedWorkspaceId) {
      return;
    }
    void openAddAppDialog(selectedWorkspaceId);
  }, [openAddAppDialog, selectedWorkspaceId]);

  const handleOpenSettings = useCallback(async () => {
    setSettingsOpen(true);
    setSettingsError(null);
    try {
      const settings = await settingsApi.getAppSettings();
      setAppSettings(settings);
    } catch (error) {
      setSettingsError(settingsCommandErrorMessage(error));
    }
  }, []);

  const handleSaveSettings = useCallback(async (quickSwitchShortcut: string) => {
    setSettingsSubmitting(true);
    setSettingsError(null);
    try {
      const settings = await settingsApi.updateAppSettings({ quickSwitchShortcut });
      setAppSettings(settings);
    } catch (error) {
      setSettingsError(settingsCommandErrorMessage(error));
    } finally {
      setSettingsSubmitting(false);
    }
  }, []);

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground" data-testid="workspace-shell">
      <div className="flex h-full shrink-0 max-[820px]:hidden" style={{ width: leftWidth }}>
        <WorkspaceSidebar
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          collapsed={layout.leftCollapsed}
          onToggleCollapsed={toggleLeftCollapsed}
          onCreate={openCreateDialog}
          onSelect={(workspaceId) => void handleSelectWorkspace(workspaceId)}
          onRename={openRenameDialog}
          onDelete={openDeleteDialog}
        />
      </div>
      <PanelResizeHandle
        side="left"
        label={layout.leftCollapsed ? '展开并调整工作区列表宽度' : '调整工作区列表宽度'}
        testId="left-panel-resize-handle"
        hiddenClassName="max-[820px]:hidden"
        onBegin={(clientX) => beginResize('left', clientX)}
        onMove={applyResize}
        onEnd={endResize}
      />

      <section
        className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-[18px] overflow-hidden bg-card p-6"
        data-testid="workspace-middle-pane"
        data-workspace-view={workspaceView}
      >
        {workspaceError ? (
          <p className="min-w-0 break-words rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {workspaceError.message}
          </p>
        ) : null}
        {appError ? (
          <p
            className="min-w-0 break-words rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            data-testid={isWindowClosedError(appError) ? 'window-closed-banner' : 'app-error-banner'}
          >
            {appError.message}
          </p>
        ) : null}

        {workspaceLoading && workspaces.length === 0 ? (
          <>
            <div className="flex justify-end">
              <QuickSwitchOpenButton />
            </div>
            <p className="text-muted-foreground">正在加载工作区…</p>
          </>
        ) : !selectedWorkspace ? (
          <>
            <div className="flex justify-end">
              <QuickSwitchOpenButton />
            </div>
            <EmptyWorkspacesState onCreate={openCreateDialog} />
          </>
        ) : (
          <>
            <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-3.5 border-b border-border pb-[18px]">
              <div className="min-w-0 flex-1 [&_header]:border-b-0 [&_header]:pb-0">
                <CurrentWorkspaceHeader
                  workspace={selectedWorkspace}
                  contentQuery={contentQuery}
                  onContentQueryChange={setContentQuery}
                  onAddApp={handleAddApp}
                  onSettings={() => void handleOpenSettings()}
                  saveStatus={saveStatus}
                  lastSavedAt={lastSavedAt}
                  onRetrySave={() => void retrySave()}
                />
              </div>
              <QuickSwitchOpenButton />
            </div>
            <WorkspaceAppTabs
              apps={visibleApps}
              previewWorkspaceAppId={embeddedWorkspaceAppId ?? pendingEmbedWorkspaceAppId}
              onActivate={(app) => void activateWorkspaceApp(app)}
              onPreview={(app) => void embedWorkspaceAppWindow(app.id)}
              onExitPreview={() => void releaseEmbeddedWindow()}
              onAddApp={handleAddApp}
            />
            {workspaceView === 'preview' ? (
              <EmbedPreviewHost
                active
                pending={Boolean(pendingEmbedWorkspaceAppId) && !embeddedWorkspaceAppId}
                onExit={() => void releaseEmbeddedWindow()}
              />
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[18px] overflow-y-auto overflow-x-hidden">
                {workspaceApps.length === 0 ? (
                  <WorkspaceOverview loading={workspaceAppsLoading} onAddApp={handleAddApp} />
                ) : (
                  <WorkspaceAppCardGrid
                    apps={visibleApps}
                    pendingAppIds={pendingWorkspaceAppIds}
                    onActivate={(app) => void activateWorkspaceApp(app)}
                    onReopen={(app) => void reopenWorkspaceApp(app)}
                    onRemove={(app) => {
                      void removeWorkspaceApp(app.id).then(() => syncAppCount(app.workspaceId));
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
      </section>

      <PanelResizeHandle
        side="right"
        label="调整白板宽度"
        testId="right-panel-resize-handle"
        hiddenClassName="max-[1180px]:hidden"
        onBegin={(clientX) => beginResize('right', clientX)}
        onMove={applyResize}
        onEnd={endResize}
      />
      <div className="flex h-full shrink-0 max-[1180px]:hidden" style={{ width: layout.rightWidth }}>
        <WhiteboardPanel workspaceId={selectedWorkspaceId} workspaceName={selectedWorkspace?.name} />
      </div>

      <CreateWorkspaceDialog
        open={createDialogOpen}
        submitting={workspaceMutating}
        errorMessage={createDialogOpen ? workspaceError?.message : null}
        onOpenChange={(open) => (open ? openCreateDialog() : closeCreateDialog())}
        onSubmit={handleCreated}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={appSettings}
        submitting={settingsSubmitting}
        errorMessage={settingsError}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) {
            setSettingsError(null);
          }
        }}
        onSubmit={handleSaveSettings}
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

      <QuickSwitchPanel />

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
