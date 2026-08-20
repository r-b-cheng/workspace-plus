use serde::{Deserialize, Serialize};

/// Metadata for a file stored under the app-data `assets/` directory.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: String,
    pub asset_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    pub storage_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub byte_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    pub source: String,
    pub created_at: String,
}

/// File bytes for displaying a canvas image inside the WebView.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasAssetContent {
    pub asset_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    pub content_base64: String,
    pub data_url: String,
}
