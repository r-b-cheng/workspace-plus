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
