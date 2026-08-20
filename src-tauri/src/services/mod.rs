//! Application services between commands and storage/platform.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use base64::Engine;
use rusqlite::Connection;

use crate::domain::{
    normalize_shortcut, AppSettings, Asset, Canvas, CanvasAssetContent, CanvasEdge,
    CanvasEdgeInput, CanvasNode, CanvasNodeInput, DeleteWorkspaceResult, EmbedWorkspaceAppResult,
    HostBounds, InstalledApp, ReleaseEmbeddedWindowResult, RemoveWorkspaceAppResult, Workspace,
    WorkspaceApp, WorkspaceAppWindow, DEFAULT_QUICK_SWITCH_SHORTCUT, REGISTRATION_UNREGISTERED,
};
use crate::errors::AppError;
use crate::platform::{
    FocusWindowRequest, LaunchAppRequest, ListWindowsRequest, PlatformAdapter, PlatformWindow,
    ResolveManualAppTargetRequest, ScanInstalledAppsRequest, ScannedApp,
};
use crate::platform::rules::{
    is_executable_path, list_matching_windows, path_extension, pick_focus_window, WindowMatchHint,
};
use crate::storage::{
    self, new_id, normalize_name, now_utc, open_database, sha256_hex, AppPaths, InstalledAppRow,
    WorkspaceAppRow, ACTIVE_WORKSPACE_KEY, QUICK_SWITCH_SHORTCUT_KEY,
};

const ALLOWED_NODE_TYPES: &[&str] = &[
    "markdown",
    "text",
    "sticky",
    "todo",
    "image",
    "screenshot",
    "app_note",
];

#[derive(Clone, Debug)]
struct ShortcutRegistrationState {
    status: String,
    last_error: Option<String>,
}

impl Default for ShortcutRegistrationState {
    fn default() -> Self {
        Self {
            status: REGISTRATION_UNREGISTERED.to_string(),
            last_error: None,
        }
    }
}

#[derive(Clone, Debug)]
struct EmbedSession {
    workspace_id: String,
    workspace_app_id: String,
    opaque_window_id: String,
    original_style: i32,
    original_ex_style: i32,
    original_parent: isize,
}

/// Orchestrates repositories and the injectable platform adapter.
pub struct AppService {
    conn: Mutex<Connection>,
    adapter: Arc<dyn PlatformAdapter>,
    paths: AppPaths,
    shortcut_registration: Mutex<ShortcutRegistrationState>,
    embed_session: Mutex<Option<EmbedSession>>,
}

impl AppService {
    /// Opens (or creates) the database under `root` and injects `adapter`.
    pub fn open(root: impl AsRef<Path>, adapter: Arc<dyn PlatformAdapter>) -> Result<Self, AppError> {
        let paths = AppPaths::from_root(root.as_ref().to_path_buf())?;
        let conn = open_database(&paths.db_path)?;
        Ok(Self {
            conn: Mutex::new(conn),
            adapter,
            paths,
            shortcut_registration: Mutex::new(ShortcutRegistrationState::default()),
            embed_session: Mutex::new(None),
        })
    }

    pub fn adapter(&self) -> &dyn PlatformAdapter {
        self.adapter.as_ref()
    }

    pub fn paths(&self) -> &AppPaths {
        &self.paths
    }

    pub fn journal_mode(&self) -> Result<String, AppError> {
        let conn = self.lock_db()?;
        storage::journal_mode(&conn)
    }

    pub fn foreign_keys_enabled(&self) -> Result<bool, AppError> {
        let conn = self.lock_db()?;
        storage::foreign_keys_enabled(&conn)
    }

    pub fn reapply_migrations(&self) -> Result<(), AppError> {
        let conn = self.lock_db()?;
        storage::apply_migrations(&conn)?;
        storage::reapply_migration_sql(&conn)
    }

    fn lock_db(&self) -> Result<MutexGuard<'_, Connection>, AppError> {
        self.conn
            .lock()
            .map_err(|_| AppError::internal("database lock is poisoned"))
    }

    fn lock_registration(&self) -> Result<MutexGuard<'_, ShortcutRegistrationState>, AppError> {
        self.shortcut_registration
            .lock()
            .map_err(|_| AppError::internal("shortcut registration lock is poisoned"))
    }

    fn lock_embed(&self) -> Result<MutexGuard<'_, Option<EmbedSession>>, AppError> {
        self.embed_session
            .lock()
            .map_err(|_| AppError::internal("embed session lock is poisoned"))
    }

    fn workspace_app_dto(&self, workspace_app_id: &str) -> Result<WorkspaceApp, AppError> {
        let conn = self.lock_db()?;
        storage::workspace_app_get_dto(&conn, workspace_app_id)?
            .ok_or_else(|| AppError::not_found("workspace app not found"))
    }

    pub fn get_app_settings(&self) -> Result<AppSettings, AppError> {
        let stored = {
            let conn = self.lock_db()?;
            storage::settings_get(&conn, QUICK_SWITCH_SHORTCUT_KEY)?
        };
        let shortcut = match stored.as_deref() {
            None => DEFAULT_QUICK_SWITCH_SHORTCUT.to_string(),
            Some(raw) => match normalize_shortcut(Some(raw)) {
                Ok(normalized) => normalized,
                Err(_) => DEFAULT_QUICK_SWITCH_SHORTCUT.to_string(),
            },
        };
        let registration = self.lock_registration()?;
        Ok(AppSettings {
            quick_switch_shortcut: shortcut,
            registration_status: registration.status.clone(),
            last_error: registration.last_error.clone(),
        })
    }

    pub fn update_app_settings(
        &self,
        quick_switch_shortcut: Option<String>,
    ) -> Result<AppSettings, AppError> {
        let normalized = normalize_shortcut(quick_switch_shortcut.as_deref())?;
        {
            let conn = self.lock_db()?;
            storage::settings_set(
                &conn,
                QUICK_SWITCH_SHORTCUT_KEY,
                Some(&normalized),
                None,
                &now_utc(),
            )?;
        }
        self.get_app_settings()
    }

    pub fn record_shortcut_registration(
        &self,
        status: &str,
        last_error: Option<String>,
    ) -> Result<(), AppError> {
        let mut registration = self.lock_registration()?;
        registration.status = status.to_string();
        registration.last_error = last_error.filter(|value| !value.trim().is_empty());
        Ok(())
    }

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let conn = self.lock_db()?;
        storage::workspace_list(&conn)
    }

    pub fn create_workspace(
        &self,
        name: &str,
        description: Option<&str>,
        icon: Option<&str>,
        color: Option<&str>,
    ) -> Result<Workspace, AppError> {
        let name = validate_workspace_name(name)?;
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        let now = now_utc();
        let id = new_id();
        let sort_order = storage::workspace_next_sort_order(&tx)?;
        storage::workspace_insert(
            &tx,
            &id,
            name,
            empty_to_none(description),
            empty_to_none(icon),
            empty_to_none(color),
            sort_order,
            &now,
        )?;
        storage::workspace_touch_opened(&tx, &id, &now)?;
        storage::settings_set(&tx, ACTIVE_WORKSPACE_KEY, Some(&id), Some(&id), &now)?;
        tx.commit()?;
        storage::workspace_get(&conn, &id)?.ok_or_else(|| AppError::internal("created workspace missing"))
    }

    pub fn rename_workspace(&self, workspace_id: &str, name: &str) -> Result<Workspace, AppError> {
        let name = validate_workspace_name(name)?;
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        require_workspace(&tx, workspace_id)?;
        storage::workspace_rename(&tx, workspace_id, name, &now_utc())?;
        tx.commit()?;
        storage::workspace_get(&conn, workspace_id)?
            .ok_or_else(|| AppError::not_found("workspace not found"))
    }

    pub fn delete_workspace(&self, workspace_id: &str) -> Result<DeleteWorkspaceResult, AppError> {
        self.release_embedded_if_workspace(workspace_id)?;
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        require_workspace(&tx, workspace_id)?;
        let now = now_utc();
        storage::workspace_soft_delete(&tx, workspace_id, &now)?;
        storage::workspace_app_soft_delete_for_workspace(&tx, workspace_id, &now)?;
        storage::native_window_soft_delete_for_workspace(&tx, workspace_id, &now)?;
        storage::canvas_edge_soft_delete_for_workspace(&tx, workspace_id, &now)?;
        storage::canvas_node_soft_delete_for_workspace(&tx, workspace_id, &now)?;
        if storage::settings_get(&tx, ACTIVE_WORKSPACE_KEY)?.as_deref() == Some(workspace_id) {
            storage::settings_set(&tx, ACTIVE_WORKSPACE_KEY, None, None, &now)?;
        }
        tx.commit()?;
        Ok(DeleteWorkspaceResult {
            workspace_id: workspace_id.to_string(),
            deleted: true,
        })
    }

    pub fn set_active_workspace(&self, workspace_id: &str) -> Result<Workspace, AppError> {
        self.release_embedded_unless_workspace(workspace_id)?;
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        require_workspace(&tx, workspace_id)?;
        let now = now_utc();
        storage::workspace_touch_opened(&tx, workspace_id, &now)?;
        storage::settings_set(
            &tx,
            ACTIVE_WORKSPACE_KEY,
            Some(workspace_id),
            Some(workspace_id),
            &now,
        )?;
        tx.commit()?;
        storage::workspace_get(&conn, workspace_id)?
            .ok_or_else(|| AppError::not_found("workspace not found"))
    }

    pub fn list_workspace_apps(&self, workspace_id: &str) -> Result<Vec<WorkspaceApp>, AppError> {
        let conn = self.lock_db()?;
        require_workspace(&conn, workspace_id)?;
        storage::workspace_app_list_dto(&conn, workspace_id)
    }

    pub fn list_installed_apps(
        &self,
        workspace_id: Option<&str>,
    ) -> Result<Vec<InstalledApp>, AppError> {
        self.search_installed_apps("", workspace_id)
    }

    pub fn search_installed_apps(
        &self,
        query: &str,
        workspace_id: Option<&str>,
    ) -> Result<Vec<InstalledApp>, AppError> {
        let conn = self.lock_db()?;
        if let Some(workspace_id) = workspace_id {
            require_workspace(&conn, workspace_id)?;
        }
        let bound = match workspace_id {
            Some(workspace_id) => storage::workspace_app_ids_in_workspace(&conn, workspace_id)?
                .into_iter()
                .collect::<HashSet<_>>(),
            None => HashSet::new(),
        };
        let rows = storage::installed_app_list(&conn, Some(query))?;
        Ok(rows
            .iter()
            .map(|row| storage::to_installed_app_dto(row, bound.contains(&row.id)))
            .collect())
    }

    pub fn refresh_installed_apps(&self) -> Result<Vec<InstalledApp>, AppError> {
        let scanned = self
            .adapter
            .scan_installed_apps(&ScanInstalledAppsRequest { force_refresh: true })?;
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        let now = now_utc();
        let mut seen = HashSet::new();

        for app in &scanned.apps {
            merge_scanned_app(&tx, app, &now)?;
            seen.insert((app.platform.clone(), app.scan_fingerprint.clone()));
        }

        for existing in storage::installed_app_list_scan_managed(&tx)? {
            let fingerprint = existing.scan_fingerprint.clone().unwrap_or_default();
            if !seen.contains(&(existing.platform.clone(), fingerprint)) {
                storage::installed_app_mark_unavailable(&tx, &existing.id, &now)?;
            }
        }

        tx.commit()?;
        drop(conn);
        self.list_installed_apps(None)
    }

    pub fn add_manual_app(
        &self,
        path: &str,
        workspace_id: Option<&str>,
    ) -> Result<InstalledApp, AppError> {
        let resolved = self
            .adapter
            .resolve_manual_app_target(&ResolveManualAppTargetRequest {
                path: path.to_string(),
            })?;

        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        if let Some(workspace_id) = workspace_id {
            require_workspace(&tx, workspace_id)?;
        }

        let now = now_utc();
        let row = if let Some(existing) = storage::installed_app_find_by_fingerprint(
            &tx,
            &resolved.platform,
            &resolved.scan_fingerprint,
        )? {
            existing
        } else {
            let row = InstalledAppRow {
                id: new_id(),
                display_name: resolved.display_name.clone(),
                normalized_name: normalize_name(&resolved.display_name),
                app_type: resolved.app_type.clone(),
                platform: resolved.platform.clone(),
                source: resolved.source.clone(),
                launch_target: resolved.launch_target.clone(),
                launch_args: None,
                working_dir: None,
                publisher: None,
                version: None,
                install_location: None,
                executable_path: resolved.executable_path.clone(),
                url: None,
                command_template: None,
                scan_fingerprint: Some(resolved.scan_fingerprint.clone()),
                last_scanned_at: Some(now.clone()),
                is_available: true,
                is_user_added: true,
                created_at: now.clone(),
                updated_at: now.clone(),
                deleted_at: None,
            };
            storage::installed_app_insert(&tx, &row)?;
            row
        };

        if let Some(workspace_id) = workspace_id {
            ensure_workspace_app(&tx, workspace_id, &row.id, "unknown", &now)?;
        }

        let already = match workspace_id {
            Some(workspace_id) => storage::workspace_app_find_active(&tx, workspace_id, &row.id)?
                .is_some(),
            None => false,
        };
        tx.commit()?;
        Ok(storage::to_installed_app_dto(&row, already))
    }

    pub fn launch_workspace_app(
        &self,
        workspace_id: &str,
        installed_app_id: &str,
    ) -> Result<WorkspaceApp, AppError> {
        let (target, display_name, workspace_app_id, launch_args) = {
            let mut conn = self.lock_db()?;
            let tx = conn.transaction()?;
            require_workspace(&tx, workspace_id)?;
            let app = storage::installed_app_get(&tx, installed_app_id)?
                .filter(|row| row.deleted_at.is_none())
                .ok_or_else(|| AppError::not_found("installed app not found"))?;
            if !app.is_available {
                return Err(AppError::installed_app_unavailable(
                    "installed app is not available",
                ));
            }
            let now = now_utc();
            let workspace_app = ensure_workspace_app(&tx, workspace_id, &app.id, "launching", &now)?;
            storage::workspace_app_update_launch(
                &tx,
                &workspace_app.id,
                "launching",
                workspace_app.last_window_id.as_deref(),
                &now,
                &now,
            )?;
            tx.commit()?;
            (
                app.launch_target,
                app.display_name,
                workspace_app.id,
                app.launch_args,
            )
        };

        let launched = self.adapter.launch_app(&LaunchAppRequest {
            launch_target: target,
            display_name,
            installed_app_id: Some(installed_app_id.to_string()),
            workspace_id: Some(workspace_id.to_string()),
            launch_args,
        });

        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        let now = now_utc();
        match launched {
            Ok(result) => {
                if let Some(native_window_id) = result.native_window_id.as_deref() {
                    insert_running_window(
                        &tx,
                        workspace_id,
                        &workspace_app_id,
                        native_window_id,
                        result.process_id,
                        result.process_path.as_deref(),
                        result.title.as_deref(),
                        &now,
                    )?;
                } else {
                    storage::workspace_app_update_launch(
                        &tx,
                        &workspace_app_id,
                        "running",
                        None,
                        &now,
                        &now,
                    )?;
                }
            }
            Err(err) => {
                storage::workspace_app_update_launch(
                    &tx,
                    &workspace_app_id,
                    "launch_failed",
                    None,
                    &now,
                    &now,
                )?;
                tx.commit()?;
                return Err(err.into());
            }
        }
        tx.commit()?;
        storage::workspace_app_list_dto(&conn, workspace_id)?
            .into_iter()
            .find(|item| item.id == workspace_app_id)
            .ok_or_else(|| AppError::internal("workspace app missing after launch"))
    }

    pub fn focus_workspace_app(&self, workspace_app_id: &str) -> Result<WorkspaceApp, AppError> {
        let (workspace_id, installed_app, workspace_app, binding, exclude_window_ids) = {
            let conn = self.lock_db()?;
            let row = storage::workspace_app_get(&conn, workspace_app_id)?
                .filter(|item| item.deleted_at.is_none())
                .ok_or_else(|| AppError::not_found("workspace app not found"))?;
            let app = storage::installed_app_get(&conn, &row.installed_app_id)?
                .ok_or_else(|| AppError::not_found("installed app not found"))?;
            let binding = match row.last_window_id.as_deref() {
                Some(window_id) => storage::native_window_get_binding(&conn, window_id)?,
                None => None,
            };
            let exclude_window_ids =
                storage::native_window_bound_external_ids(&conn, Some(&row.id))?;
            (row.workspace_id.clone(), app, row, binding, exclude_window_ids)
        };

        let display_name = workspace_app
            .display_alias
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(&installed_app.display_name)
            .to_string();
        let mut hint = window_match_hint(
            &display_name,
            installed_app.executable_path.as_deref(),
            Some(installed_app.launch_target.as_str()),
            installed_app.install_location.as_deref(),
            binding.as_ref(),
        );
        hint.exclude_window_ids = exclude_window_ids;

        let windows = match self.adapter.list_windows(&ListWindowsRequest::default()) {
            Ok(windows) => windows,
            Err(_) => Vec::new(),
        };
        let target = pick_focus_window(&windows, &hint);

        let Some(target) = target else {
            return self.focus_sibling_or_close(workspace_app_id, &workspace_id, None);
        };

        match self.adapter.focus_window(&FocusWindowRequest {
            native_window_id: target.native_window_id.clone(),
        }) {
            Ok(_) => {
                let mut conn = self.lock_db()?;
                let tx = conn.transaction()?;
                let now = now_utc();
                bind_discovered_window(&tx, &workspace_id, workspace_app_id, &target, &now)?;
                tx.commit()?;
                storage::workspace_app_list_dto(&conn, &workspace_id)?
                    .into_iter()
                    .find(|item| item.id == workspace_app_id)
                    .ok_or_else(|| AppError::not_found("workspace app not found"))
            }
            Err(err) if err.code.as_str() == "WindowClosed" => {
                self.focus_sibling_or_close(
                    workspace_app_id,
                    &workspace_id,
                    Some(target.native_window_id.as_str()),
                )
                .map_err(|_| err.into())
            }
            Err(err) if err.code.as_str() == "FocusDenied" => {
                let mut conn = self.lock_db()?;
                let tx = conn.transaction()?;
                let now = now_utc();
                bind_discovered_window(&tx, &workspace_id, workspace_app_id, &target, &now)?;
                tx.commit()?;
                Err(err.into())
            }
            Err(err) => Err(err.into()),
        }
    }

    fn focus_sibling_or_close(
        &self,
        workspace_app_id: &str,
        workspace_id: &str,
        closed_external_id: Option<&str>,
    ) -> Result<WorkspaceApp, AppError> {
        let sibling = {
            let conn = self.lock_db()?;
            let now = now_utc();
            if let Some(external_id) = closed_external_id {
                if let Some(closed_row) = storage::native_window_find_by_external(
                    &conn,
                    workspace_app_id,
                    external_id,
                )? {
                    storage::native_window_mark_closed(&conn, &closed_row.id, &now)?;
                }
            } else if let Some(row) = storage::workspace_app_get(&conn, workspace_app_id)? {
                if let Some(window_row_id) = row.last_window_id.as_deref() {
                    storage::native_window_mark_closed(&conn, window_row_id, &now)?;
                }
            }
            if let Some(next_id) =
                storage::native_window_most_recent_running_id(&conn, workspace_app_id)?
            {
                storage::workspace_app_set_last_window(
                    &conn,
                    workspace_app_id,
                    Some(&next_id),
                    "running",
                    &now,
                )?;
                storage::native_window_get_binding(&conn, &next_id)?
            } else {
                storage::workspace_app_update_focus(
                    &conn,
                    workspace_app_id,
                    "window_closed",
                    None,
                    &now,
                )?;
                None
            }
        };
        let Some(sibling) = sibling else {
            return Err(AppError::window_closed("workspace app has no open window"));
        };
        match self.adapter.focus_window(&FocusWindowRequest {
            native_window_id: sibling.external_window_id.clone(),
        }) {
            Ok(_) => {
                let window = PlatformWindow {
                    native_window_id: sibling.external_window_id.clone(),
                    process_id: sibling.process_id.map(|value| value as u32),
                    title: sibling.title.clone().unwrap_or_default(),
                    process_path: sibling.process_path.clone(),
                };
                let mut conn = self.lock_db()?;
                let tx = conn.transaction()?;
                let now = now_utc();
                bind_discovered_window(&tx, workspace_id, workspace_app_id, &window, &now)?;
                tx.commit()?;
                storage::workspace_app_list_dto(&conn, workspace_id)?
                    .into_iter()
                    .find(|item| item.id == workspace_app_id)
                    .ok_or_else(|| AppError::not_found("workspace app not found"))
            }
            Err(err) if err.code.as_str() == "WindowClosed" => {
                let conn = self.lock_db()?;
                let now = now_utc();
                storage::native_window_mark_closed(&conn, &sibling.id, &now)?;
                if let Some(next_id) =
                    storage::native_window_most_recent_running_id(&conn, workspace_app_id)?
                {
                    storage::workspace_app_set_last_window(
                        &conn,
                        workspace_app_id,
                        Some(&next_id),
                        "running",
                        &now,
                    )?;
                } else {
                    storage::workspace_app_update_focus(
                        &conn,
                        workspace_app_id,
                        "window_closed",
                        None,
                        &now,
                    )?;
                }
                Err(err.into())
            }
            Err(err) => Err(err.into()),
        }
    }

    pub fn list_workspace_app_windows(
        &self,
        workspace_app_id: &str,
    ) -> Result<Vec<WorkspaceAppWindow>, AppError> {
        self.refresh_workspace_app_windows(workspace_app_id)?;
        let conn = self.lock_db()?;
        storage::native_window_list_dto(&conn, workspace_app_id)
    }

    pub fn refresh_workspace_app_windows(&self, workspace_app_id: &str) -> Result<(), AppError> {
        let (workspace_id, installed_app, workspace_app, exclude_window_ids) = {
            let conn = self.lock_db()?;
            let row = storage::workspace_app_get(&conn, workspace_app_id)?
                .filter(|item| item.deleted_at.is_none())
                .ok_or_else(|| AppError::not_found("workspace app not found"))?;
            let app = storage::installed_app_get(&conn, &row.installed_app_id)?
                .ok_or_else(|| AppError::not_found("installed app not found"))?;
            let exclude_window_ids =
                storage::native_window_bound_external_ids(&conn, Some(&row.id))?;
            (row.workspace_id.clone(), app, row, exclude_window_ids)
        };

        let display_name = workspace_app
            .display_alias
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(&installed_app.display_name)
            .to_string();
        let hint = WindowMatchHint {
            process_id: None,
            process_path: None,
            executable_path: known_executable_path(
                installed_app.executable_path.as_deref(),
                Some(installed_app.launch_target.as_str()),
            ),
            launch_target: Some(installed_app.launch_target.clone()),
            install_location: installed_app.install_location.clone(),
            display_name,
            title_hint: None,
            stored_window_id: None,
            exclude_window_ids,
        };

        let desktop = match self.adapter.list_windows(&ListWindowsRequest::default()) {
            Ok(windows) => windows,
            Err(_) => return Ok(()),
        };
        let matched: Vec<PlatformWindow> = list_matching_windows(&desktop, &hint)
            .into_iter()
            .cloned()
            .collect();

        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        sync_workspace_app_windows(
            &tx,
            &workspace_id,
            workspace_app_id,
            &installed_app.platform,
            workspace_app.last_window_id.as_deref(),
            &workspace_app.status,
            &matched,
            &now_utc(),
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn focus_native_window(&self, window_id: &str) -> Result<WorkspaceApp, AppError> {
        let (workspace_id, workspace_app_id, row) = {
            let conn = self.lock_db()?;
            let row = storage::native_window_get(&conn, window_id)?
                .ok_or_else(|| AppError::not_found("window not found"))?;
            let workspace_app = storage::workspace_app_get(&conn, &row.workspace_app_id)?
                .filter(|item| item.deleted_at.is_none())
                .ok_or_else(|| AppError::not_found("workspace app not found"))?;
            if row.status != "running" {
                return Err(AppError::window_closed("window is closed"));
            }
            (
                workspace_app.workspace_id.clone(),
                workspace_app.id,
                row,
            )
        };

        match self.adapter.focus_window(&FocusWindowRequest {
            native_window_id: row.external_window_id.clone(),
        }) {
            Ok(_) => {
                let mut conn = self.lock_db()?;
                let tx = conn.transaction()?;
                let now = now_utc();
                storage::native_window_touch_focus(&tx, &row.id, &now)?;
                storage::workspace_app_bind_window(
                    &tx,
                    &workspace_app_id,
                    &row.id,
                    "running",
                    &now,
                )?;
                tx.commit()?;
                storage::workspace_app_list_dto(&conn, &workspace_id)?
                    .into_iter()
                    .find(|item| item.id == workspace_app_id)
                    .ok_or_else(|| AppError::not_found("workspace app not found"))
            }
            Err(err) if err.code.as_str() == "WindowClosed" => {
                let mut conn = self.lock_db()?;
                let tx = conn.transaction()?;
                let now = now_utc();
                storage::native_window_mark_closed(&tx, &row.id, &now)?;
                let workspace_app = storage::workspace_app_get(&tx, &workspace_app_id)?
                    .ok_or_else(|| AppError::not_found("workspace app not found"))?;
                if workspace_app.last_window_id.as_deref() == Some(row.id.as_str()) {
                    if let Some(next_id) =
                        storage::native_window_most_recent_running_id(&tx, &workspace_app_id)?
                    {
                        storage::workspace_app_set_last_window(
                            &tx,
                            &workspace_app_id,
                            Some(&next_id),
                            "running",
                            &now,
                        )?;
                    } else {
                        storage::workspace_app_update_focus(
                            &tx,
                            &workspace_app_id,
                            "window_closed",
                            None,
                            &now,
                        )?;
                    }
                }
                tx.commit()?;
                Err(err.into())
            }
            Err(err) if err.code.as_str() == "FocusDenied" => {
                let mut conn = self.lock_db()?;
                let tx = conn.transaction()?;
                let now = now_utc();
                storage::native_window_touch_focus(&tx, &row.id, &now)?;
                storage::workspace_app_bind_window(
                    &tx,
                    &workspace_app_id,
                    &row.id,
                    "running",
                    &now,
                )?;
                tx.commit()?;
                Err(err.into())
            }
            Err(err) => Err(err.into()),
        }
    }

    pub fn remove_workspace_app(
        &self,
        workspace_app_id: &str,
    ) -> Result<RemoveWorkspaceAppResult, AppError> {
        if self.embedded_workspace_app_id()?.as_deref() == Some(workspace_app_id) {
            let _ = self.release_embedded_window();
        }
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        let row = storage::workspace_app_get(&tx, workspace_app_id)?
            .filter(|item| item.deleted_at.is_none())
            .ok_or_else(|| AppError::not_found("workspace app not found"))?;
        let now = now_utc();
        storage::workspace_app_soft_delete(&tx, &row.id, &now)?;
        storage::native_window_soft_delete_for_workspace_app(&tx, &row.id, &now)?;
        storage::settings_delete(&tx, &storage::workspace_app_embed_key(&row.id))?;
        tx.commit()?;
        Ok(RemoveWorkspaceAppResult {
            workspace_app_id: workspace_app_id.to_string(),
            removed: true,
        })
    }

    pub fn set_workspace_app_embed(
        &self,
        workspace_app_id: &str,
        embed_enabled: bool,
    ) -> Result<WorkspaceApp, AppError> {
        let workspace_id = {
            let conn = self.lock_db()?;
            let row = storage::workspace_app_get(&conn, workspace_app_id)?
                .filter(|item| item.deleted_at.is_none())
                .ok_or_else(|| AppError::not_found("workspace app not found"))?;
            row.workspace_id
        };
        if !embed_enabled && self.embedded_workspace_app_id()?.as_deref() == Some(workspace_app_id)
        {
            let _ = self.release_embedded_window();
        }
        {
            let conn = self.lock_db()?;
            let key = storage::workspace_app_embed_key(workspace_app_id);
            if embed_enabled {
                storage::settings_set(
                    &conn,
                    &key,
                    Some("true"),
                    Some(&workspace_id),
                    &now_utc(),
                )?;
            } else {
                storage::settings_delete(&conn, &key)?;
            }
        }
        self.workspace_app_dto(workspace_app_id)
    }

    pub fn embed_workspace_app_window(
        &self,
        workspace_app_id: &str,
        host_bounds: Option<HostBounds>,
        host_hwnd: Option<isize>,
    ) -> Result<EmbedWorkspaceAppResult, AppError> {
        let app = self.workspace_app_dto(workspace_app_id)?;
        if !app.embed_enabled {
            return Err(AppError::validation("未打开在本窗口预览"));
        }

        // Drop any current preview first. A later failure must not leave the
        // previous window parented while the UI treats preview as finished.
        let _ = self.release_embedded_window();

        #[cfg(not(windows))]
        {
            let _ = (host_bounds, host_hwnd);
            return self.embed_fallback(
                workspace_app_id,
                "当前系统不支持在本窗口预览，已改回切换真实窗口。",
            );
        }

        #[cfg(windows)]
        {
            let opaque_id = {
                let conn = self.lock_db()?;
                let row = storage::workspace_app_get(&conn, workspace_app_id)?
                    .filter(|item| item.deleted_at.is_none())
                    .ok_or_else(|| AppError::not_found("workspace app not found"))?;
                let binding = match row.last_window_id.as_deref() {
                    Some(window_id) => storage::native_window_get_binding(&conn, window_id)?,
                    None => None,
                };
                binding
                    .filter(|item| item.status == "running")
                    .map(|item| item.external_window_id)
            };
            let Some(opaque_id) = opaque_id else {
                return self.embed_fallback(workspace_app_id, "没有已绑定的窗口，无法预览。");
            };
            if let Err(reason) = self.try_reparent_bound_window(
                &app.workspace_id,
                workspace_app_id,
                &opaque_id,
                host_hwnd,
                host_bounds.as_ref(),
            ) {
                return self.embed_fallback(workspace_app_id, reason);
            }
            Ok(EmbedWorkspaceAppResult {
                workspace_app: self.workspace_app_dto(workspace_app_id)?,
                embedded: true,
                fallback_focused: false,
                reason: None,
            })
        }
    }

    pub fn release_embedded_window(&self) -> Result<ReleaseEmbeddedWindowResult, AppError> {
        let session = {
            let mut guard = self.lock_embed()?;
            guard.take()
        };
        let Some(session) = session else {
            return Ok(ReleaseEmbeddedWindowResult { released: false });
        };

        #[cfg(windows)]
        {
            let info = crate::platform::windows::embed::EmbedRestoreInfo {
                opaque_window_id: session.opaque_window_id,
                original_style: session.original_style,
                original_ex_style: session.original_ex_style,
                original_parent: session.original_parent,
            };
            let _ = crate::platform::windows::embed::restore_embedded_window(&info);
        }
        #[cfg(not(windows))]
        {
            let _ = session;
        }

        Ok(ReleaseEmbeddedWindowResult { released: true })
    }

    fn embedded_workspace_app_id(&self) -> Result<Option<String>, AppError> {
        Ok(self
            .lock_embed()?
            .as_ref()
            .map(|session| session.workspace_app_id.clone()))
    }

    fn embedded_workspace_id(&self) -> Result<Option<String>, AppError> {
        Ok(self
            .lock_embed()?
            .as_ref()
            .map(|session| session.workspace_id.clone()))
    }

    fn release_embedded_if_workspace(&self, workspace_id: &str) -> Result<(), AppError> {
        if self.embedded_workspace_id()?.as_deref() == Some(workspace_id) {
            self.release_embedded_window()?;
        }
        Ok(())
    }

    fn release_embedded_unless_workspace(&self, workspace_id: &str) -> Result<(), AppError> {
        if self
            .embedded_workspace_id()?
            .is_some_and(|current| current != workspace_id)
        {
            self.release_embedded_window()?;
        }
        Ok(())
    }

    #[doc(hidden)]
    pub fn test_force_embed_session(
        &self,
        workspace_id: &str,
        workspace_app_id: &str,
    ) -> Result<(), AppError> {
        let mut session = self.lock_embed()?;
        *session = Some(EmbedSession {
            workspace_id: workspace_id.to_string(),
            workspace_app_id: workspace_app_id.to_string(),
            opaque_window_id: "mock:embed-session".into(),
            original_style: 0,
            original_ex_style: 0,
            original_parent: 0,
        });
        Ok(())
    }

    #[doc(hidden)]
    pub fn test_has_embed_session(&self) -> bool {
        self.lock_embed()
            .ok()
            .and_then(|guard| guard.as_ref().map(|_| ()))
            .is_some()
    }

    fn embed_fallback(
        &self,
        workspace_app_id: &str,
        reason: impl Into<String>,
    ) -> Result<EmbedWorkspaceAppResult, AppError> {
        let reason = reason.into();
        match self.focus_workspace_app(workspace_app_id) {
            Ok(workspace_app) => Ok(EmbedWorkspaceAppResult {
                workspace_app,
                embedded: false,
                fallback_focused: true,
                reason: Some(reason),
            }),
            Err(err) => Err(err),
        }
    }

    #[cfg(windows)]
    fn try_reparent_bound_window(
        &self,
        workspace_id: &str,
        workspace_app_id: &str,
        opaque_id: &str,
        host_hwnd: Option<isize>,
        host_bounds: Option<&HostBounds>,
    ) -> Result<(), String> {
        if let Some(reason) = crate::platform::windows::embed::reject_reason_for_opaque_id(opaque_id)
        {
            return Err(reason.to_string());
        }
        let Some(host) = host_hwnd.filter(|value| *value != 0) else {
            return Err("没有可用的宿主窗口，无法预览。".into());
        };
        let restore = crate::platform::windows::embed::reparent_to_host(
            opaque_id,
            host,
            host_bounds.map(|bounds| (bounds.x, bounds.y, bounds.width, bounds.height)),
        )?;
        let mut session = self
            .lock_embed()
            .map_err(|_| "无法保存预览状态。".to_string())?;
        *session = Some(EmbedSession {
            workspace_id: workspace_id.to_string(),
            workspace_app_id: workspace_app_id.to_string(),
            opaque_window_id: restore.opaque_window_id,
            original_style: restore.original_style,
            original_ex_style: restore.original_ex_style,
            original_parent: restore.original_parent,
        });
        Ok(())
    }

    pub fn get_canvas(&self, workspace_id: &str) -> Result<Canvas, AppError> {
        let conn = self.lock_db()?;
        require_workspace(&conn, workspace_id)?;
        load_canvas(&conn, workspace_id)
    }

    pub fn save_canvas(
        &self,
        workspace_id: &str,
        nodes: Vec<CanvasNodeInput>,
        edges: Vec<CanvasEdgeInput>,
    ) -> Result<Canvas, AppError> {
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        require_workspace(&tx, workspace_id)?;
        let now = now_utc();

        let mut keep_nodes = Vec::new();
        for input in nodes {
            let node = upsert_node_on_conn(&tx, workspace_id, input, &now)?;
            keep_nodes.push(node.id);
        }

        let mut keep_edges = Vec::new();
        for input in edges {
            let edge = upsert_edge_on_conn(&tx, workspace_id, input, &now)?;
            keep_edges.push(edge.id);
        }

        storage::canvas_edge_soft_delete_missing(&tx, workspace_id, &keep_edges, &now)?;
        storage::canvas_node_soft_delete_missing(&tx, workspace_id, &keep_nodes, &now)?;
        tx.commit()?;
        load_canvas(&conn, workspace_id)
    }

    pub fn upsert_canvas_node(
        &self,
        workspace_id: &str,
        input: CanvasNodeInput,
    ) -> Result<CanvasNode, AppError> {
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        require_workspace(&tx, workspace_id)?;
        let node = upsert_node_on_conn(&tx, workspace_id, input, &now_utc())?;
        tx.commit()?;
        Ok(node)
    }

    pub fn delete_canvas_node(&self, workspace_id: &str, node_id: &str) -> Result<(), AppError> {
        let mut conn = self.lock_db()?;
        let tx = conn.transaction()?;
        require_workspace(&tx, workspace_id)?;
        let now = now_utc();
        let changed = storage::canvas_node_soft_delete(&tx, node_id, &now)?;
        if changed == 0 {
            return Err(AppError::not_found("canvas node not found"));
        }
        storage::canvas_edge_soft_delete_for_node(&tx, workspace_id, node_id, &now)?;
        tx.commit()?;
        Ok(())
    }

    pub fn save_canvas_asset(
        &self,
        file_name: &str,
        content_base64: &str,
        mime_type: Option<&str>,
        source: Option<&str>,
    ) -> Result<Asset, AppError> {
        if file_name.trim().is_empty() {
            return Err(AppError::validation("fileName is required"));
        }
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(content_base64.trim())
            .map_err(|_| AppError::validation("contentBase64 is not valid base64"))?;
        if bytes.is_empty() {
            return Err(AppError::validation("asset content is empty"));
        }

        let digest = sha256_hex(&bytes);
        {
            let conn = self.lock_db()?;
            if let Some(existing) = storage::asset_find_by_sha256(&conn, &digest)? {
                return Ok(existing);
            }
        }

        let id = new_id();
        let extension = extension_from(file_name, mime_type);
        let relative = format!("{id}.{extension}");
        let absolute = self.paths.assets_dir.join(&relative);
        write_asset_file(&absolute, &bytes)?;

        let now = now_utc();
        let asset = Asset {
            id,
            asset_type: "canvas_image".to_string(),
            mime_type: mime_type.filter(|value| !value.is_empty()).map(ToOwned::to_owned),
            file_name: Some(file_name.to_string()),
            storage_path: relative,
            byte_size: Some(bytes.len() as i64),
            sha256: Some(digest),
            source: source
                .filter(|value| !value.is_empty())
                .unwrap_or("manual_import")
                .to_string(),
            created_at: now.clone(),
        };

        let conn = self.lock_db()?;
        if let Err(err) = storage::asset_insert(&conn, &asset, &now) {
            let _ = fs::remove_file(&absolute);
            return Err(err);
        }
        Ok(asset)
    }

    pub fn read_canvas_asset(&self, asset_id: &str) -> Result<CanvasAssetContent, AppError> {
        let conn = self.lock_db()?;
        let asset = storage::asset_get(&conn, asset_id)?
            .ok_or_else(|| AppError::not_found("asset not found"))?;
        drop(conn);

        let absolute = resolve_asset_file(&self.paths.assets_dir, &asset.storage_path)?;
        let bytes = fs::read(&absolute).map_err(|_| AppError::not_found("asset file missing"))?;
        let content_base64 = base64::engine::general_purpose::STANDARD.encode(bytes);
        let mime = mime_from_asset(&asset);
        Ok(CanvasAssetContent {
            asset_id: asset.id,
            mime_type: Some(mime.clone()),
            file_name: asset.file_name,
            data_url: format!("data:{mime};base64,{content_base64}"),
            content_base64,
        })
    }

}

fn write_asset_file(path: &PathBuf, bytes: &[u8]) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, bytes).map_err(|_| AppError::asset_write_failed("failed to write asset file"))
}

fn resolve_asset_file(assets_dir: &Path, storage_path: &str) -> Result<PathBuf, AppError> {
    let storage_path = storage_path.trim();
    if storage_path.is_empty() {
        return Err(AppError::not_found("asset file missing"));
    }
    let relative = Path::new(storage_path);
    let file_name = relative
        .file_name()
        .ok_or_else(|| AppError::not_found("asset file missing"))?;
    if file_name != relative.as_os_str() {
        return Err(AppError::not_found("asset file missing"));
    }
    Ok(assets_dir.join(file_name))
}

fn mime_from_asset(asset: &Asset) -> String {
    if let Some(mime) = asset
        .mime_type
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return mime.to_string();
    }
    match Path::new(&asset.storage_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn extension_from(file_name: &str, mime_type: Option<&str>) -> String {
    Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| {
            matches!(
                value.as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp"
            )
        })
        .or_else(|| match mime_type.unwrap_or_default() {
            "image/png" => Some("png".into()),
            "image/jpeg" => Some("jpg".into()),
            "image/gif" => Some("gif".into()),
            "image/webp" => Some("webp".into()),
            "image/svg+xml" => Some("svg".into()),
            _ => None,
        })
        .unwrap_or_else(|| "bin".into())
}

fn validate_workspace_name(name: &str) -> Result<&str, AppError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation("workspace name is required"));
    }
    if name.chars().count() > 120 {
        return Err(AppError::validation("workspace name is too long"));
    }
    Ok(name)
}

fn empty_to_none(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|item| !item.is_empty())
}

fn require_workspace(conn: &Connection, workspace_id: &str) -> Result<Workspace, AppError> {
    storage::workspace_get(conn, workspace_id)?.ok_or_else(|| AppError::not_found("workspace not found"))
}

fn ensure_workspace_app(
    conn: &Connection,
    workspace_id: &str,
    installed_app_id: &str,
    status: &str,
    now: &str,
) -> Result<WorkspaceAppRow, AppError> {
    if let Some(existing) =
        storage::workspace_app_find_including_deleted(conn, workspace_id, installed_app_id)?
    {
        if existing.deleted_at.is_some() {
            storage::workspace_app_restore(conn, &existing.id, status, now)?;
            return Ok(WorkspaceAppRow {
                deleted_at: None,
                status: status.to_string(),
                updated_at: now.to_string(),
                ..existing
            });
        }
        return Ok(existing);
    }

    let row = WorkspaceAppRow {
        id: new_id(),
        workspace_id: workspace_id.to_string(),
        installed_app_id: installed_app_id.to_string(),
        display_alias: None,
        purpose_note: None,
        category: None,
        sort_order: storage::workspace_app_next_sort_order(conn, workspace_id)?,
        last_launched_at: None,
        last_focused_at: None,
        last_window_id: None,
        status: status.to_string(),
        created_at: now.to_string(),
        updated_at: now.to_string(),
        deleted_at: None,
    };
    storage::workspace_app_insert(conn, &row)?;
    Ok(row)
}

fn window_match_hint(
    display_name: &str,
    executable_path: Option<&str>,
    launch_target: Option<&str>,
    install_location: Option<&str>,
    binding: Option<&storage::NativeWindowBinding>,
) -> WindowMatchHint {
    WindowMatchHint {
        process_id: binding.and_then(|item| item.process_id.map(|value| value as u32)),
        process_path: None,
        executable_path: known_executable_path(executable_path, launch_target),
        launch_target: launch_target.map(ToOwned::to_owned),
        install_location: install_location.map(ToOwned::to_owned),
        display_name: display_name.to_string(),
        title_hint: binding.and_then(|item| item.title.clone()),
        stored_window_id: binding.map(|item| item.external_window_id.clone()),
        exclude_window_ids: Vec::new(),
    }
}

fn known_executable_path(executable_path: Option<&str>, launch_target: Option<&str>) -> Option<String> {
    if let Some(path) = executable_path.filter(|path| is_executable_path(path)) {
        return Some(path.to_string());
    }
    if let Some(path) = launch_target.filter(|path| is_executable_path(path)) {
        return Some(path.to_string());
    }
    launch_target
        .filter(|path| path_extension(path) == "lnk")
        .and_then(resolve_shortcut_executable)
}

fn resolve_shortcut_executable(path: &str) -> Option<String> {
    #[cfg(windows)]
    {
        crate::platform::windows::resolve_shortcut_exe(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

fn insert_running_window(
    conn: &Connection,
    workspace_id: &str,
    workspace_app_id: &str,
    native_window_id: &str,
    process_id: Option<u32>,
    process_path: Option<&str>,
    title: Option<&str>,
    now: &str,
) -> Result<(), AppError> {
    let window_row_id = upsert_running_window(
        conn,
        workspace_id,
        workspace_app_id,
        "windows",
        native_window_id,
        process_id.map(|value| value as i64),
        process_path,
        title,
        now,
    )?;
    storage::workspace_app_update_launch(
        conn,
        workspace_app_id,
        "running",
        Some(&window_row_id),
        now,
        now,
    )?;
    Ok(())
}

fn upsert_running_window(
    conn: &Connection,
    workspace_id: &str,
    workspace_app_id: &str,
    platform: &str,
    native_window_id: &str,
    process_id: Option<i64>,
    process_path: Option<&str>,
    title: Option<&str>,
    now: &str,
) -> Result<String, AppError> {
    if let Some(existing) =
        storage::native_window_find_by_external(conn, workspace_app_id, native_window_id)?
    {
        storage::native_window_update_seen(
            conn,
            &existing.id,
            title,
            process_id,
            process_path,
            now,
        )?;
        return Ok(existing.id);
    }

    let window_row_id = new_id();
    storage::native_window_insert(
        conn,
        &window_row_id,
        workspace_id,
        workspace_app_id,
        platform,
        native_window_id,
        process_id,
        process_path,
        title,
        now,
    )?;
    Ok(window_row_id)
}

fn bind_discovered_window(
    conn: &Connection,
    workspace_id: &str,
    workspace_app_id: &str,
    window: &PlatformWindow,
    now: &str,
) -> Result<(), AppError> {
    let window_row_id = upsert_running_window(
        conn,
        workspace_id,
        workspace_app_id,
        "windows",
        &window.native_window_id,
        window.process_id.map(|value| value as i64),
        window.process_path.as_deref(),
        Some(window.title.as_str()),
        now,
    )?;
    storage::native_window_touch_focus(conn, &window_row_id, now)?;
    storage::workspace_app_bind_window(conn, workspace_app_id, &window_row_id, "running", now)?;
    Ok(())
}

fn sync_workspace_app_windows(
    conn: &Connection,
    workspace_id: &str,
    workspace_app_id: &str,
    platform: &str,
    last_window_id: Option<&str>,
    current_status: &str,
    matched: &[PlatformWindow],
    now: &str,
) -> Result<(), AppError> {
    let mut seen = HashSet::new();
    for window in matched {
        seen.insert(window.native_window_id.clone());
        upsert_running_window(
            conn,
            workspace_id,
            workspace_app_id,
            platform,
            &window.native_window_id,
            window.process_id.map(|value| value as i64),
            window.process_path.as_deref(),
            Some(window.title.as_str()),
            now,
        )?;
    }

    for row in storage::native_window_list_rows(conn, workspace_app_id)? {
        if !seen.contains(&row.external_window_id) && row.status != "closed" {
            storage::native_window_mark_closed(conn, &row.id, now)?;
        }
    }

    let last_running = match last_window_id {
        Some(id) => storage::native_window_is_running(conn, id)?,
        None => false,
    };
    if last_running {
        if current_status != "running" {
            storage::workspace_app_set_last_window(
                conn,
                workspace_app_id,
                last_window_id,
                "running",
                now,
            )?;
        }
        return Ok(());
    }

    if let Some(next_id) = storage::native_window_most_recent_running_id(conn, workspace_app_id)? {
        storage::workspace_app_set_last_window(
            conn,
            workspace_app_id,
            Some(&next_id),
            "running",
            now,
        )?;
    } else {
        storage::workspace_app_update_focus(conn, workspace_app_id, "window_closed", None, now)?;
    }
    Ok(())
}

fn merge_scanned_app(conn: &Connection, app: &ScannedApp, now: &str) -> Result<(), AppError> {
    if let Some(existing) =
        storage::installed_app_find_by_fingerprint(conn, &app.platform, &app.scan_fingerprint)?
    {
        storage::installed_app_update_from_scan(
            conn,
            &existing.id,
            &app.display_name,
            &app.normalized_name,
            &app.app_type,
            &app.source,
            &app.launch_target,
            app.launch_args.as_deref(),
            app.working_dir.as_deref(),
            app.publisher.as_deref(),
            app.version.as_deref(),
            app.install_location.as_deref(),
            app.executable_path.as_deref(),
            now,
            now,
        )?;
        return Ok(());
    }

    let row = InstalledAppRow {
        id: new_id(),
        display_name: app.display_name.clone(),
        normalized_name: app.normalized_name.clone(),
        app_type: app.app_type.clone(),
        platform: app.platform.clone(),
        source: app.source.clone(),
        launch_target: app.launch_target.clone(),
        launch_args: app.launch_args.clone(),
        working_dir: app.working_dir.clone(),
        publisher: app.publisher.clone(),
        version: app.version.clone(),
        install_location: app.install_location.clone(),
        executable_path: app.executable_path.clone(),
        url: None,
        command_template: None,
        scan_fingerprint: Some(app.scan_fingerprint.clone()),
        last_scanned_at: Some(now.to_string()),
        is_available: true,
        is_user_added: false,
        created_at: now.to_string(),
        updated_at: now.to_string(),
        deleted_at: None,
    };
    storage::installed_app_insert(conn, &row)
}

fn load_canvas(conn: &Connection, workspace_id: &str) -> Result<Canvas, AppError> {
    Ok(Canvas {
        workspace_id: workspace_id.to_string(),
        nodes: storage::canvas_node_list(conn, workspace_id)?,
        edges: storage::canvas_edge_list(conn, workspace_id)?,
        updated_at: storage::canvas_latest_updated_at(conn, workspace_id)?,
    })
}

fn validate_node_type(node_type: &str) -> Result<(), AppError> {
    if ALLOWED_NODE_TYPES.contains(&node_type) {
        Ok(())
    } else {
        Err(AppError::validation("unsupported canvas node type"))
    }
}

fn upsert_node_on_conn(
    conn: &Connection,
    workspace_id: &str,
    input: CanvasNodeInput,
    now: &str,
) -> Result<CanvasNode, AppError> {
    validate_node_type(&input.node_type)?;
    let id = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(new_id);
    let exists = storage::canvas_node_exists(conn, &id)?;
    let created_at = if exists {
        storage::canvas_node_list(conn, workspace_id)?
            .into_iter()
            .find(|node| node.id == id)
            .map(|node| node.created_at)
            .unwrap_or_else(|| now.to_string())
    } else {
        now.to_string()
    };
    let node = CanvasNode {
        id,
        workspace_id: workspace_id.to_string(),
        node_type: input.node_type,
        title: input.title,
        content_markdown: input.content_markdown,
        content_text: input.content_text,
        asset_id: input.asset_id,
        x: input.x,
        y: input.y,
        width: input.width,
        height: input.height,
        color: input.color,
        metadata_json: input.metadata_json,
        z_index: input.z_index.unwrap_or(0),
        created_at,
        updated_at: now.to_string(),
    };
    if exists {
        storage::canvas_node_update(conn, &node)?;
    } else {
        storage::canvas_node_insert(conn, &node)?;
    }
    Ok(node)
}

fn upsert_edge_on_conn(
    conn: &Connection,
    workspace_id: &str,
    input: CanvasEdgeInput,
    now: &str,
) -> Result<CanvasEdge, AppError> {
    if input.source_node_id.trim().is_empty() || input.target_node_id.trim().is_empty() {
        return Err(AppError::validation("canvas edge requires source and target"));
    }
    let id = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(new_id);
    let exists = storage::canvas_edge_exists(conn, &id)?;
    let created_at = if exists { now.to_string() } else { now.to_string() };
    let edge = CanvasEdge {
        id,
        workspace_id: workspace_id.to_string(),
        source_node_id: input.source_node_id,
        target_node_id: input.target_node_id,
        label: input.label,
        edge_type: input
            .edge_type
            .unwrap_or_else(|| "default".to_string()),
        metadata_json: input.metadata_json,
        created_at,
        updated_at: now.to_string(),
    };
    if exists {
        storage::canvas_edge_update(conn, &edge)?;
    } else {
        storage::canvas_edge_insert(conn, &edge)?;
    }
    Ok(edge)
}
