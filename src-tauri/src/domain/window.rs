use serde::{Deserialize, Serialize};

/// Opaque native window identifier. Callers must not interpret the string.
pub type NativeWindowId = String;

/// Window binding returned to the frontend. The identifier is opaque.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeWindow {
    pub id: String,
    pub native_window_id: NativeWindowId,
    pub title: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_id: Option<u32>,
}

/// Per-app window row for the card list. No HWND or external handle.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAppWindow {
    pub id: String,
    pub workspace_app_id: String,
    pub title: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_focused_at: Option<String>,
}

/// Maps a stored native_windows.status to the frontend union.
pub fn native_window_status_to_dto(status: &str) -> String {
    if status == "running" {
        "running"
    } else {
        "closed"
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dto_does_not_mention_hwnd() {
        let window = NativeWindow {
            id: "row-1".into(),
            native_window_id: "mock:abc".into(),
            title: "Notes".into(),
            state: "running".into(),
            process_id: Some(1001),
        };
        let json = serde_json::to_string(&window).unwrap();
        assert!(json.contains("nativeWindowId"));
        assert!(!json.to_ascii_lowercase().contains("hwnd"));
    }

    #[test]
    fn workspace_app_window_dto_hides_handles() {
        let window = WorkspaceAppWindow {
            id: "row-1".into(),
            workspace_app_id: "wa-1".into(),
            title: "Inbox".into(),
            status: "running".into(),
            last_focused_at: Some("2026-08-20T10:00:00Z".into()),
        };
        let json = serde_json::to_string(&window).unwrap();
        assert!(json.contains("workspaceAppId"));
        assert!(json.contains("lastFocusedAt"));
        assert!(!json.to_ascii_lowercase().contains("hwnd"));
        assert!(!json.contains("external"));
        assert!(!json.contains("nativeWindowId"));
    }
}
