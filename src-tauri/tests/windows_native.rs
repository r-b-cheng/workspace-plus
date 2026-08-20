//! Windows desktop integration tests.
//!
//! Default `cargo test` skips these. Set `WINDOWS_NATIVE_TESTS=1` to scan the
//! start menu, launch a real app, or focus a real window.

#![cfg(windows)]

use std::path::Path;
use std::thread;
use std::time::Duration;

use workspace_hub_lib::platform::{
    FocusWindowRequest, LaunchAppRequest, ListWindowsRequest, PlatformAdapter,
    ResolveManualAppTargetRequest, ScanInstalledAppsRequest,
};
use workspace_hub_lib::WindowsPlatformAdapter;

fn native_enabled() -> bool {
    std::env::var("WINDOWS_NATIVE_TESTS")
        .map(|value| value == "1")
        .unwrap_or(false)
}

#[test]
fn native_scan_launch_and_focus() {
    if !native_enabled() {
        return;
    }

    let adapter = WindowsPlatformAdapter::new();
    let scanned = adapter
        .scan_installed_apps(&ScanInstalledAppsRequest { force_refresh: true })
        .expect("start menu scan");
    assert!(
        scanned.scanned_sources.iter().any(|source| source == "start_menu"),
        "scan should record the start menu source"
    );
    assert!(
        !scanned.apps.is_empty(),
        "current user or public start menu should yield at least one .lnk"
    );

    let keys: Vec<String> = scanned
        .apps
        .iter()
        .map(|app| {
            format!(
                "{}|{}",
                app.executable_path
                    .as_deref()
                    .unwrap_or(&app.launch_target)
                    .to_ascii_lowercase(),
                app.launch_args.clone().unwrap_or_default()
            )
        })
        .collect();
    let unique = keys.iter().collect::<std::collections::HashSet<_>>();
    assert_eq!(keys.len(), unique.len(), "same launch target must not repeat");

    let has_common = scanned.apps.iter().any(|app| {
        let exe = app
            .executable_path
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase();
        let name = app.display_name.to_lowercase();
        exe.ends_with("notepad.exe")
            || exe.ends_with("chrome.exe")
            || exe.ends_with("msedge.exe")
            || exe.ends_with("firefox.exe")
            || name.contains("notepad")
            || name.contains("记事本")
            || name.contains("edge")
            || name.contains("chrome")
    });
    assert!(has_common, "scan should include a common app such as Notepad or a browser");

    let windows = adapter
        .list_windows(&ListWindowsRequest::default())
        .expect("list windows");
    for window in &windows {
        assert!(
            window.native_window_id.starts_with("win:"),
            "nativeWindowId must be opaque"
        );
        assert!(!window.native_window_id.to_ascii_lowercase().contains("hwnd"));
    }

    let notepad = r"C:\Windows\System32\notepad.exe";
    if !Path::new(notepad).is_file() {
        return;
    }

    let launched = adapter
        .launch_app(&LaunchAppRequest {
            launch_target: notepad.into(),
            display_name: "Notepad".into(),
            installed_app_id: None,
            workspace_id: None,
        })
        .expect("launch notepad");
    assert!(
        launched.process_id.is_some() || launched.native_window_id.is_some(),
        "a successful launch may omit a window, but should still report a process when possible"
    );

    if let Some(native_window_id) = launched.native_window_id.clone() {
        let focused = adapter
            .focus_window(&FocusWindowRequest {
                native_window_id: native_window_id.clone(),
            })
            .expect("focus notepad");
        assert!(focused.focused);
        adapter.request_close_window(&native_window_id);
        thread::sleep(Duration::from_millis(200));
    }

    let closed = adapter
        .focus_window(&FocusWindowRequest {
            native_window_id: "win:1".into(),
        })
        .unwrap_err();
    assert_eq!(closed.code.as_str(), "WindowClosed");
}

#[test]
fn native_manual_resolve_system_exe() {
    if !native_enabled() {
        return;
    }
    let adapter = WindowsPlatformAdapter::new();
    let notepad = r"C:\Windows\System32\notepad.exe";
    if !Path::new(notepad).is_file() {
        return;
    }
    let resolved = adapter
        .resolve_manual_app_target(&ResolveManualAppTargetRequest {
            path: notepad.into(),
        })
        .expect("resolve notepad");
    assert_eq!(resolved.app_type, "native_app");
    assert_eq!(resolved.source, "manual");
}
