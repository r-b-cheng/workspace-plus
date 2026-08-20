use tauri::State;

use crate::domain::{DeleteWorkspaceResult, Workspace};
use crate::errors::AppError;
use crate::services::AppService;

#[tauri::command(rename_all = "camelCase")]
pub fn list_workspaces(state: State<AppService>) -> Result<Vec<Workspace>, AppError> {
    state.list_workspaces()
}

#[tauri::command(rename_all = "camelCase")]
pub fn create_workspace(
    state: State<AppService>,
    name: String,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Workspace, AppError> {
    state.create_workspace(
        &name,
        description.as_deref(),
        icon.as_deref(),
        color.as_deref(),
    )
}

#[tauri::command(rename_all = "camelCase")]
pub fn rename_workspace(
    state: State<AppService>,
    workspace_id: String,
    name: String,
) -> Result<Workspace, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.rename_workspace(&workspace_id, &name)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_workspace(
    state: State<AppService>,
    workspace_id: String,
) -> Result<DeleteWorkspaceResult, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.delete_workspace(&workspace_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn set_active_workspace(
    state: State<AppService>,
    workspace_id: String,
) -> Result<Workspace, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.set_active_workspace(&workspace_id)
}
