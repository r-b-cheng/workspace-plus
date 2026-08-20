//! Operating-system capabilities. Product rules do not live here.

use crate::domain::{InstalledApp, NativeWindow};

pub mod mock;

#[cfg(windows)]
pub mod windows;

#[cfg(target_os = "macos")]
pub mod macos;

pub trait PlatformAdapter: Send + Sync {
    fn scan_installed_apps(&self) -> Vec<InstalledApp>;
    fn launch_app(&self, app_id: &str) -> Result<(), PlatformError>;
    fn list_windows(&self) -> Vec<NativeWindow>;
    fn focus_window(&self, window_id: &str) -> Result<(), PlatformError>;
}

#[derive(Debug, thiserror::Error)]
pub enum PlatformError {
    #[error("target was not found")]
    NotFound,
    #[error("permission denied by operating system")]
    PermissionDenied,
    #[error("window is closed or no longer valid")]
    WindowClosed,
    #[error("platform operation failed: {0}")]
    Internal(String),
}
