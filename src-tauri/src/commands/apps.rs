use crate::domain::InstalledApp;

#[tauri::command]
pub fn scan_installed_apps() -> Vec<InstalledApp> {
    vec![InstalledApp::sample("browser", "浏览器")]
}

#[tauri::command]
pub fn launch_app(app_id: String) -> Result<String, String> {
    Ok(format!("launch requested for {app_id}"))
}
