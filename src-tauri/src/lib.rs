pub mod commands;
pub mod domain;
pub mod errors;
pub mod platform;
pub mod services;
pub mod storage;

pub use errors::AppError;
pub use platform::{MacOsPlatformAdapter, MockPlatformAdapter, PlatformAdapter};

#[cfg(windows)]
pub use platform::WindowsPlatformAdapter;
pub use services::AppService;

use tauri::Manager;
use tauri_plugin_global_shortcut::ShortcutState;

pub fn run() {
    let _ = tracing_subscriber::fmt::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        commands::settings::emit_quick_switch_open(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            let app_data = app.path().app_data_dir().map_err(|err| err.to_string())?;
            let service = AppService::open(app_data, crate::platform::default_adapter())
                .map_err(|err| err.to_string())?;
            commands::settings::apply_quick_switch_shortcut(app.handle(), &service, None);
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
            commands::apps::list_workspace_app_windows,
            commands::apps::focus_native_window,
            commands::apps::remove_workspace_app,
            commands::apps::set_workspace_app_embed,
            commands::apps::embed_workspace_app_window,
            commands::apps::release_embedded_window,
            commands::canvas::get_canvas,
            commands::canvas::save_canvas,
            commands::canvas::save_canvas_asset,
            commands::canvas::read_canvas_asset,
            commands::canvas::upsert_canvas_node,
            commands::canvas::delete_canvas_node,
            commands::settings::get_app_settings,
            commands::settings::update_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Workspace Hub");
}
