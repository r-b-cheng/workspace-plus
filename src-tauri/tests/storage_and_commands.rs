use std::sync::Arc;

use tempfile::TempDir;
use workspace_hub_lib::domain::CanvasNodeInput;
use workspace_hub_lib::platform::{FocusWindowRequest, PlatformAdapter};
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
}

fn base64_png() -> String {
    // 1x1 transparent PNG
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2n2ZcAAAAASUVORK5CYII=".to_string()
}
