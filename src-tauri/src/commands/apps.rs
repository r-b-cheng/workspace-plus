use tauri::{AppHandle, Manager, State};

use crate::domain::{
    EmbedWorkspaceAppResult, HostBounds, InstalledApp, ReleaseEmbeddedWindowResult,
    RemoveWorkspaceAppResult, WorkspaceApp, WorkspaceAppWindow,
};
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
pub async fn refresh_installed_apps(handle: AppHandle) -> Result<Vec<InstalledApp>, AppError> {
    super::run_blocking(move || handle.state::<AppService>().refresh_installed_apps()).await
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
pub async fn launch_workspace_app(
    handle: AppHandle,
    workspace_id: String,
    installed_app_id: String,
) -> Result<WorkspaceApp, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    if installed_app_id.trim().is_empty() {
        return Err(AppError::validation("installedAppId is required"));
    }
    super::run_blocking(move || {
        handle
            .state::<AppService>()
            .launch_workspace_app(&workspace_id, &installed_app_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn focus_workspace_app(
    handle: AppHandle,
    workspace_app_id: String,
) -> Result<WorkspaceApp, AppError> {
    if workspace_app_id.trim().is_empty() {
        return Err(AppError::validation("workspaceAppId is required"));
    }
    super::run_blocking(move || {
        handle
            .state::<AppService>()
            .focus_workspace_app(&workspace_app_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn list_workspace_app_windows(
    handle: AppHandle,
    workspace_app_id: String,
) -> Result<Vec<WorkspaceAppWindow>, AppError> {
    if workspace_app_id.trim().is_empty() {
        return Err(AppError::validation("workspaceAppId is required"));
    }
    super::run_blocking(move || {
        handle
            .state::<AppService>()
            .list_workspace_app_windows(&workspace_app_id)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn focus_native_window(
    handle: AppHandle,
    window_id: String,
) -> Result<WorkspaceApp, AppError> {
    if window_id.trim().is_empty() {
        return Err(AppError::validation("windowId is required"));
    }
    super::run_blocking(move || {
        handle
            .state::<AppService>()
            .focus_native_window(&window_id)
    })
    .await
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

#[tauri::command(rename_all = "camelCase")]
pub async fn set_workspace_app_embed(
    handle: AppHandle,
    workspace_app_id: String,
    embed_enabled: bool,
) -> Result<WorkspaceApp, AppError> {
    if workspace_app_id.trim().is_empty() {
        return Err(AppError::validation("workspaceAppId is required"));
    }
    super::run_blocking(move || {
        handle
            .state::<AppService>()
            .set_workspace_app_embed(&workspace_app_id, embed_enabled)
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn embed_workspace_app_window(
    handle: AppHandle,
    workspace_app_id: String,
    host_bounds: Option<HostBounds>,
) -> Result<EmbedWorkspaceAppResult, AppError> {
    if workspace_app_id.trim().is_empty() {
        return Err(AppError::validation("workspaceAppId is required"));
    }
    let host_hwnd = main_window_host(&handle);
    super::run_blocking(move || {
        handle.state::<AppService>().embed_workspace_app_window(
            &workspace_app_id,
            host_bounds,
            host_hwnd,
        )
    })
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn release_embedded_window(
    handle: AppHandle,
) -> Result<ReleaseEmbeddedWindowResult, AppError> {
    super::run_blocking(move || handle.state::<AppService>().release_embedded_window()).await
}

fn main_window_host(handle: &AppHandle) -> Option<isize> {
    #[cfg(windows)]
    {
        let window = handle.get_webview_window("main")?;
        window.hwnd().ok().map(|hwnd| hwnd.0 as isize)
    }
    #[cfg(not(windows))]
    {
        let _ = handle;
        None
    }
}
