//! In-memory adapter used before the real Windows implementation lands.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;

use crate::platform::{
    FocusWindowRequest, FocusWindowResult, LaunchAppRequest, LaunchResult, ListWindowsRequest,
    PlatformAdapter, PlatformError, PlatformWindow, ResolveManualAppTargetRequest,
    ResolvedManualAppTarget, ScanInstalledAppsRequest, ScanInstalledAppsResult, ScannedApp,
};
use crate::storage::{new_id, now_utc};

#[derive(Clone, Debug)]
struct MockWindow {
    title: String,
    process_id: u32,
    process_path: Option<String>,
    closed: bool,
    hidden_from_enum: bool,
}

/// Fixed-catalog mock that records launched windows in memory.
pub struct MockPlatformAdapter {
    windows: Mutex<HashMap<String, MockWindow>>,
    next_pid: AtomicU32,
    omit_window_on_next_launch: AtomicBool,
    list_windows_calls: AtomicU32,
}

impl MockPlatformAdapter {
    pub fn new() -> Self {
        Self {
            windows: Mutex::new(HashMap::new()),
            next_pid: AtomicU32::new(10_000),
            omit_window_on_next_launch: AtomicBool::new(false),
            list_windows_calls: AtomicU32::new(0),
        }
    }

    /// Next launch reports success but does not create or bind a window.
    pub fn omit_next_launch_window(&self) {
        self.omit_window_on_next_launch.store(true, Ordering::Relaxed);
    }

    /// Marks a previously launched mock window as closed.
    pub fn close_window(&self, native_window_id: &str) {
        if let Ok(mut windows) = self.windows.lock() {
            if let Some(window) = windows.get_mut(native_window_id) {
                window.closed = true;
            }
        }
    }

    /// Hides a still-open window from `list_windows`, like a SetParented child.
    pub fn omit_from_enum(&self, native_window_id: &str) {
        if let Ok(mut windows) = self.windows.lock() {
            if let Some(window) = windows.get_mut(native_window_id) {
                window.hidden_from_enum = true;
            }
        }
    }

    pub fn list_windows_call_count(&self) -> u32 {
        self.list_windows_calls.load(Ordering::Relaxed)
    }

    /// Opens a synthetic window without going through launch. Used to test rediscovery.
    pub fn open_window(&self, title: &str, process_path: &str) -> String {
        let process_id = self.next_pid.fetch_add(1, Ordering::Relaxed);
        self.open_window_with_pid(title, process_path, process_id)
    }

    /// Opens a synthetic window with a chosen pid so process-exit tests can share one process.
    pub fn open_window_with_pid(&self, title: &str, process_path: &str, process_id: u32) -> String {
        let native_window_id = format!("mock:{}", new_id());
        if let Ok(mut windows) = self.windows.lock() {
            windows.insert(
                native_window_id.clone(),
                MockWindow {
                    title: title.to_string(),
                    process_id,
                    process_path: Some(process_path.to_string()),
                    closed: false,
                    hidden_from_enum: false,
                },
            );
        }
        native_window_id
    }

    pub fn window_process_id(&self, native_window_id: &str) -> Option<u32> {
        self.windows
            .lock()
            .ok()?
            .get(native_window_id)
            .map(|window| window.process_id)
    }

    fn catalog() -> Vec<ScannedApp> {
        const APPS: &[(&str, &str, &str, &str)] = &[
            (
                "chrome",
                "Google Chrome",
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                "native_app",
            ),
            (
                "edge",
                "Microsoft Edge",
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                "native_app",
            ),
            (
                "firefox",
                "Mozilla Firefox",
                r"C:\Program Files\Mozilla Firefox\firefox.exe",
                "native_app",
            ),
            (
                "vscode",
                "Visual Studio Code",
                r"C:\Users\mock\AppData\Local\Programs\Microsoft VS Code\Code.exe",
                "native_app",
            ),
            (
                "terminal",
                "Windows Terminal",
                r"C:\Program Files\WindowsApps\Microsoft.WindowsTerminal\wt.exe",
                "native_app",
            ),
            (
                "notepad",
                "Notepad",
                r"C:\Windows\System32\notepad.exe",
                "native_app",
            ),
            (
                "explorer",
                "File Explorer",
                r"C:\Windows\explorer.exe",
                "native_app",
            ),
            (
                "slack",
                "Slack",
                r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Slack.lnk",
                "shortcut",
            ),
            (
                "notion",
                "Notion",
                r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Notion.lnk",
                "shortcut",
            ),
            (
                "spotify",
                "Spotify",
                r"C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Spotify.lnk",
                "shortcut",
            ),
        ];

        APPS.iter()
            .map(|(id, name, path, app_type)| ScannedApp {
                display_name: (*name).to_string(),
                normalized_name: name.to_lowercase(),
                app_type: (*app_type).to_string(),
                platform: "windows".to_string(),
                source: if *app_type == "shortcut" {
                    "start_menu".to_string()
                } else {
                    "common_path".to_string()
                },
                launch_target: (*path).to_string(),
                launch_args: None,
                working_dir: None,
                publisher: None,
                version: None,
                install_location: Path::new(path)
                    .parent()
                    .map(|parent| parent.to_string_lossy().into_owned()),
                executable_path: Some((*path).to_string()),
                scan_fingerprint: format!("mock:{id}"),
            })
            .collect()
    }
}

impl Default for MockPlatformAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl PlatformAdapter for MockPlatformAdapter {
    fn scan_installed_apps(
        &self,
        _request: &ScanInstalledAppsRequest,
    ) -> Result<ScanInstalledAppsResult, PlatformError> {
        let started_at = now_utc();
        let apps = Self::catalog();
        Ok(ScanInstalledAppsResult {
            apps,
            scanned_sources: vec!["mock".to_string()],
            started_at,
            finished_at: now_utc(),
        })
    }

    fn launch_app(&self, request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError> {
        let process_id = self.next_pid.fetch_add(1, Ordering::Relaxed);
        let title = request.display_name.clone();
        if self.omit_window_on_next_launch.swap(false, Ordering::Relaxed) {
            return Ok(LaunchResult {
                process_id: Some(process_id),
                native_window_id: None,
                title: None,
                process_path: Some(request.launch_target.clone()),
            });
        }
        let native_window_id = format!("mock:{}", new_id());
        let mut windows = self
            .windows
            .lock()
            .map_err(|_| PlatformError::new(crate::platform::PlatformErrorCode::Internal, "lock"))?;
        windows.insert(
            native_window_id.clone(),
            MockWindow {
                title: title.clone(),
                process_id,
                process_path: Some(request.launch_target.clone()),
                closed: false,
                hidden_from_enum: false,
            },
        );
        Ok(LaunchResult {
            process_id: Some(process_id),
            native_window_id: Some(native_window_id),
            title: Some(title),
            process_path: Some(request.launch_target.clone()),
        })
    }

    fn list_windows(
        &self,
        _request: &ListWindowsRequest,
    ) -> Result<Vec<PlatformWindow>, PlatformError> {
        self.list_windows_calls.fetch_add(1, Ordering::Relaxed);
        let windows = self
            .windows
            .lock()
            .map_err(|_| PlatformError::new(crate::platform::PlatformErrorCode::Internal, "lock"))?;
        Ok(windows
            .iter()
            .filter(|(_, window)| !window.closed && !window.hidden_from_enum)
            .map(|(id, window)| PlatformWindow {
                native_window_id: id.clone(),
                process_id: Some(window.process_id),
                title: window.title.clone(),
                process_path: window.process_path.clone(),
            })
            .collect())
    }

    fn window_is_open(&self, native_window_id: &str) -> bool {
        self.windows
            .lock()
            .ok()
            .and_then(|windows| windows.get(native_window_id).map(|window| !window.closed))
            .unwrap_or(false)
    }

    fn focus_window(&self, request: &FocusWindowRequest) -> Result<FocusWindowResult, PlatformError> {
        let windows = self
            .windows
            .lock()
            .map_err(|_| PlatformError::new(crate::platform::PlatformErrorCode::Internal, "lock"))?;
        match windows.get(&request.native_window_id) {
            Some(window) if !window.closed => Ok(FocusWindowResult {
                focused: true,
                restored: true,
            }),
            Some(_) | None => Err(PlatformError::window_closed(
                "window is closed or no longer valid",
            )),
        }
    }

    fn resolve_manual_app_target(
        &self,
        request: &ResolveManualAppTargetRequest,
    ) -> Result<ResolvedManualAppTarget, PlatformError> {
        let trimmed = request.path.trim().trim_matches('"');
        if trimmed.is_empty() {
            return Err(PlatformError::invalid_target("path is required"));
        }

        let ext = Path::new(trimmed)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext != "exe" && ext != "lnk" {
            return Err(PlatformError::invalid_target(
                "manual target must be an .exe or .lnk path",
            ));
        }

        let display_name = Path::new(trimmed)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or(trimmed)
            .to_string();
        let normalized = normalize_windows_path(trimmed);
        let app_type = if ext == "lnk" {
            "shortcut"
        } else {
            "native_app"
        };

        Ok(ResolvedManualAppTarget {
            display_name,
            app_type: app_type.to_string(),
            source: "manual".to_string(),
            launch_target: trimmed.to_string(),
            executable_path: Some(trimmed.to_string()),
            scan_fingerprint: format!("manual:{normalized}"),
            platform: "windows".to_string(),
        })
    }
}

fn normalize_windows_path(path: &str) -> String {
    path.trim().trim_matches('"').replace('/', "\\").to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_exe_lnk_targets() {
        let adapter = MockPlatformAdapter::new();
        let err = adapter
            .resolve_manual_app_target(&ResolveManualAppTargetRequest {
                path: r"C:\notes.txt".into(),
            })
            .unwrap_err();
        assert_eq!(err.code.as_str(), "InvalidTarget");
    }

    #[test]
    fn accepts_exe_and_lnk() {
        let adapter = MockPlatformAdapter::new();
        let exe = adapter
            .resolve_manual_app_target(&ResolveManualAppTargetRequest {
                path: r"C:\Tools\app.EXE".into(),
            })
            .unwrap();
        assert_eq!(exe.app_type, "native_app");
        let lnk = adapter
            .resolve_manual_app_target(&ResolveManualAppTargetRequest {
                path: r"C:\Tools\app.lnk".into(),
            })
            .unwrap();
        assert_eq!(lnk.app_type, "shortcut");
    }

    #[test]
    fn window_is_open_follows_mock_list() {
        let adapter = MockPlatformAdapter::new();
        let id = adapter.open_window("Notepad", r"C:\Windows\System32\notepad.exe");
        assert!(adapter.window_is_open(&id));
        adapter.omit_from_enum(&id);
        assert!(adapter.window_is_open(&id));
        adapter.close_window(&id);
        assert!(!adapter.window_is_open(&id));
        assert!(!adapter.window_is_open("mock:missing"));
    }

    #[test]
    fn focus_unknown_window_is_closed() {
        let adapter = MockPlatformAdapter::new();
        let err = adapter
            .focus_window(&FocusWindowRequest {
                native_window_id: "mock:missing".into(),
            })
            .unwrap_err();
        assert_eq!(err.code.as_str(), "WindowClosed");
    }
}
