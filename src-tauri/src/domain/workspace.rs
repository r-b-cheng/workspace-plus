use serde::{Deserialize, Serialize};

/// Workspace shown to the frontend. Does not include system scan results.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub app_count: u32,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_opened_at: Option<String>,
    pub archived: bool,
    pub is_active: bool,
}

/// Result of a workspace soft-delete.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeleteWorkspaceResult {
    pub workspace_id: String,
    pub deleted: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_camel_case() {
        let workspace = Workspace {
            id: "ws-1".into(),
            name: "设计".into(),
            description: None,
            icon: None,
            color: None,
            app_count: 2,
            updated_at: "2026-06-07T10:30:00Z".into(),
            last_opened_at: None,
            archived: false,
            is_active: true,
        };
        let json = serde_json::to_string(&workspace).unwrap();
        assert!(json.contains("appCount"));
        assert!(json.contains("updatedAt"));
        assert!(json.contains("isActive"));
        assert!(!json.contains("app_count"));
    }
}
