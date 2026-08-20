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
}
