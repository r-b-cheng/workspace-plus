use crate::domain::NativeWindow;

#[tauri::command]
pub fn list_windows() -> Vec<NativeWindow> {
    vec![NativeWindow::sample()]
}

#[tauri::command]
pub fn focus_window(window_id: String) -> Result<String, String> {
    Ok(format!("focus requested for {window_id}"))
}
