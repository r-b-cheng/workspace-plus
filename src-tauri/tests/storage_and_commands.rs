use std::sync::Arc;

use tempfile::TempDir;
use workspace_hub_lib::domain::{
    CanvasNodeInput, CanvasScene, CanvasSceneArrowElement, CanvasSceneElement,
    CanvasScenePathElement, CanvasSceneRectElement,
};
use workspace_hub_lib::platform::{FocusWindowRequest, ListWindowsRequest, PlatformAdapter};
use workspace_hub_lib::storage::{apply_migrations, open_database, reapply_migration_sql};
use workspace_hub_lib::{AppService, MockPlatformAdapter};

struct TestEnv {
    _tmp: TempDir,
    service: AppService,
    adapter: Arc<MockPlatformAdapter>,
}

fn setup() -> TestEnv {
    let tmp = TempDir::new().expect("temp dir");
    let adapter = Arc::new(MockPlatformAdapter::new());
    let service =
        AppService::open(tmp.path(), adapter.clone() as Arc<dyn PlatformAdapter>).expect("open db");
    TestEnv {
        _tmp: tmp,
        service,
        adapter,
    }
}

#[test]
fn migrations_can_run_repeatedly() {
    let tmp = TempDir::new().unwrap();
    let db_path = tmp.path().join("data").join("workspace-hub.sqlite3");
    let conn = open_database(&db_path).unwrap();
    apply_migrations(&conn).unwrap();
    apply_migrations(&conn).unwrap();
    reapply_migration_sql(&conn).unwrap();

    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();
    assert_eq!(mode.to_lowercase(), "wal");
    let foreign_keys: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap();
    assert_eq!(foreign_keys, 1);
}

#[test]
fn new_database_list_workspaces_is_empty() {
    let env = setup();
    assert!(env.service.list_workspaces().unwrap().is_empty());
    assert!(env.service.list_installed_apps(None).unwrap().is_empty());
    assert_eq!(env.service.journal_mode().unwrap().to_lowercase(), "wal");
    assert!(env.service.foreign_keys_enabled().unwrap());
}

#[test]
fn two_workspaces_isolate_apps_and_canvas() {
    let env = setup();
    let a = env.service.create_workspace("工作区 A", None, None, None).unwrap();
    let b = env.service.create_workspace("工作区 B", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .expect("chrome in mock catalog");
    let vscode = env
        .service
        .search_installed_apps("visual studio code", None)
        .unwrap()
        .into_iter()
        .next()
        .expect("vscode in mock catalog");

    env.service
        .launch_workspace_app(&a.id, &chrome.id)
        .unwrap();
    env.service
        .upsert_canvas_node(
            &a.id,
            CanvasNodeInput {
                id: Some("note-a".into()),
                node_type: "markdown".into(),
                title: Some("A 的笔记".into()),
                content_markdown: Some("# A".into()),
                content_text: None,
                asset_id: None,
                x: 12.0,
                y: 24.0,
                width: Some(200.0),
                height: None,
                color: None,
                metadata_json: None,
                z_index: Some(0),
            },
        )
        .unwrap();

    env.service
        .launch_workspace_app(&b.id, &vscode.id)
        .unwrap();

    let apps_a = env.service.list_workspace_apps(&a.id).unwrap();
    let apps_b = env.service.list_workspace_apps(&b.id).unwrap();
    assert_eq!(apps_a.len(), 1);
    assert_eq!(apps_a[0].installed_app_id, chrome.id);
    assert_eq!(apps_b.len(), 1);
    assert_eq!(apps_b[0].installed_app_id, vscode.id);

    let canvas_a = env.service.get_canvas(&a.id).unwrap();
    let canvas_b = env.service.get_canvas(&b.id).unwrap();
    assert_eq!(canvas_a.nodes.len(), 1);
    assert_eq!(canvas_a.nodes[0].title.as_deref(), Some("A 的笔记"));
    assert!(canvas_b.nodes.is_empty());
}

#[test]
fn same_workspace_does_not_double_bind_installed_app() {
    let env = setup();
    let workspace = env.service.create_workspace("重复添加", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();

    let first = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let second = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let bound = env
        .service
        .add_manual_app(r"C:\Tools\demo.exe", Some(&workspace.id))
        .unwrap();
    assert!(bound.already_in_workspace);
    env.service
        .add_manual_app(r"C:\Tools\demo.exe", Some(&workspace.id))
        .unwrap();

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps.len(), 2);
    assert_eq!(apps.iter().filter(|app| app.id == first.id).count(), 1);
    assert_eq!(second.id, first.id);
    assert_eq!(
        apps.iter()
            .filter(|app| app.installed_app_id == bound.id)
            .count(),
        1
    );
}

#[test]
fn delete_workspace_keeps_installed_apps() {
    let env = setup();
    let workspace = env.service.create_workspace("待删除", None, None, None).unwrap();
    let catalog = env.service.refresh_installed_apps().unwrap();
    assert!(!catalog.is_empty());
    let app_id = catalog[0].id.clone();
    env.service
        .launch_workspace_app(&workspace.id, &app_id)
        .unwrap();

    env.service.delete_workspace(&workspace.id).unwrap();
    assert!(env.service.list_workspaces().unwrap().is_empty());
    assert!(env
        .service
        .list_workspace_apps(&workspace.id)
        .unwrap_err()
        .code
        .eq("NotFound"));

    let remaining = env.service.list_installed_apps(None).unwrap();
    assert!(remaining.iter().any(|app| app.id == app_id));
}

#[test]
fn canvas_save_then_reload_is_readable() {
    let env = setup();
    let workspace = env.service.create_workspace("白板", None, None, None).unwrap();
    env.service
        .save_canvas(
            &workspace.id,
            vec![
                CanvasNodeInput {
                    id: Some("n1".into()),
                    node_type: "markdown".into(),
                    title: Some("标题".into()),
                    content_markdown: Some("hello".into()),
                    content_text: None,
                    asset_id: None,
                    x: 40.0,
                    y: 80.0,
                    width: Some(320.0),
                    height: Some(160.0),
                    color: None,
                    metadata_json: None,
                    z_index: Some(1),
                },
                CanvasNodeInput {
                    id: Some("n2".into()),
                    node_type: "text".into(),
                    title: Some("第二张".into()),
                    content_markdown: None,
                    content_text: Some("plain".into()),
                    asset_id: None,
                    x: 400.0,
                    y: 80.0,
                    width: None,
                    height: None,
                    color: Some("#fff1a8".into()),
                    metadata_json: None,
                    z_index: Some(2),
                },
            ],
            vec![workspace_hub_lib::domain::CanvasEdgeInput {
                id: Some("e1".into()),
                source_node_id: "n1".into(),
                target_node_id: "n2".into(),
                label: Some("相关".into()),
                edge_type: Some("default".into()),
                metadata_json: None,
            }],
            None,
        )
        .unwrap();

    let loaded = env.service.get_canvas(&workspace.id).unwrap();
    assert_eq!(loaded.nodes.len(), 2);
    assert_eq!(loaded.edges.len(), 1);
    let first = loaded.nodes.iter().find(|node| node.id == "n1").unwrap();
    assert_eq!(first.title.as_deref(), Some("标题"));
    assert_eq!(first.content_markdown.as_deref(), Some("hello"));
    assert_eq!(first.x, 40.0);
    assert_eq!(first.y, 80.0);
    assert_eq!(loaded.edges[0].source_node_id, "n1");
    assert_eq!(loaded.scene, CanvasScene::empty());
}

#[test]
fn canvas_scene_roundtrip_drops_renderer_fields() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("画图层", None, None, None)
        .unwrap();
    let scene = serde_json::from_value::<CanvasScene>(serde_json::json!({
        "version": 1,
        "elements": [
            {
                "id": "el-1",
                "type": "path",
                "points": [[120.0, 80.0], [160.0, 90.0], [210.0, 70.0]],
                "color": "#176bff",
                "strokeWidth": 2,
                "selected": true,
                "dragging": false
            },
            {
                "id": "el-2",
                "type": "arrow",
                "x1": 80.0,
                "y1": 120.0,
                "x2": 240.0,
                "y2": 160.0,
                "color": "#172033"
            },
            {
                "id": "el-3",
                "type": "rect",
                "x": 300.0,
                "y": 40.0,
                "width": 160.0,
                "height": 90.0,
                "color": "#176bff",
                "fill": null
            }
        ]
    }))
    .unwrap();

    env.service
        .save_canvas(&workspace.id, vec![], vec![], Some(scene))
        .unwrap();

    let loaded = env.service.get_canvas(&workspace.id).unwrap();
    assert_eq!(loaded.scene.version, 1);
    assert_eq!(loaded.scene.elements.len(), 3);
    assert_eq!(
        loaded.scene.elements[0],
        CanvasSceneElement::Path(CanvasScenePathElement {
            id: "el-1".into(),
            points: vec![[120.0, 80.0], [160.0, 90.0], [210.0, 70.0]],
            color: Some("#176bff".into()),
            stroke_width: Some(2.0),
        })
    );
    assert_eq!(
        loaded.scene.elements[1],
        CanvasSceneElement::Arrow(CanvasSceneArrowElement {
            id: "el-2".into(),
            x1: 80.0,
            y1: 120.0,
            x2: 240.0,
            y2: 160.0,
            color: Some("#172033".into()),
            stroke_width: None,
        })
    );
    assert_eq!(
        loaded.scene.elements[2],
        CanvasSceneElement::Rect(CanvasSceneRectElement {
            id: "el-3".into(),
            x: 300.0,
            y: 40.0,
            width: 160.0,
            height: 90.0,
            color: Some("#176bff".into()),
            stroke_width: None,
            fill: None,
        })
    );

    let stored: String = {
        let conn = rusqlite::Connection::open(&env.service.paths().db_path).unwrap();
        conn.query_row(
            "SELECT scene_json FROM canvas_scenes WHERE workspace_id = ?1",
            [&workspace.id],
            |row| row.get(0),
        )
        .unwrap()
    };
    assert!(!stored.contains("selected"));
    assert!(!stored.contains("dragging"));
}

#[test]
fn canvas_scene_is_isolated_per_workspace() {
    let env = setup();
    let a = env
        .service
        .create_workspace("画图 A", None, None, None)
        .unwrap();
    let b = env
        .service
        .create_workspace("画图 B", None, None, None)
        .unwrap();
    let scene = CanvasScene::from_elements(vec![CanvasSceneElement::Path(
        CanvasScenePathElement {
            id: "el-a".into(),
            points: vec![[0.0, 0.0], [12.0, 8.0]],
            color: Some("#176bff".into()),
            stroke_width: Some(2.0),
        },
    )]);
    env.service
        .save_canvas(&a.id, vec![], vec![], Some(scene))
        .unwrap();

    let canvas_a = env.service.get_canvas(&a.id).unwrap();
    let canvas_b = env.service.get_canvas(&b.id).unwrap();
    assert_eq!(canvas_a.scene.elements.len(), 1);
    assert_eq!(canvas_b.scene, CanvasScene::empty());
}

#[test]
fn save_canvas_none_preserves_existing_scene() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("保留 scene", None, None, None)
        .unwrap();
    let scene = CanvasScene::from_elements(vec![CanvasSceneElement::Arrow(
        CanvasSceneArrowElement {
            id: "el-keep".into(),
            x1: 10.0,
            y1: 10.0,
            x2: 40.0,
            y2: 40.0,
            color: Some("#172033".into()),
            stroke_width: None,
        },
    )]);
    env.service
        .save_canvas(&workspace.id, vec![], vec![], Some(scene.clone()))
        .unwrap();
    env.service
        .save_canvas(
            &workspace.id,
            vec![CanvasNodeInput {
                id: Some("n-keep".into()),
                node_type: "markdown".into(),
                title: Some("笔记".into()),
                content_markdown: Some("still here".into()),
                content_text: None,
                asset_id: None,
                x: 8.0,
                y: 8.0,
                width: Some(200.0),
                height: Some(120.0),
                color: None,
                metadata_json: None,
                z_index: Some(1),
            }],
            vec![],
            None,
        )
        .unwrap();

    let loaded = env.service.get_canvas(&workspace.id).unwrap();
    assert_eq!(loaded.nodes.len(), 1);
    assert_eq!(loaded.scene, scene);
}

#[test]
fn canvas_scene_drops_invalid_type_and_get_succeeds() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("非法图形", None, None, None)
        .unwrap();
    let scene = serde_json::from_value::<CanvasScene>(serde_json::json!({
        "version": 1,
        "elements": [
            {
                "id": "ok",
                "type": "path",
                "points": [[0.0, 0.0], [4.0, 4.0]]
            },
            { "id": "bad", "type": "laser", "points": [[1, 1]] },
            { "id": "missing-coords", "type": "ellipse" }
        ]
    }))
    .unwrap();
    env.service
        .save_canvas(&workspace.id, vec![], vec![], Some(scene))
        .unwrap();
    let loaded = env.service.get_canvas(&workspace.id).unwrap();
    assert_eq!(loaded.scene.elements.len(), 1);
    assert!(matches!(
        loaded.scene.elements[0],
        CanvasSceneElement::Path(_)
    ));

    {
        let conn = rusqlite::Connection::open(&env.service.paths().db_path).unwrap();
        conn.execute(
            "UPDATE canvas_scenes SET scene_json = ?1 WHERE workspace_id = ?2",
            rusqlite::params!["not-json", &workspace.id],
        )
        .unwrap();
    }
    let recovered = env.service.get_canvas(&workspace.id).unwrap();
    assert_eq!(recovered.scene, CanvasScene::empty());
}

#[test]
fn delete_workspace_soft_deletes_scene() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("删区带图", None, None, None)
        .unwrap();
    let scene = CanvasScene::from_elements(vec![CanvasSceneElement::Rect(
        CanvasSceneRectElement {
            id: "el-gone".into(),
            x: 1.0,
            y: 2.0,
            width: 30.0,
            height: 20.0,
            color: Some("#176bff".into()),
            stroke_width: None,
            fill: None,
        },
    )]);
    env.service
        .save_canvas(&workspace.id, vec![], vec![], Some(scene))
        .unwrap();
    env.service.delete_workspace(&workspace.id).unwrap();

    let err = env.service.get_canvas(&workspace.id).unwrap_err();
    assert_eq!(err.code, "NotFound");

    let deleted_at: Option<String> = {
        let conn = rusqlite::Connection::open(&env.service.paths().db_path).unwrap();
        conn.query_row(
            "SELECT deleted_at FROM canvas_scenes WHERE workspace_id = ?1",
            [&workspace.id],
            |row| row.get(0),
        )
        .unwrap()
    };
    assert!(deleted_at.is_some());
}

#[test]
fn add_manual_app_rejects_non_exe_lnk() {
    let env = setup();
    let err = env
        .service
        .add_manual_app(r"C:\Users\me\notes.txt", None)
        .unwrap_err();
    assert_eq!(err.code, "InvalidTarget");

    let err = env
        .service
        .add_manual_app("https://example.com", None)
        .unwrap_err();
    assert_eq!(err.code, "InvalidTarget");

    let added = env
        .service
        .add_manual_app(r"C:\Tools\demo.exe", None)
        .unwrap();
    assert_eq!(added.launch_kind, "exe");
    assert_eq!(added.source, "manualPath");

    let shortcut = env
        .service
        .add_manual_app(r"C:\Tools\demo.lnk", None)
        .unwrap();
    assert_eq!(shortcut.launch_kind, "shortcut");
}

#[test]
fn refresh_populates_mock_catalog() {
    let env = setup();
    assert!(env.service.list_installed_apps(None).unwrap().is_empty());
    let apps = env.service.refresh_installed_apps().unwrap();
    assert!(apps.len() >= 8);
    assert!(apps.iter().any(|app| app.name.contains("Visual Studio Code")));
    assert!(apps.iter().any(|app| app.name.contains("Google Chrome")));
    let again = env.service.refresh_installed_apps().unwrap();
    assert_eq!(again.len(), apps.len());
}

#[test]
fn focus_missing_or_closed_window_returns_window_closed() {
    let env = setup();
    let workspace = env.service.create_workspace("窗口", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    assert_eq!(launched.status, "running");
    let native_id = launched.native_window_id.clone().expect("mock window");
    assert!(native_id.starts_with("mock:"));
    assert!(!native_id.to_ascii_lowercase().contains("hwnd"));

    env.service.focus_workspace_app(&launched.id).unwrap();
    env.adapter.close_window(&native_id);
    let err = env.service.focus_workspace_app(&launched.id).unwrap_err();
    assert_eq!(err.code, "WindowClosed");

    let missing = env
        .adapter
        .focus_window(&FocusWindowRequest {
            native_window_id: "mock:missing".into(),
        })
        .unwrap_err();
    assert_eq!(missing.code.as_str(), "WindowClosed");
}

#[test]
fn focus_rediscovers_running_window_after_stale_handle() {
    let env = setup();
    let workspace = env.service.create_workspace("窗口", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let stale_id = launched.native_window_id.clone().expect("mock window");
    env.adapter.close_window(&stale_id);

    let live_id = env.adapter.open_window(
        "Google Chrome",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    );
    let focused = env.service.focus_workspace_app(&launched.id).unwrap();
    assert_eq!(focused.status, "running");
    assert_eq!(focused.native_window_id.as_deref(), Some(live_id.as_str()));
}

#[test]
fn focus_finds_window_even_when_launch_never_bound_one() {
    let env = setup();
    let workspace = env.service.create_workspace("窗口", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    if let Some(native_id) = launched.native_window_id.as_deref() {
        env.adapter.close_window(native_id);
    }
    env.adapter.open_window("Inbox - Google Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe");
    let focused = env.service.focus_workspace_app(&launched.id).unwrap();
    assert_eq!(focused.status, "running");
    assert!(focused.native_window_id.is_some());
}

#[test]
fn focus_ignores_same_filename_from_another_folder() {
    let env = setup();
    let workspace = env.service.create_workspace("窗口", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    if let Some(native_id) = launched.native_window_id.as_deref() {
        env.adapter.close_window(native_id);
    }
    env.adapter
        .open_window("Google Chrome", r"D:\Downloads\chrome.exe");
    let err = env.service.focus_workspace_app(&launched.id).unwrap_err();
    assert_eq!(err.code, "WindowClosed");
}

#[test]
fn launch_does_not_bind_a_preexisting_same_app_window() {
    let env = setup();
    let workspace = env.service.create_workspace("窗口", None, None, None).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let preexisting = env.adapter.open_window(
        "Already open",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    );
    env.adapter.omit_next_launch_window();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    assert_eq!(launched.status, "running");
    assert!(launched.native_window_id.is_none());

    env.adapter.open_window(
        "Second Chrome",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    );
    let err = env.service.focus_workspace_app(&launched.id).unwrap_err();
    assert_eq!(err.code, "WindowClosed");
    assert_ne!(Some(preexisting.as_str()), launched.native_window_id.as_deref());
}

#[test]
fn save_canvas_asset_writes_file_not_blob() {
    let env = setup();
    let png = base64_png();
    let asset = env
        .service
        .save_canvas_asset("note.png", &png, Some("image/png"), Some("clipboard"))
        .unwrap();
    assert!(asset.sha256.is_some());
    let path = env.service.paths().assets_dir.join(&asset.storage_path);
    assert!(path.is_file());
    assert!(std::fs::read(&path).unwrap().len() > 0);

    let content = env.service.read_canvas_asset(&asset.id).unwrap();
    assert_eq!(content.asset_id, asset.id);
    assert_eq!(content.content_base64, png);
    assert!(content.data_url.starts_with("data:image/png;base64,"));
}

#[test]
fn read_canvas_asset_missing_is_not_found() {
    let env = setup();
    let err = env.service.read_canvas_asset("missing-asset").unwrap_err();
    assert_eq!(err.code, "NotFound");
}

#[test]
fn app_settings_default_shortcut_is_control_key_o() {
    let env = setup();
    let settings = env.service.get_app_settings().unwrap();
    assert_eq!(settings.quick_switch_shortcut, "Control+KeyO");
    assert_eq!(settings.registration_status, "unregistered");
    assert!(settings.last_error.is_none());
}

#[test]
fn app_settings_shortcut_survives_reopen() {
    let tmp = TempDir::new().expect("temp dir");
    let adapter = Arc::new(MockPlatformAdapter::new());
    {
        let service = AppService::open(tmp.path(), adapter.clone() as Arc<dyn PlatformAdapter>)
            .expect("open db");
        service
            .update_app_settings(Some("Alt+KeyK".into()))
            .unwrap();
    }
    let service =
        AppService::open(tmp.path(), adapter as Arc<dyn PlatformAdapter>).expect("reopen db");
    let settings = service.get_app_settings().unwrap();
    assert_eq!(settings.quick_switch_shortcut, "Alt+KeyK");
}

#[test]
fn app_settings_empty_shortcut_falls_back_to_default() {
    let env = setup();
    let settings = env.service.update_app_settings(Some("   ".into())).unwrap();
    assert_eq!(settings.quick_switch_shortcut, "Control+KeyO");
    let again = env.service.update_app_settings(Some(String::new())).unwrap();
    assert_eq!(again.quick_switch_shortcut, "Control+KeyO");
}

#[test]
fn app_settings_rejects_invalid_shortcuts() {
    let env = setup();
    for invalid in ["O", "Control+", "not-a-shortcut"] {
        let err = env
            .service
            .update_app_settings(Some(invalid.into()))
            .unwrap_err();
        assert_eq!(err.code, "Validation", "{invalid}");
    }
}

#[test]
fn app_settings_records_registration_failure() {
    let env = setup();
    env.service
        .record_shortcut_registration("conflict", Some("快捷键冲突：已被占用".into()))
        .unwrap();
    let settings = env.service.get_app_settings().unwrap();
    assert_eq!(settings.registration_status, "conflict");
    assert_eq!(settings.last_error.as_deref(), Some("快捷键冲突：已被占用"));

    env.service
        .record_shortcut_registration("denied", Some("系统拒绝注册该快捷键".into()))
        .unwrap();
    let denied = env.service.get_app_settings().unwrap();
    assert_eq!(denied.registration_status, "denied");
    assert_eq!(
        denied.last_error.as_deref(),
        Some("系统拒绝注册该快捷键")
    );
}

#[test]
fn same_app_can_bind_two_windows_and_close_one() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("多窗口", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe";
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.adapter
        .open_window("Inbox - Google Chrome", chrome_exe);

    let listed = env
        .service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    let running: Vec<_> = listed.iter().filter(|item| item.status == "running").collect();
    assert_eq!(running.len(), 2);
    assert!(listed.iter().any(|item| item.title.contains("Inbox")));
    let json = serde_json::to_string(&listed).unwrap();
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
    assert!(!json.contains("externalWindowId"));
    assert!(!json.contains("external_window_id"));
    assert!(json.contains("workspaceAppId"));

    env.adapter.close_window(&first_external);
    let after_close = env
        .service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    assert_eq!(
        after_close
            .iter()
            .filter(|item| item.status == "running")
            .count(),
        1
    );
    assert_eq!(
        after_close
            .iter()
            .filter(|item| item.status == "closed")
            .count(),
        1
    );

    let focused = env.service.focus_workspace_app(&launched.id).unwrap();
    assert_eq!(focused.status, "running");

    let closed = after_close
        .iter()
        .find(|item| item.status == "closed")
        .unwrap();
    let still_running = after_close
        .iter()
        .find(|item| item.status == "running")
        .unwrap();
    env.service
        .focus_native_window(&still_running.id)
        .unwrap();
    let err = env
        .service
        .focus_native_window(&closed.id)
        .unwrap_err();
    assert_eq!(err.code, "WindowClosed");

    let remaining = env
        .service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    assert_eq!(
        remaining
            .iter()
            .filter(|item| item.status == "running")
            .count(),
        1
    );
}

#[test]
fn default_focus_keeps_app_running_when_sibling_windows_remain() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("多窗口默认聚焦", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe";
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.adapter.open_window("Docs - Google Chrome", chrome_exe);
    env.adapter.open_window("Mail - Google Chrome", chrome_exe);
    env.service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    env.adapter.close_window(&first_external);

    let focused = env.service.focus_workspace_app(&launched.id).unwrap();
    assert_eq!(focused.status, "running");
    assert_ne!(focused.native_window_id.as_deref(), Some(first_external.as_str()));

    let listed = env
        .service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    assert!(listed.iter().any(|item| item.status == "running"));
}

#[test]
fn new_workspace_app_embed_enabled_defaults_false() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("预览默认关", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    assert!(!launched.embed_enabled);
    let listed = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(listed.len(), 1);
    assert!(!listed[0].embed_enabled);
    let json = serde_json::to_string(&listed).unwrap();
    assert!(json.contains("embedEnabled"));
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn set_workspace_app_embed_round_trips_in_list() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("预览开关", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();

    let enabled = env
        .service
        .set_workspace_app_embed(&launched.id, true)
        .unwrap();
    assert!(enabled.embed_enabled);
    assert!(
        env.service
            .list_workspace_apps(&workspace.id)
            .unwrap()
            .iter()
            .any(|app| app.id == launched.id && app.embed_enabled)
    );

    let disabled = env
        .service
        .set_workspace_app_embed(&launched.id, false)
        .unwrap();
    assert!(!disabled.embed_enabled);
    assert!(
        env.service
            .list_workspace_apps(&workspace.id)
            .unwrap()
            .iter()
            .any(|app| app.id == launched.id && !app.embed_enabled)
    );
}

#[test]
fn embed_without_switch_does_not_pretend_success() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("未开预览", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    assert!(!launched.embed_enabled);

    let result = env
        .service
        .embed_workspace_app_window(&launched.id, None, None, None)
        .unwrap();
    assert!(!result.embedded);
    assert!(result.fallback_focused);
    let reason = result.reason.clone().expect("readable reason");
    assert!(!reason.is_empty());
    assert!(!reason.contains("未打开在本窗口预览"));
    assert!(!reason.to_ascii_lowercase().contains("hwnd"));
    assert_eq!(result.workspace_app.status, "running");
    let json = serde_json::to_string(&result).unwrap();
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn same_app_embed_updates_bounds_without_dropping_session() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("同目标改尺寸", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .test_force_embed_session(&workspace.id, &launched.id)
        .unwrap();
    assert!(env.service.test_has_embed_session());

    let result = env
        .service
        .embed_workspace_app_window(
            &launched.id,
            Some(workspace_hub_lib::domain::HostBounds {
                x: 12,
                y: 24,
                width: 640,
                height: 480,
            }),
            None,
            None,
        )
        .unwrap();
    #[cfg(windows)]
    {
        assert!(result.embedded);
        assert!(!result.fallback_focused);
        assert!(result.reason.is_none());
        assert!(env.service.test_has_embed_session());
    }
    #[cfg(not(windows))]
    {
        assert!(!result.embedded);
        assert!(result.fallback_focused);
        assert!(result.reason.is_some());
        assert!(!env.service.test_has_embed_session());
    }
    let json = serde_json::to_string(&result).unwrap();
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn embed_mock_window_falls_back_to_focus() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("预览回退", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .set_workspace_app_embed(&launched.id, true)
        .unwrap();

    let result = env
        .service
        .embed_workspace_app_window(&launched.id, None, None, None)
        .unwrap();
    assert!(!result.embedded);
    assert!(result.fallback_focused);
    let reason = result.reason.clone().expect("readable reason");
    assert!(!reason.is_empty());
    assert!(!reason.to_ascii_lowercase().contains("hwnd"));
    assert_eq!(result.workspace_app.status, "running");
    let json = serde_json::to_string(&result).unwrap();
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn release_embedded_window_is_noop_and_keeps_window() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("退出预览", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .set_workspace_app_embed(&launched.id, true)
        .unwrap();
    let _ = env
        .service
        .embed_workspace_app_window(&launched.id, None, None, None)
        .unwrap();

    let first = env.service.release_embedded_window().unwrap();
    assert!(!first.released);
    let again = env.service.release_embedded_window().unwrap();
    assert!(!again.released);
    let listed = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(listed[0].status, "running");
    let json = serde_json::to_string(&again).unwrap();
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
    assert!(json.contains("released"));
}

#[test]
fn release_embedded_window_ignores_non_matching_app() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("定向释放", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .test_force_embed_session(&workspace.id, &launched.id)
        .unwrap();

    let skipped = env
        .service
        .release_embedded_window_for(Some("wa-other"))
        .unwrap();
    assert!(!skipped.released);
    assert!(env.service.test_has_embed_session());

    let matched = env
        .service
        .release_embedded_window_for(Some(&launched.id))
        .unwrap();
    assert!(matched.released);
    assert!(!env.service.test_has_embed_session());

    env.service
        .test_force_embed_session(&workspace.id, &launched.id)
        .unwrap();
    let unscoped = env.service.release_embedded_window().unwrap();
    assert!(unscoped.released);
    assert!(!env.service.test_has_embed_session());
}

#[test]
fn stale_embed_seq_does_not_release_newer_session() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("过期预览", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let first = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let second = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    env.service
        .test_force_embed_session_seq(&workspace.id, &second.id, 2)
        .unwrap();

    let result = env
        .service
        .embed_workspace_app_window(&first.id, None, None, Some(1))
        .unwrap();
    assert!(!result.embedded);
    assert!(!result.fallback_focused);
    assert!(result.reason.is_none());
    assert!(env.service.test_has_embed_session());
}

#[test]
fn released_embed_seq_ignores_stale_bounds_reparent() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("释放后过期预览", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .test_force_embed_session_seq(&workspace.id, &launched.id, 5)
        .unwrap();
    assert!(env.service.test_has_embed_session());

    let released = env.service.release_embedded_window().unwrap();
    assert!(released.released);
    assert!(!env.service.test_has_embed_session());

    let stale = env
        .service
        .embed_workspace_app_window(&launched.id, None, None, Some(5))
        .unwrap();
    assert!(!stale.embedded);
    assert!(!stale.fallback_focused);
    assert!(stale.reason.is_none());
    assert!(!env.service.test_has_embed_session());
    assert!(env
        .service
        .test_should_ignore_stale_embed(&launched.id, Some(5))
        .unwrap());
    assert!(!env
        .service
        .test_should_ignore_stale_embed(&launched.id, Some(6))
        .unwrap());
    assert!(!env
        .service
        .test_should_ignore_stale_embed(&launched.id, None)
        .unwrap());

    let fresh = env
        .service
        .embed_workspace_app_window(&launched.id, None, None, Some(6))
        .unwrap();
    // Mock cannot reparent, but a higher seq must not take the stale-ignore path.
    assert!(fresh.embedded || fresh.fallback_focused);
    assert!(!env
        .service
        .test_should_ignore_stale_embed(&launched.id, Some(6))
        .unwrap()
        || env.service.test_has_embed_session());
}

#[test]
fn failed_second_embed_releases_existing_session() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("二次预览", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let first = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let second = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    env.service
        .test_force_embed_session(&workspace.id, &first.id)
        .unwrap();
    assert!(env.service.test_has_embed_session());

    env.service
        .set_workspace_app_embed(&second.id, true)
        .unwrap();
    let result = env
        .service
        .embed_workspace_app_window(&second.id, None, None, None)
        .unwrap();
    assert!(!result.embedded);
    assert!(result.fallback_focused);
    assert!(!env.service.test_has_embed_session());
}

#[test]
fn switching_or_deleting_workspace_releases_embed_session() {
    let env = setup();
    let a = env
        .service
        .create_workspace("预览工作区 A", None, None, None)
        .unwrap();
    let b = env
        .service
        .create_workspace("预览工作区 B", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&a.id, &notepad.id)
        .unwrap();
    env.service
        .test_force_embed_session(&a.id, &launched.id)
        .unwrap();

    env.service.set_active_workspace(&b.id).unwrap();
    assert!(!env.service.test_has_embed_session());

    env.service
        .test_force_embed_session(&a.id, &launched.id)
        .unwrap();
    env.service.delete_workspace(&a.id).unwrap();
    assert!(!env.service.test_has_embed_session());
}

#[test]
fn remove_workspace_app_clears_embed_flag() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("移出清开关", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .set_workspace_app_embed(&launched.id, true)
        .unwrap();
    env.service.remove_workspace_app(&launched.id).unwrap();
    let rebound = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    assert!(!rebound.embed_enabled);
}

#[test]
fn bound_window_gone_marks_last_window_closed_without_listing() {
    let env = setup();
    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    let workspace = env
        .service
        .create_workspace("存活-最后一扇", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.adapter.close_window(&first_external);

    let changed = env
        .service
        .handle_bound_window_gone(&first_external)
        .unwrap();
    assert!(changed);

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps.len(), 1);
    assert_eq!(apps[0].id, launched.id);
    assert_eq!(apps[0].status, "closed");

    let events = sink.events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].workspace_id, workspace.id);
    assert_eq!(events[0].workspace_app_id.as_deref(), Some(launched.id.as_str()));
    assert_eq!(events[0].preview_released, None);
    assert_eq!(events[0].preview_seq, None);
    let json = serde_json::to_string(&events[0]).unwrap();
    assert!(json.contains("workspaceId"));
    assert!(!json.contains("previewSeq"));
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
    assert!(!json.contains("externalWindowId"));
    assert!(!json.contains("external_window_id"));
    assert!(!json.contains("EVENT_OBJECT"));
}

#[test]
fn bound_window_gone_keeps_sibling_running() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-兄弟窗口", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe";
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.adapter.open_window("Inbox - Google Chrome", chrome_exe);
    env.service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    env.adapter.close_window(&first_external);

    let changed = env
        .service
        .handle_bound_window_gone(&first_external)
        .unwrap();
    assert!(changed);

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps.len(), 1);
    assert_eq!(apps[0].status, "running");

    let windows = env
        .service
        .list_workspace_app_windows(&launched.id)
        .unwrap();
    assert_eq!(
        windows.iter().filter(|item| item.status == "running").count(),
        1
    );
    assert_eq!(
        windows.iter().filter(|item| item.status == "closed").count(),
        1
    );
}

#[test]
fn bound_window_gone_ignores_unbound_id() {
    let env = setup();
    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    let workspace = env
        .service
        .create_workspace("存活-未绑定", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();

    let changed = env
        .service
        .handle_bound_window_gone("mock:not-bound")
        .unwrap();
    assert!(!changed);
    assert!(sink.events().is_empty());
    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps[0].id, launched.id);
    assert_eq!(apps[0].status, "running");
}

#[test]
fn process_exit_closes_all_running_windows_for_pid() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-进程退出", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe";
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    let pid = env.adapter.window_process_id(&first_external).expect("pid");
    env.adapter
        .open_window_with_pid("Docs - Google Chrome", chrome_exe, pid);
    env.service
        .list_workspace_app_windows(&launched.id)
        .unwrap();

    let changed = env.service.handle_process_exited(pid).unwrap();
    assert!(changed);

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps[0].status, "closed");
    assert_eq!(apps.len(), 1);
}

#[test]
fn watchdog_reconciles_closed_window_on_active_workspace_only() {
    let env = setup();
    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    let active = env
        .service
        .create_workspace("存活-看门狗-当前", None, None, None)
        .unwrap();
    let other = env
        .service
        .create_workspace("存活-看门狗-其他", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();

    env.service.set_active_workspace(&other.id).unwrap();
    let other_app = env
        .service
        .launch_workspace_app(&other.id, &chrome.id)
        .unwrap();
    let other_external = other_app.native_window_id.clone().expect("mock window");

    env.service.set_active_workspace(&active.id).unwrap();
    let active_app = env
        .service
        .launch_workspace_app(&active.id, &notepad.id)
        .unwrap();
    let active_external = active_app.native_window_id.clone().expect("mock window");

    env.adapter.close_window(&active_external);
    env.adapter.close_window(&other_external);

    let changed = env
        .service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert!(changed);
    let active_apps = env.service.list_workspace_apps(&active.id).unwrap();
    assert_eq!(active_apps[0].status, "closed");
    let other_apps = env.service.list_workspace_apps(&other.id).unwrap();
    assert_eq!(other_apps[0].status, "running");

    let unchanged = env
        .service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert!(!unchanged);
}

#[test]
fn watchdog_lists_desktop_once_per_tick() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-看门狗-一次枚举", None, None, None)
        .unwrap();
    env.service.set_active_workspace(&workspace.id).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let chrome = env
        .service
        .search_installed_apps("chrome", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    env.service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    env.service
        .launch_workspace_app(&workspace.id, &chrome.id)
        .unwrap();

    let before = env.adapter.list_windows_call_count();
    env.service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert_eq!(env.adapter.list_windows_call_count() - before, 1);
}

#[test]
fn gone_embedded_window_releases_embed_session() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-预览释放", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.service
        .test_force_embed_session_for_window(&workspace.id, &launched.id, &first_external)
        .unwrap();
    assert!(env.service.test_has_embed_session());
    env.adapter.close_window(&first_external);

    env.service
        .handle_bound_window_gone(&first_external)
        .unwrap();
    assert!(!env.service.test_has_embed_session());
}

#[test]
fn release_embed_if_opaque_matches_ignores_replaced_session() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-旧句柄不拆新预览", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let old_opaque = launched.native_window_id.clone().expect("mock window");

    env.service
        .test_force_embed_session_for_window(&workspace.id, &launched.id, &old_opaque)
        .unwrap();
    env.service
        .test_force_embed_session_seq(&workspace.id, &launched.id, 2)
        .unwrap();
    assert!(env.service.test_has_embed_session());
    assert_eq!(env.service.test_embed_session_preview_seq(), Some(2));

    let (released, preview_seq) = env.service.test_release_embed_if_opaque_matches(&old_opaque);
    assert!(!released);
    assert!(preview_seq.is_none());
    assert!(env.service.test_has_embed_session());
    assert_eq!(env.service.test_embed_session_preview_seq(), Some(2));

    let (released, preview_seq) = env
        .service
        .test_release_embed_if_opaque_matches("mock:embed-session");
    assert!(released);
    assert_eq!(preview_seq, Some(2));
    assert!(!env.service.test_has_embed_session());
}

#[test]
fn gone_embedded_window_emits_preview_released() {
    let env = setup();
    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    let workspace = env
        .service
        .create_workspace("存活-预览释放事件", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.service
        .test_force_embed_session_for_window(&workspace.id, &launched.id, &first_external)
        .unwrap();

    env.service
        .handle_bound_window_gone(&first_external)
        .unwrap();

    let events = sink.events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].preview_released, Some(true));
    assert_eq!(events[0].preview_seq, Some(1));
    let json = serde_json::to_string(&events[0]).unwrap();
    assert!(json.contains("previewReleased"));
    assert!(json.contains("previewSeq"));
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn watchdog_does_not_close_embedded_window_missing_from_enum() {
    let env = setup();
    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    let workspace = env
        .service
        .create_workspace("存活-预览不假关", None, None, None)
        .unwrap();
    env.service.set_active_workspace(&workspace.id).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.service
        .test_force_embed_session_for_window(&workspace.id, &launched.id, &first_external)
        .unwrap();
    env.adapter.omit_from_enum(&first_external);

    let changed = env
        .service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert!(!changed);
    assert!(env.service.test_has_embed_session());

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps[0].status, "running");
    assert!(sink.events().is_empty());
}

#[test]
fn watchdog_closes_embedded_window_when_iswindow_false() {
    let env = setup();
    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    let workspace = env
        .service
        .create_workspace("存活-预览已关", None, None, None)
        .unwrap();
    env.service.set_active_workspace(&workspace.id).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.service
        .test_force_embed_session_for_window(&workspace.id, &launched.id, &first_external)
        .unwrap();
    env.adapter.close_window(&first_external);
    assert!(!env.adapter.window_is_open(&first_external));

    let changed = env
        .service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert!(changed);
    assert!(!env.service.test_has_embed_session());

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps[0].status, "closed");
    let events = sink.events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].preview_released, Some(true));
    assert_eq!(events[0].preview_seq, Some(1));
    let json = serde_json::to_string(&events[0]).unwrap();
    assert!(json.contains("previewReleased"));
    assert!(json.contains("previewSeq"));
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn watchdog_releases_leftover_embed_when_row_already_closed() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-预览残留会话", None, None, None)
        .unwrap();
    env.service.set_active_workspace(&workspace.id).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.adapter.close_window(&first_external);
    env.service
        .handle_bound_window_gone(&first_external)
        .unwrap();
    assert!(!env.adapter.window_is_open(&first_external));

    let sink = std::sync::Arc::new(workspace_hub_lib::CapturingWindowChangeSink::new());
    env.service.set_window_change_sink(sink.clone());
    env.service
        .test_force_embed_session_for_window(&workspace.id, &launched.id, &first_external)
        .unwrap();
    assert!(env.service.test_has_embed_session());

    let changed = env
        .service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert!(changed);
    assert!(!env.service.test_has_embed_session());

    let events = sink.events();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].workspace_id, workspace.id);
    assert_eq!(events[0].workspace_app_id.as_deref(), Some(launched.id.as_str()));
    assert_eq!(events[0].preview_released, Some(true));
    assert_eq!(events[0].preview_seq, Some(1));
    let json = serde_json::to_string(&events[0]).unwrap();
    assert!(json.contains("previewReleased"));
    assert!(json.contains("previewSeq"));
    assert!(!json.to_ascii_lowercase().contains("hwnd"));
}

#[test]
fn watchdog_recovers_window_closed_after_window_returns() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-看门狗-恢复", None, None, None)
        .unwrap();
    env.service.set_active_workspace(&workspace.id).unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    env.adapter.close_window(&first_external);
    env.service
        .handle_bound_window_gone(&first_external)
        .unwrap();
    let closed = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(closed[0].status, "closed");

    env.adapter
        .open_window("Notepad", r"C:\Windows\System32\notepad.exe");
    let recovered = env
        .service
        .watchdog_reconcile_active_workspace()
        .unwrap();
    assert!(recovered);
    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps[0].status, "running");
}

#[test]
fn stale_enum_does_not_resurrect_closed_window() {
    let env = setup();
    let workspace = env
        .service
        .create_workspace("存活-陈旧枚举", None, None, None)
        .unwrap();
    env.service.refresh_installed_apps().unwrap();
    let notepad = env
        .service
        .search_installed_apps("notepad", None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    let launched = env
        .service
        .launch_workspace_app(&workspace.id, &notepad.id)
        .unwrap();
    let first_external = launched.native_window_id.clone().expect("mock window");
    let stale = env
        .adapter
        .list_windows(&ListWindowsRequest::default())
        .unwrap();
    assert!(stale
        .iter()
        .any(|window| window.native_window_id == first_external));

    env.adapter.close_window(&first_external);
    env.service
        .handle_bound_window_gone(&first_external)
        .unwrap();

    env.service
        .test_sync_workspace_app_windows_from_desktop(&launched.id, &stale)
        .unwrap();

    let apps = env.service.list_workspace_apps(&workspace.id).unwrap();
    assert_eq!(apps[0].status, "closed");
}

fn base64_png() -> String {
    // 1x1 transparent PNG
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2n2ZcAAAAASUVORK5CYII=".to_string()
}
