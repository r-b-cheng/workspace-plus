pub mod commands;
pub mod domain;
pub mod errors;
pub mod platform;
pub mod services;
pub mod storage;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::scan_installed_apps,
            commands::launch_app,
            commands::list_windows,
            commands::focus_window,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Workspace Hub");
}

