use serde::{Deserialize, Serialize};

/// Persisted canvas snapshot for one workspace.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Canvas {
    pub workspace_id: String,
    pub nodes: Vec<CanvasNode>,
    pub edges: Vec<CanvasEdge>,
    #[serde(default)]
    pub scene: CanvasScene,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

/// Versioned drawing scene. Renderer-only fields are not stored.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasScene {
    pub version: u32,
    pub elements: Vec<CanvasSceneElement>,
}

impl Default for CanvasScene {
    fn default() -> Self {
        Self::empty()
    }
}

impl CanvasScene {
    pub fn empty() -> Self {
        Self {
            version: 1,
            elements: Vec::new(),
        }
    }

    pub fn normalize(self) -> Self {
        Self::from_elements(self.elements)
    }

    pub fn from_elements(elements: Vec<CanvasSceneElement>) -> Self {
        Self {
            version: 1,
            elements: elements
                .into_iter()
                .filter(CanvasSceneElement::is_persistable)
                .collect(),
        }
    }

    pub fn from_json_str(raw: &str) -> Self {
        match serde_json::from_str::<serde_json::Value>(raw) {
            Ok(value) => Self::from_json_value(&value),
            Err(_) => Self::empty(),
        }
    }

    pub fn from_json_value(value: &serde_json::Value) -> Self {
        let Some(elements) = value.get("elements").and_then(|item| item.as_array()) else {
            return Self::empty();
        };
        Self::from_elements(
            elements
                .iter()
                .filter_map(|item| serde_json::from_value::<CanvasSceneElement>(item.clone()).ok())
                .collect(),
        )
    }
}

impl<'de> Deserialize<'de> for CanvasScene {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        Ok(Self::from_json_value(&value))
    }
}

/// Product drawing element. Tagged by `type`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum CanvasSceneElement {
    #[serde(rename = "path")]
    Path(CanvasScenePathElement),
    #[serde(rename = "arrow")]
    Arrow(CanvasSceneArrowElement),
    #[serde(rename = "line")]
    Line(CanvasSceneLineElement),
    #[serde(rename = "rect")]
    Rect(CanvasSceneRectElement),
    #[serde(rename = "ellipse")]
    Ellipse(CanvasSceneEllipseElement),
    #[serde(rename = "text")]
    Text(CanvasSceneTextElement),
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasScenePathElement {
    pub id: String,
    pub points: Vec<[f64; 2]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSceneArrowElement {
    pub id: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSceneLineElement {
    pub id: String,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSceneRectElement {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSceneEllipseElement {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stroke_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fill: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanvasSceneTextElement {
    pub id: String,
    pub x: f64,
    pub y: f64,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

fn finite_point(point: &[f64; 2]) -> bool {
    point[0].is_finite() && point[1].is_finite()
}

impl CanvasSceneElement {
    fn is_persistable(&self) -> bool {
        match self {
            Self::Path(element) => {
                !element.id.trim().is_empty()
                    && element.points.len() >= 2
                    && element.points.iter().all(finite_point)
            }
            Self::Arrow(element) => {
                !element.id.trim().is_empty()
                    && element.x1.is_finite()
                    && element.y1.is_finite()
                    && element.x2.is_finite()
                    && element.y2.is_finite()
            }
            Self::Line(element) => {
                !element.id.trim().is_empty()
                    && element.x1.is_finite()
                    && element.y1.is_finite()
                    && element.x2.is_finite()
                    && element.y2.is_finite()
            }
            Self::Rect(element) => {
                !element.id.trim().is_empty()
                    && element.x.is_finite()
                    && element.y.is_finite()
                    && element.width.is_finite()
                    && element.height.is_finite()
            }
            Self::Ellipse(element) => {
                !element.id.trim().is_empty()
                    && element.x.is_finite()
                    && element.y.is_finite()
                    && element.width.is_finite()
                    && element.height.is_finite()
            }
            Self::Text(element) => {
                !element.id.trim().is_empty() && element.x.is_finite() && element.y.is_finite()
            }
        }
    }
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

    #[test]
    fn scene_normalizes_version_and_drops_renderer_fields() {
        let raw = r##"{
            "version": 9,
            "elements": [
                {
                    "id": "el-1",
                    "type": "path",
                    "points": [[120, 80], [160, 90]],
                    "color": "#176bff",
                    "selected": true,
                    "dragging": false,
                    "hovered": true
                },
                { "id": "bad", "type": "laser", "points": [[0, 0]] },
                { "id": "missing", "type": "rect" }
            ]
        }"##;
        let scene = CanvasScene::from_json_str(raw);
        assert_eq!(scene.version, 1);
        assert_eq!(scene.elements.len(), 1);
        let json = serde_json::to_string(&scene).unwrap();
        assert!(json.contains("\"type\":\"path\""));
        assert!(!json.contains("selected"));
        assert!(!json.contains("dragging"));
        assert!(!json.contains("hovered"));
        assert!(!json.contains("laser"));
    }

    #[test]
    fn corrupt_scene_json_falls_back_to_empty() {
        assert_eq!(CanvasScene::from_json_str("not-json"), CanvasScene::empty());
        assert_eq!(
            CanvasScene::from_json_str("{\"version\":1}"),
            CanvasScene::empty()
        );
    }

    #[test]
    fn scene_roundtrips_line_and_drops_illegal_type() {
        let raw = r##"{
            "version": 1,
            "elements": [
                {
                    "id": "el-line",
                    "type": "line",
                    "x1": 10,
                    "y1": 20,
                    "x2": 80,
                    "y2": 20,
                    "color": "#172033",
                    "strokeWidth": 2
                },
                { "id": "bad", "type": "laser", "points": [[0, 0]] }
            ]
        }"##;
        let scene = CanvasScene::from_json_str(raw);
        assert_eq!(scene.version, 1);
        assert_eq!(scene.elements.len(), 1);
        assert_eq!(
            scene.elements[0],
            CanvasSceneElement::Line(CanvasSceneLineElement {
                id: "el-line".into(),
                x1: 10.0,
                y1: 20.0,
                x2: 80.0,
                y2: 20.0,
                color: Some("#172033".into()),
                stroke_width: Some(2.0),
            })
        );
        let json = serde_json::to_string(&scene).unwrap();
        let again = CanvasScene::from_json_str(&json);
        assert_eq!(again, scene);
        assert!(json.contains("\"type\":\"line\""));
        assert!(!json.contains("laser"));
        assert!(!json.contains("markerEnd"));
    }
}
