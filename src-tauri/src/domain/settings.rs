use serde::{Deserialize, Serialize};

pub const DEFAULT_QUICK_SWITCH_SHORTCUT: &str = "Control+KeyO";

pub const REGISTRATION_REGISTERED: &str = "registered";
pub const REGISTRATION_CONFLICT: &str = "conflict";
pub const REGISTRATION_DENIED: &str = "denied";
pub const REGISTRATION_UNREGISTERED: &str = "unregistered";

/// Global app settings returned to the frontend.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub quick_switch_shortcut: String,
    pub registration_status: String,
    pub last_error: Option<String>,
}

impl AppSettings {
    pub fn unregistered(quick_switch_shortcut: impl Into<String>) -> Self {
        Self {
            quick_switch_shortcut: quick_switch_shortcut.into(),
            registration_status: REGISTRATION_UNREGISTERED.to_string(),
            last_error: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_camel_case() {
        let settings = AppSettings {
            quick_switch_shortcut: DEFAULT_QUICK_SWITCH_SHORTCUT.to_string(),
            registration_status: REGISTRATION_REGISTERED.to_string(),
            last_error: None,
        };
        let json = serde_json::to_string(&settings).unwrap();
        assert!(json.contains("quickSwitchShortcut"));
        assert!(json.contains("registrationStatus"));
        assert!(json.contains("lastError"));
        assert!(!json.contains("quick_switch_shortcut"));
    }
}
