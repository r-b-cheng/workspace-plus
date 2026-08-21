//! Windows scan, launch, window list, and focus.

use std::sync::mpsc;
use std::thread;

use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};

use crate::platform::{
    FocusWindowRequest, FocusWindowResult, LaunchAppRequest, LaunchResult, ListWindowsRequest,
    PlatformAdapter, PlatformError, PlatformWindow, ResolveManualAppTargetRequest,
    ResolvedManualAppTarget, ScanInstalledAppsRequest, ScanInstalledAppsResult,
};

mod app_launch;
mod app_scan;
pub(crate) mod embed;
mod icon;
mod manual_target;
pub(crate) mod win_events;
mod window_ops;

pub(crate) fn resolve_shortcut_exe(path: &str) -> Option<String> {
    let path = path.to_string();
    run_sta(move || app_scan::resolve_shortcut_target(std::path::Path::new(&path)))
        .ok()
        .map(|resolved| resolved.target_path)
        .filter(|target| crate::platform::rules::is_executable_path(target))
}

/// Native Windows adapter. Tests should keep injecting `MockPlatformAdapter`.
pub struct WindowsPlatformAdapter;

impl WindowsPlatformAdapter {
    pub fn new() -> Self {
        Self
    }

    /// Best-effort close for gated native tests. Not a product command.
    pub fn request_close_window(&self, native_window_id: &str) -> bool {
        window_ops::request_close_window(native_window_id)
    }
}

impl Default for WindowsPlatformAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl PlatformAdapter for WindowsPlatformAdapter {
    fn scan_installed_apps(
        &self,
        _request: &ScanInstalledAppsRequest,
    ) -> Result<ScanInstalledAppsResult, PlatformError> {
        run_sta(app_scan::scan_start_menu_apps)
    }

    fn launch_app(&self, request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError> {
        app_launch::launch_app(request)
    }

    fn list_windows(
        &self,
        _request: &ListWindowsRequest,
    ) -> Result<Vec<PlatformWindow>, PlatformError> {
        window_ops::list_top_level_windows()
    }

    fn window_is_open(&self, native_window_id: &str) -> bool {
        window_ops::window_is_open(native_window_id)
    }

    fn focus_window(&self, request: &FocusWindowRequest) -> Result<FocusWindowResult, PlatformError> {
        window_ops::focus_window(&request.native_window_id)
    }

    fn resolve_manual_app_target(
        &self,
        request: &ResolveManualAppTargetRequest,
    ) -> Result<ResolvedManualAppTarget, PlatformError> {
        manual_target::resolve_manual_app_target(&request.path)
    }
}

pub(crate) fn run_sta<T, F>(work: F) -> Result<T, PlatformError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, PlatformError> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    thread::Builder::new()
        .name("wh-sta".into())
        .spawn(move || {
            let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok() };
            let result = work();
            if initialized {
                unsafe { CoUninitialize() };
            }
            let _ = tx.send(result);
        })
        .map_err(|err| PlatformError::internal(err.to_string()))?;
    rx.recv()
        .map_err(|_| PlatformError::internal("COM worker stopped unexpectedly"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{
        default_adapter, FocusWindowRequest, PlatformAdapter, ResolveManualAppTargetRequest,
    };

    #[test]
    fn default_adapter_checks_real_paths() {
        let adapter = default_adapter();
        let err = adapter
            .resolve_manual_app_target(&ResolveManualAppTargetRequest {
                path: r"C:\this-path-should-not-exist-workspace-hub-pkg05\missing.exe".into(),
            })
            .unwrap_err();
        assert_eq!(err.code.as_str(), "NotFound");
    }

    #[test]
    fn hwnd_labeled_ids_are_rejected_as_closed() {
        let adapter = WindowsPlatformAdapter::new();
        let err = adapter
            .focus_window(&FocusWindowRequest {
                native_window_id: "hwnd:1234".into(),
            })
            .unwrap_err();
        assert_eq!(err.code.as_str(), "WindowClosed");
        assert!(!err.message.to_ascii_lowercase().contains("hwnd"));
    }

    #[test]
    fn stale_opaque_id_is_window_closed() {
        let adapter = WindowsPlatformAdapter::new();
        let err = adapter
            .focus_window(&FocusWindowRequest {
                native_window_id: "win:1".into(),
            })
            .unwrap_err();
        assert_eq!(err.code.as_str(), "WindowClosed");
    }
}
