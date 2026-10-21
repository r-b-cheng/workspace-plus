use std::sync::Arc;
use workspace_hub_lib::{AppService, MockPlatformAdapter};
use workspace_hub_lib::domain::{CanvasEdgeInput, CanvasNodeInput};

fn node(id: &str) -> CanvasNodeInput {
    CanvasNodeInput {
        id: Some(id.into()), node_type: "text".into(), title: Some(id.into()),
        content_markdown: None, content_text: Some("original".into()), asset_id: None,
        x: 0.0, y: 0.0, width: None, height: None, color: None,
        metadata_json: None, z_index: None,
    }
}
fn edge(id: &str, source: &str, target: &str) -> CanvasEdgeInput {
    CanvasEdgeInput {
        id: Some(id.into()), source_node_id: source.into(), target_node_id: target.into(),
        label: None, edge_type: None, metadata_json: None,
    }
}

#[test]
fn node_id_cannot_be_moved_deleted_or_resurrected_in_another_workspace() {
    let temp = tempfile::tempdir().unwrap();
    let service = AppService::open(temp.path(), Arc::new(MockPlatformAdapter::new())).unwrap();
    let a = service.create_workspace("a", None, None, None).unwrap();
    let b = service.create_workspace("b", None, None, None).unwrap();
    let original = service.upsert_canvas_node(&a.id, node("owned-by-a")).unwrap();
    assert_eq!(service.upsert_canvas_node(&b.id, node("owned-by-a")).unwrap_err().code, "Validation");
    assert_eq!(service.delete_canvas_node(&b.id, "owned-by-a").unwrap_err().code, "NotFound");
    assert_eq!(service.get_canvas(&a.id).unwrap().nodes, vec![original.clone()]);
    assert!(service.get_canvas(&b.id).unwrap().nodes.is_empty());
    service.delete_canvas_node(&a.id, "owned-by-a").unwrap();
    assert!(service.upsert_canvas_node(&b.id, node("owned-by-a")).is_err());
    let restored = service.upsert_canvas_node(&a.id, node("owned-by-a")).unwrap();
    assert_eq!(restored.created_at, original.created_at);
}

#[test]
fn foreign_edge_id_rolls_back_the_entire_save() {
    let temp = tempfile::tempdir().unwrap();
    let service = AppService::open(temp.path(), Arc::new(MockPlatformAdapter::new())).unwrap();
    let a = service.create_workspace("a", None, None, None).unwrap();
    let b = service.create_workspace("b", None, None, None).unwrap();
    let original = service.save_canvas(&a.id, vec![node("a1"), node("a2")], vec![edge("a-edge", "a1", "a2")], None).unwrap();
    let err = service.save_canvas(&b.id, vec![node("b1"), node("b2")], vec![edge("a-edge", "b1", "b2")], None).unwrap_err();
    assert_eq!(err.code, "Validation");
    assert_eq!(service.get_canvas(&a.id).unwrap(), original);
    assert!(service.get_canvas(&b.id).unwrap().nodes.is_empty(), "partial save must roll back");
}

#[test]
fn edge_endpoints_must_exist_in_the_saved_canvas() {
    let temp = tempfile::tempdir().unwrap();
    let service = AppService::open(temp.path(), Arc::new(MockPlatformAdapter::new())).unwrap();
    let a = service.create_workspace("a", None, None, None).unwrap();
    let b = service.create_workspace("b", None, None, None).unwrap();
    service.upsert_canvas_node(&a.id, node("a1")).unwrap();
    for target in ["a1", "missing"] {
        let err = service.save_canvas(&b.id, vec![node("b1")], vec![edge("invalid", "b1", target)], None).unwrap_err();
        assert_eq!(err.code, "Validation");
        assert!(service.get_canvas(&b.id).unwrap().nodes.is_empty());
    }
    service.save_canvas(&b.id, vec![node("b1"), node("b2")], vec![edge("valid", "b1", "b2")], None).unwrap();
    assert!(service.save_canvas(&b.id, vec![node("b1")], vec![edge("valid", "b1", "b2")], None).is_err());
    assert_eq!(service.get_canvas(&b.id).unwrap().nodes.len(), 2);
}
