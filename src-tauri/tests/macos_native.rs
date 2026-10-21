//! macOS desktop integration tests.
//!
//! Default `cargo test` skips these. Set `MACOS_NATIVE_TESTS=1` to scan
//! `/Applications`, launch a real `.app`, or focus a real window.

#![cfg(target_os = "macos")]

use std::path::Path;

use workspace_hub_lib::platform::{
    FocusWindowRequest, LaunchAppRequest, ListWindowsRequest, PlatformAdapter,
    ResolveManualAppTargetRequest, ScanInstalledAppsRequest,
};
use workspace_hub_lib::MacOsPlatformAdapter;

fn native_enabled() -> bool {
    std::env::var("MACOS_NATIVE_TESTS")
        .map(|value| value == "1")
        .unwrap_or(false)
}

fn first_existing<'a>(paths: &[&'a str]) -> Option<&'a str> {
    paths
        .iter()
        .copied()
        .find(|path| Path::new(path).is_dir())
}

#[test]
fn native_scan_launch_and_focus() {
    if !native_enabled() {
        return;
    }

    let adapter = MacOsPlatformAdapter::new();
    let scanned = adapter
        .scan_installed_apps(&ScanInstalledAppsRequest { force_refresh: true })
        .expect("applications scan");
    assert!(
        scanned
            .scanned_sources
            .iter()
            .any(|source| source == "common_path"),
        "scan should record a common applications source"
    );
    assert!(
        !scanned.apps.is_empty(),
        "/Applications or /System/Applications should yield at least one .app"
    );
    assert!(
        scanned.apps.iter().all(|app| app.platform == "macos"),
        "scanned apps must be tagged macos"
    );
    assert!(
        scanned.apps.iter().any(|app| {
            let name = app.display_name.to_lowercase();
            let target = app.launch_target.to_lowercase();
            name.contains("safari")
                || name.contains("textedit")
                || name.contains("mail")
                || name.contains("preview")
                || target.contains("safari.app")
                || target.contains("textedit.app")
        }),
        "scan should include a common .app such as Safari or TextEdit"
    );

    let windows = adapter
        .list_windows(&ListWindowsRequest::default())
        .expect("list windows");
    for window in &windows {
        assert!(
            window.native_window_id.starts_with("macwin:"),
            "nativeWindowId must be opaque"
        );
        let lower = window.native_window_id.to_ascii_lowercase();
        assert!(!lower.contains("axuielement"));
        assert!(!lower.contains("cgwindow"));
    }

    let text_edit = first_existing(&[
        "/System/Applications/TextEdit.app",
        "/Applications/TextEdit.app",
    ]);
    let Some(text_edit) = text_edit else {
        return;
    };

    let launched = adapter
        .launch_app(&LaunchAppRequest {
            launch_target: text_edit.into(),
            display_name: "TextEdit".into(),
            installed_app_id: None,
            workspace_id: None,
            launch_args: None,
        })
        .expect("launch TextEdit");
    assert!(
        launched.process_id.is_some() || launched.native_window_id.is_some(),
        "a successful launch may omit a window, but should still report a process when possible"
    );

    if let Some(native_window_id) = launched.native_window_id.clone() {
        match adapter.focus_window(&FocusWindowRequest {
            native_window_id: native_window_id.clone(),
        }) {
            Ok(focused) => assert!(focused.focused),
            Err(err) => {
                assert_eq!(err.code.as_str(), "FocusDenied");
                assert!(
                    err.message.contains("辅助功能") || err.message.contains("系统设置"),
                    "denied focus must explain system settings: {}",
                    err.message
                );
            }
        }
    }

    let closed = adapter
        .focus_window(&FocusWindowRequest {
            native_window_id: "macwin:1-1".into(),
        })
        .unwrap_err();
    assert_eq!(closed.code.as_str(), "WindowClosed");
}

#[test]
fn native_manual_resolve_system_app() {
    if !native_enabled() {
        return;
    }
    let adapter = MacOsPlatformAdapter::new();
    let text_edit = first_existing(&[
        "/System/Applications/TextEdit.app",
        "/Applications/TextEdit.app",
    ]);
    let Some(text_edit) = text_edit else {
        return;
    };
    let resolved = adapter
        .resolve_manual_app_target(&ResolveManualAppTargetRequest {
            path: text_edit.into(),
        })
        .expect("resolve TextEdit");
    assert_eq!(resolved.app_type, "native_app");
    assert_eq!(resolved.source, "manual");
    assert_eq!(resolved.platform, "macos");
}

#[test]
fn native_focus_without_permission_is_denied() {
    if !native_enabled() {
        return;
    }

    let adapter = MacOsPlatformAdapter::new();
    let windows = adapter
        .list_windows(&ListWindowsRequest::default())
        .expect("list windows");
    let Some(target) = windows.into_iter().next() else {
        return;
    };

    match adapter.focus_window(&FocusWindowRequest {
        native_window_id: target.native_window_id,
    }) {
        Ok(focused) => assert!(focused.focused || focused.restored),
        Err(err) => {
            assert_eq!(err.code.as_str(), "FocusDenied");
            assert!(
                err.message.contains("辅助功能") || err.message.contains("系统设置"),
                "{}",
                err.message
            );
        }
    }
}

// Runs only when explicitly requested. The helper owns its window, so this
// exercises minimize/restore/close without manipulating any user application.
#[test]
fn native_minimized_and_untitled_windows_stay_alive_until_closed() {
    if !native_enabled() {
        return;
    }
    use std::io::{BufRead, BufReader, Write};
    use std::process::{Child, Command, Stdio};
    struct Fixture(Child);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let temp = tempfile::tempdir().unwrap();
    let binary = temp.path().join("window-fixture");
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/macos_window.m");
    let compiled = Command::new("clang")
        .args(["-fobjc-arc", "-framework", "Cocoa"])
        .arg(source).arg("-o").arg(&binary).status().unwrap();
    assert!(compiled.success());
    let mut fixture = Fixture(Command::new(binary)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).spawn().unwrap());
    let mut output = BufReader::new(fixture.0.stdout.take().unwrap());
    let mut line = String::new();
    output.read_line(&mut line).unwrap();
    let ids: Vec<u32> = line.split_whitespace().map(|part| part.parse().unwrap()).collect();
    assert_eq!(ids.len(), 2);
    let id = workspace_hub_lib::platform::macos::encode_macos_window_id(ids[0], ids[1]);
    let adapter = MacOsPlatformAdapter::new();
    let exists = || adapter.list_windows(&ListWindowsRequest::default()).unwrap()
        .iter().any(|window| window.native_window_id == id);
    assert!(exists(), "the visible fixture must be discovered");
    for action in ["minimize", "untitle", "restore"] {
        writeln!(fixture.0.stdin.as_mut().unwrap(), "{action}").unwrap();
        line.clear();
        output.read_line(&mut line).unwrap();
        assert_eq!(line.trim(), "done");
        assert!(exists(), "window identity disappeared after {action}");
    }
    writeln!(fixture.0.stdin.as_mut().unwrap(), "close").unwrap();
    line.clear();
    output.read_line(&mut line).unwrap();
    assert_eq!(line.trim(), "done");
    assert!(!exists(), "a closed window must disappear even while its process lives");
}
