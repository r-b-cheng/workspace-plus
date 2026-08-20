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
    #[serde(default)]
    pub embed_enabled: bool,
}

/// Physical-pixel rectangle for the in-product preview host.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Result of attempting to preview a bound window in this product.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EmbedWorkspaceAppResult {
    pub workspace_app: WorkspaceApp,
    pub embedded: bool,
    pub fallback_focused: bool,
    pub reason: Option<String>,
}

/// Result of restoring a previously previewed window to the desktop.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseEmbeddedWindowResult {
    pub released: bool,
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

    #[test]
    fn workspace_app_embed_enabled_defaults_false_and_camel_case() {
        let app = WorkspaceApp {
            id: "wa-1".into(),
            workspace_id: "ws-1".into(),
            installed_app_id: "app-1".into(),
            name: "Notepad".into(),
            alias: None,
            note: None,
            icon_url: None,
            category: None,
            status: "running".into(),
            last_focused_at: None,
            last_launched_at: None,
            window_title: None,
            native_window_id: Some("win:abc".into()),
            preview_image_url: None,
            error_message: None,
            embed_enabled: false,
        };
        let json = serde_json::to_string(&app).unwrap();
        assert!(json.contains("\"embedEnabled\":false"));
        assert!(!json.to_ascii_lowercase().contains("hwnd"));
        let parsed: WorkspaceApp = serde_json::from_str(r#"{"id":"wa-1","workspaceId":"ws-1","installedAppId":"app-1","name":"Notepad","status":"running"}"#).unwrap();
        assert!(!parsed.embed_enabled);
    }
}
