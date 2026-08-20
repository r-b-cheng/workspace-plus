use serde::{Deserialize, Serialize};

/// Global software-library entry. Distinct from a workspace binding.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    pub source: String,
    pub launch_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_path: Option<String>,
    pub already_in_workspace: bool,
    pub is_available: bool,
    pub platform: String,
}

/// Workspace-local binding of an installed app.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceApp {
    pub id: String,
    pub workspace_id: String,
    pub installed_app_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alias: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_focused_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_launched_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_window_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

/// Result of removing a workspace app binding.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoveWorkspaceAppResult {
    pub workspace_app_id: String,
    pub removed: bool,
}

/// Maps stored product status to the frontend workspace-app status union.
pub fn workspace_app_status_to_dto(status: &str) -> String {
    match status {
        "launching" => "launching",
        "running" => "running",
        "window_closed" => "closed",
        "launch_failed" => "launchFailed",
        "focus_denied" => "focusFailed",
        "unavailable" => "closed",
        _ => "notStarted",
    }
    .to_string()
}

/// Maps an installed-app source column to the frontend source union.
pub fn installed_app_source_to_dto(source: &str) -> String {
    match source {
        "start_menu" => "startMenu",
        "registry" => "registry",
        "common_path" => "commonPath",
        "manual" => "manualPath",
        "imported" => "imported",
        "url" => "url",
        "command" => "command",
        other => other,
    }
    .to_string()
}

/// Maps a stored app_type to the frontend launchKind union.
pub fn app_type_to_launch_kind(app_type: &str) -> String {
    match app_type {
        "native_app" => "exe",
        "shortcut" => "shortcut",
        "folder" => "folder",
        "url" => "url",
        "command" => "command",
        other => other,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_app_serializes_camel_case() {
        let app = InstalledApp {
            id: "app-1".into(),
            name: "Chrome".into(),
            icon_url: None,
            source: "startMenu".into(),
            launch_kind: "shortcut".into(),
            category: None,
            display_path: Some(r"C:\Apps\chrome.lnk".into()),
            already_in_workspace: false,
            is_available: true,
            platform: "windows".into(),
        };
        let json = serde_json::to_string(&app).unwrap();
        assert!(json.contains("launchKind"));
        assert!(json.contains("alreadyInWorkspace"));
        assert!(json.contains("displayPath"));
        assert!(!json.contains("HWND"));
    }
}
