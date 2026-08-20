use tauri::State;

use crate::domain::{InstalledApp, RemoveWorkspaceAppResult, WorkspaceApp};
use crate::errors::AppError;
use crate::services::AppService;

#[tauri::command(rename_all = "camelCase")]
pub fn list_workspace_apps(
    state: State<AppService>,
    workspace_id: String,
) -> Result<Vec<WorkspaceApp>, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.list_workspace_apps(&workspace_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn list_installed_apps(
    state: State<AppService>,
    workspace_id: Option<String>,
) -> Result<Vec<InstalledApp>, AppError> {
    state.list_installed_apps(workspace_id.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
pub fn search_installed_apps(
    state: State<AppService>,
    query: String,
    workspace_id: Option<String>,
) -> Result<Vec<InstalledApp>, AppError> {
    state.search_installed_apps(&query, workspace_id.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
pub fn refresh_installed_apps(state: State<AppService>) -> Result<Vec<InstalledApp>, AppError> {
    state.refresh_installed_apps()
}

#[tauri::command(rename_all = "camelCase")]
pub fn add_manual_app(
    state: State<AppService>,
    path: String,
    workspace_id: Option<String>,
) -> Result<InstalledApp, AppError> {
    if path.trim().is_empty() {
        return Err(AppError::invalid_target("path is required"));
    }
    state.add_manual_app(&path, workspace_id.as_deref())
}

#[tauri::command(rename_all = "camelCase")]
pub fn launch_workspace_app(
    state: State<AppService>,
    workspace_id: String,
    installed_app_id: String,
) -> Result<WorkspaceApp, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    if installed_app_id.trim().is_empty() {
        return Err(AppError::validation("installedAppId is required"));
    }
    state.launch_workspace_app(&workspace_id, &installed_app_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn focus_workspace_app(
    state: State<AppService>,
    workspace_app_id: String,
) -> Result<WorkspaceApp, AppError> {
    if workspace_app_id.trim().is_empty() {
        return Err(AppError::validation("workspaceAppId is required"));
    }
    state.focus_workspace_app(&workspace_app_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn remove_workspace_app(
    state: State<AppService>,
    workspace_app_id: String,
) -> Result<RemoveWorkspaceAppResult, AppError> {
    if workspace_app_id.trim().is_empty() {
        return Err(AppError::validation("workspaceAppId is required"));
    }
    state.remove_workspace_app(&workspace_app_id)
}
