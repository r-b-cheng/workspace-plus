use crate::domain::Workspace;

#[tauri::command]
pub fn list_workspaces() -> Vec<Workspace> {
    vec![Workspace::sample()]
}
