use crate::domain::{InstalledApp, NativeWindow, Workspace};

#[tauri::command]
pub fn list_workspaces() -> Vec<Workspace> {
    vec![Workspace::sample()]
}

#[tauri::command]
pub fn scan_installed_apps() -> Vec<InstalledApp> {
    vec![InstalledApp::sample("browser", "浏览器")]
}

#[tauri::command]
pub fn launch_app(app_id: String) -> Result<String, String> {
    Ok(format!("launch requested for {app_id}"))
}

#[tauri::command]
pub fn list_windows() -> Vec<NativeWindow> {
    vec![NativeWindow::sample()]
}

#[tauri::command]
pub fn focus_window(window_id: String) -> Result<String, String> {
    Ok(format!("focus requested for {window_id}"))
}

