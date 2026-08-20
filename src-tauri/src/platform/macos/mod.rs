//! macOS scan, launch, window list, and focus.
//!
//! Pure helpers in this module always compile so Windows CI can cover plist
//! parsing, path checks, opaque ids, and permission copy. Native `open` /
//! window / Accessibility calls live behind `cfg(target_os = "macos")`.

mod logic;
mod plist;

#[cfg(target_os = "macos")]
mod native;

use crate::platform::{
    FocusWindowRequest, FocusWindowResult, LaunchAppRequest, LaunchResult, ListWindowsRequest,
    PlatformAdapter, PlatformError, PlatformWindow, ResolveManualAppTargetRequest,
    ResolvedManualAppTarget, ScanInstalledAppsRequest, ScanInstalledAppsResult,
};

pub use logic::{
    accessibility_denied_message, decode_macos_window_id, encode_macos_window_id,
    ACCESSIBILITY_DENIED_MESSAGE,
};

/// Native macOS adapter. Tests should keep injecting `MockPlatformAdapter`.
pub struct MacOsPlatformAdapter;

impl MacOsPlatformAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for MacOsPlatformAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl PlatformAdapter for MacOsPlatformAdapter {
    fn scan_installed_apps(
        &self,
        _request: &ScanInstalledAppsRequest,
    ) -> Result<ScanInstalledAppsResult, PlatformError> {
        Ok(logic::scan_app_directories(&logic::default_scan_roots()))
    }

    fn launch_app(&self, request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError> {
        let target = logic::resolve_existing_launch_target(&request.launch_target)?;
        #[cfg(target_os = "macos")]
        {
            native::launch_app(&target, request)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = target;
            Err(PlatformError::unsupported())
        }
    }

    fn list_windows(
        &self,
        _request: &ListWindowsRequest,
    ) -> Result<Vec<PlatformWindow>, PlatformError> {
        #[cfg(target_os = "macos")]
        {
            native::list_top_level_windows()
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(Vec::new())
        }
    }

    fn focus_window(&self, request: &FocusWindowRequest) -> Result<FocusWindowResult, PlatformError> {
        #[cfg(target_os = "macos")]
        {
            native::focus_window(&request.native_window_id)
        }
        #[cfg(not(target_os = "macos"))]
        {
            if logic::decode_macos_window_id(&request.native_window_id).is_some() {
                return Err(logic::closed_window_error());
            }
            Err(logic::closed_window_error())
        }
    }

    fn resolve_manual_app_target(
        &self,
        request: &ResolveManualAppTargetRequest,
    ) -> Result<ResolvedManualAppTarget, PlatformError> {
        logic::resolve_manual_app_target(&request.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::{
        default_adapter, FocusWindowRequest, LaunchAppRequest, ListWindowsRequest,
        PlatformErrorCode, ResolveManualAppTargetRequest,
    };

    #[test]
    fn bad_launch_paths_fail_before_native() {
        let adapter = MacOsPlatformAdapter::new();
        let missing = adapter
            .launch_app(&LaunchAppRequest {
                launch_target: "/Applications/WorkspaceHubMissing.app".into(),
                display_name: "Missing".into(),
                installed_app_id: None,
                workspace_id: None,
                launch_args: None,
            })
            .unwrap_err();
        assert_eq!(missing.code, PlatformErrorCode::NotFound);

        let invalid = adapter
            .launch_app(&LaunchAppRequest {
                launch_target: "/tmp/notes.txt".into(),
                display_name: "Notes".into(),
                installed_app_id: None,
                workspace_id: None,
                launch_args: None,
            })
            .unwrap_err();
        assert_eq!(invalid.code, PlatformErrorCode::InvalidTarget);
    }

    #[test]
    fn labeled_ids_are_closed_without_leaking_terms() {
        let adapter = MacOsPlatformAdapter::new();
        for id in [
            "AXUIElement:1",
            "cgwindow:99",
            "CGWindow:1",
            "hwnd:1",
            "win:1",
            "macwin:",
            "macwin:zz-yy",
        ] {
            let err = adapter
                .focus_window(&FocusWindowRequest {
                    native_window_id: id.into(),
                })
                .unwrap_err();
            assert_eq!(err.code.as_str(), "WindowClosed");
            let lower = err.message.to_ascii_lowercase();
            assert!(!lower.contains("axuielement"), "{}", err.message);
            assert!(!lower.contains("cgwindow"), "{}", err.message);
            assert!(!lower.contains("hwnd"), "{}", err.message);
        }
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn existing_bundle_does_not_touch_desktop_off_macos() {
        let dir = tempfile::tempdir().unwrap();
        let bundle = dir.path().join("Demo.app");
        std::fs::create_dir_all(bundle.join("Contents").join("MacOS")).unwrap();
        std::fs::write(
            bundle.join("Contents").join("Info.plist"),
            r#"<dict><key>CFBundleName</key><string>Demo</string></dict>"#,
        )
        .unwrap();
        let adapter = MacOsPlatformAdapter::new();
        let err = adapter
            .launch_app(&LaunchAppRequest {
                launch_target: bundle.to_string_lossy().into_owned(),
                display_name: "Demo".into(),
                installed_app_id: None,
                workspace_id: None,
                launch_args: None,
            })
            .unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::UnsupportedPlatform);

        let listed = adapter
            .list_windows(&ListWindowsRequest::default())
            .unwrap();
        assert!(listed.is_empty());

        let closed = adapter
            .focus_window(&FocusWindowRequest {
                native_window_id: encode_macos_window_id(7, 9),
            })
            .unwrap_err();
        assert_eq!(closed.code, PlatformErrorCode::WindowClosed);
    }

    #[cfg(windows)]
    #[test]
    fn default_adapter_on_windows_stays_windows() {
        let err = default_adapter()
            .resolve_manual_app_target(&ResolveManualAppTargetRequest {
                path: "/Applications/Safari.app".into(),
            })
            .unwrap_err();
        assert_eq!(
            err.code.as_str(),
            "InvalidTarget",
            "Windows adapter rejects .app; macOS adapter would return NotFound"
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn default_adapter_compiles_for_non_windows() {
        let _ = default_adapter();
    }
}
