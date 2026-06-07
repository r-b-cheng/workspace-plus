use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub app_count: u32,
    pub updated_at: String,
    pub archived: bool,
}

impl Workspace {
    pub fn sample() -> Self {
        Self {
            id: "product-design".to_string(),
            name: "产品设计工作区".to_string(),
            app_count: 5,
            updated_at: "2026-06-07T10:30:00Z".to_string(),
            archived: false,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub source: String,
    pub launch_kind: String,
}

impl InstalledApp {
    pub fn sample(id: &str, name: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            source: "mock".to_string(),
            launch_kind: "shortcut".to_string(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeWindow {
    pub id: String,
    pub title: String,
    pub state: String,
}

impl NativeWindow {
    pub fn sample() -> Self {
        Self {
            id: "mock-window".to_string(),
            title: "最近窗口".to_string(),
            state: "running".to_string(),
        }
    }
}

