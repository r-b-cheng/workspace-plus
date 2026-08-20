//! Thin Tauri commands. Business rules belong in `services`.

use crate::errors::AppError;

pub mod apps;
pub mod canvas;
pub mod settings;
pub mod workspaces;

async fn run_blocking<T, F>(work: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|err| AppError::internal(err.to_string()))?
}

pub use apps::{
    add_manual_app, focus_native_window, focus_workspace_app, launch_workspace_app,
    list_installed_apps, list_workspace_app_windows, list_workspace_apps, refresh_installed_apps,
    remove_workspace_app, search_installed_apps,
};
pub use canvas::{
    delete_canvas_node, get_canvas, read_canvas_asset, save_canvas, save_canvas_asset,
    upsert_canvas_node,
};
pub use settings::{get_app_settings, update_app_settings};
pub use workspaces::{
    create_workspace, delete_workspace, list_workspaces, rename_workspace, set_active_workspace,
};
