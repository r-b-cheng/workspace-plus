pub mod commands;
pub mod domain;
pub mod errors;
pub mod platform;
pub mod services;
pub mod storage;

pub use errors::AppError;
pub use platform::{MockPlatformAdapter, PlatformAdapter};
pub use services::AppService;

use tauri::Manager;

pub fn run() {
    let _ = tracing_subscriber::fmt::try_init();

    tauri::Builder::default()
        .setup(|app| {
            let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
            let service = AppService::open(app_data, crate::platform::default_adapter())
                .map_err(|err| err.to_string())?;
            app.manage(service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspaces::list_workspaces,
            commands::workspaces::create_workspace,
            commands::workspaces::rename_workspace,
            commands::workspaces::delete_workspace,
            commands::workspaces::set_active_workspace,
            commands::apps::list_workspace_apps,
            commands::apps::list_installed_apps,
            commands::apps::search_installed_apps,
            commands::apps::refresh_installed_apps,
            commands::apps::add_manual_app,
            commands::apps::launch_workspace_app,
            commands::apps::focus_workspace_app,
            commands::apps::remove_workspace_app,
            commands::canvas::get_canvas,
            commands::canvas::save_canvas,
            commands::canvas::save_canvas_asset,
            commands::canvas::upsert_canvas_node,
            commands::canvas::delete_canvas_node,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Workspace Hub");
}
