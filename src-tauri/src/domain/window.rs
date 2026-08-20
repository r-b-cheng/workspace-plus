use serde::{Deserialize, Serialize};

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
