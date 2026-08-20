use serde::{Deserialize, Serialize};

/// Persisted canvas snapshot for one workspace.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Canvas {
    pub workspace_id: String,
    pub nodes: Vec<CanvasNode>,
    pub edges: Vec<CanvasEdge>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Product canvas node. Renderer-only React Flow fields are not stored.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNode {
    pub id: String,
    pub workspace_id: String,
    pub node_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_markdown: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
    pub x: f64,
    pub y: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_json: Option<String>,
    pub z_index: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Product canvas edge. Renderer-only fields are not stored.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdge {
    pub id: String,
    pub workspace_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub edge_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Incoming node payload for save/upsert. Timestamps are assigned by the service.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasNodeInput {
    pub id: Option<String>,
    pub node_type: String,
    pub title: Option<String>,
    pub content_markdown: Option<String>,
    pub content_text: Option<String>,
    pub asset_id: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub color: Option<String>,
    pub metadata_json: Option<String>,
    pub z_index: Option<i64>,
}

/// Incoming edge payload for save/upsert.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasEdgeInput {
    pub id: Option<String>,
    pub source_node_id: String,
    pub target_node_id: String,
    pub label: Option<String>,
    pub edge_type: Option<String>,
    pub metadata_json: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_serializes_without_renderer_fields() {
        let node = CanvasNode {
            id: "n1".into(),
            workspace_id: "ws".into(),
            node_type: "markdown".into(),
            title: Some("笔记".into()),
            content_markdown: Some("# hi".into()),
            content_text: None,
            asset_id: None,
            x: 10.0,
            y: 20.0,
            width: Some(240.0),
            height: None,
            color: None,
            metadata_json: None,
            z_index: 0,
            created_at: "2026-06-07T10:30:00Z".into(),
            updated_at: "2026-06-07T10:30:00Z".into(),
        };
        let json = serde_json::to_string(&node).unwrap();
        assert!(json.contains("nodeType"));
        assert!(json.contains("contentMarkdown"));
        assert!(!json.contains("selected"));
        assert!(!json.contains("dragging"));
        assert!(!json.contains("measured"));
    }
}
