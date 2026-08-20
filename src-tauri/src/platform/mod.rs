//! Operating-system capabilities. Product rules do not live here.
//!
//! `PlatformAdapter` is injectable so tests and the running app can use the
//! mock implementation. The real Windows adapter is added in a later package.

use serde::{Deserialize, Serialize};

pub mod mock;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(windows)]
pub mod windows;

pub use mock::MockPlatformAdapter;

/// Cross-platform adapter for scan, launch, window list, focus, and manual targets.
pub trait PlatformAdapter: Send + Sync {
    fn scan_installed_apps(
        &self,
        request: &ScanInstalledAppsRequest,
    ) -> Result<ScanInstalledAppsResult, PlatformError>;

    fn launch_app(&self, request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError>;

    fn list_windows(
        &self,
        request: &ListWindowsRequest,
    ) -> Result<Vec<PlatformWindow>, PlatformError>;

    fn focus_window(&self, request: &FocusWindowRequest) -> Result<FocusWindowResult, PlatformError>;

    fn resolve_manual_app_target(
        &self,
        request: &ResolveManualAppTargetRequest,
    ) -> Result<ResolvedManualAppTarget, PlatformError>;
}

/// Builds the default injectable adapter for this package (mock only).
pub fn default_adapter() -> std::sync::Arc<dyn PlatformAdapter> {
    std::sync::Arc::new(MockPlatformAdapter::new())
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanInstalledAppsRequest {
    pub force_refresh: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanInstalledAppsResult {
    pub apps: Vec<ScannedApp>,
    pub scanned_sources: Vec<String>,
    pub started_at: String,
    pub finished_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedApp {
    pub display_name: String,
    pub normalized_name: String,
    pub app_type: String,
    pub platform: String,
    pub source: String,
    pub launch_target: String,
    pub launch_args: Option<String>,
    pub working_dir: Option<String>,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_location: Option<String>,
    pub executable_path: Option<String>,
    pub scan_fingerprint: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAppRequest {
    pub launch_target: String,
    pub display_name: String,
    pub installed_app_id: Option<String>,
    pub workspace_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub process_id: Option<u32>,
    pub native_window_id: Option<String>,
    pub title: Option<String>,
    pub process_path: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWindowsRequest {
    pub installed_app_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformWindow {
    pub native_window_id: String,
    pub process_id: Option<u32>,
    pub title: String,
    pub process_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusWindowRequest {
    pub native_window_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusWindowResult {
    pub focused: bool,
    pub restored: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveManualAppTargetRequest {
    pub path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedManualAppTarget {
    pub display_name: String,
    pub app_type: String,
    pub source: String,
    pub launch_target: String,
    pub executable_path: Option<String>,
    pub scan_fingerprint: String,
    pub platform: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum PlatformErrorCode {
    NotFound,
    InvalidTarget,
    PermissionDenied,
    LaunchFailed,
    WindowClosed,
    FocusDenied,
    PreviewUnavailable,
    IconUnavailable,
    UnsupportedPlatform,
    Timeout,
    PartialResult,
    Internal,
}

impl PlatformErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NotFound => "NotFound",
            Self::InvalidTarget => "InvalidTarget",
            Self::PermissionDenied => "PermissionDenied",
            Self::LaunchFailed => "LaunchFailed",
            Self::WindowClosed => "WindowClosed",
            Self::FocusDenied => "FocusDenied",
            Self::PreviewUnavailable => "PreviewUnavailable",
            Self::IconUnavailable => "IconUnavailable",
            Self::UnsupportedPlatform => "UnsupportedPlatform",
            Self::Timeout => "Timeout",
            Self::PartialResult => "PartialResult",
            Self::Internal => "Internal",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformError {
    pub code: PlatformErrorCode,
    pub message: String,
}

impl PlatformError {
    pub fn new(code: PlatformErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn invalid_target(message: impl Into<String>) -> Self {
        Self::new(PlatformErrorCode::InvalidTarget, message)
    }

    pub fn window_closed(message: impl Into<String>) -> Self {
        Self::new(PlatformErrorCode::WindowClosed, message)
    }

    pub fn focus_denied(message: impl Into<String>) -> Self {
        Self::new(PlatformErrorCode::FocusDenied, message)
    }

    pub fn unsupported() -> Self {
        Self::new(
            PlatformErrorCode::UnsupportedPlatform,
            "this platform adapter is not implemented yet",
        )
    }
}

impl std::fmt::Display for PlatformError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for PlatformError {}
