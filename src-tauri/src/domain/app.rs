use serde::{Deserialize, Serialize};

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
