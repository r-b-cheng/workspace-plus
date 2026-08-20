//! Structured application errors returned to the frontend as `{ code, message }`.

use std::fmt::{Display, Formatter};
use std::io;

use rusqlite::Error as SqlError;
use serde::Serialize;

/// Error codes that the frontend can map to UI copy.
pub mod codes {
    pub const NOT_FOUND: &str = "NotFound";
    pub const WINDOW_CLOSED: &str = "WindowClosed";
    pub const INVALID_TARGET: &str = "InvalidTarget";
    pub const FOCUS_DENIED: &str = "FocusDenied";
    pub const PERMISSION_DENIED: &str = "PermissionDenied";
    pub const LAUNCH_FAILED: &str = "LaunchFailed";
    pub const UNSUPPORTED_PLATFORM: &str = "UnsupportedPlatform";
    pub const TIMEOUT: &str = "Timeout";
    pub const VALIDATION: &str = "Validation";
    pub const ASSET_WRITE_FAILED: &str = "AssetWriteFailed";
    pub const MIGRATION_FAILED: &str = "MigrationFailed";
    pub const INSTALLED_APP_UNAVAILABLE: &str = "InstalledAppUnavailable";
    pub const INTERNAL: &str = "Internal";
}

/// Frontend-facing error. Serialized as camelCase `{ code, message }`.
#[derive(Debug, Clone)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(codes::NOT_FOUND, message)
    }

    pub fn window_closed(message: impl Into<String>) -> Self {
        Self::new(codes::WINDOW_CLOSED, message)
    }

    pub fn invalid_target(message: impl Into<String>) -> Self {
        Self::new(codes::INVALID_TARGET, message)
    }

    pub fn focus_denied(message: impl Into<String>) -> Self {
        Self::new(codes::FOCUS_DENIED, message)
    }

    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::new(codes::PERMISSION_DENIED, message)
    }

    pub fn launch_failed(message: impl Into<String>) -> Self {
        Self::new(codes::LAUNCH_FAILED, message)
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(codes::VALIDATION, message)
    }

    pub fn asset_write_failed(message: impl Into<String>) -> Self {
        Self::new(codes::ASSET_WRITE_FAILED, message)
    }

    pub fn migration_failed(message: impl Into<String>) -> Self {
        Self::new(codes::MIGRATION_FAILED, message)
    }

    pub fn installed_app_unavailable(message: impl Into<String>) -> Self {
        Self::new(codes::INSTALLED_APP_UNAVAILABLE, message)
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(codes::INTERNAL, message)
    }
}

impl Display for AppError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Body<'a> {
            code: &'a str,
            message: &'a str,
        }

        Body {
            code: &self.code,
            message: &self.message,
        }
        .serialize(serializer)
    }
}

impl From<SqlError> for AppError {
    fn from(err: SqlError) -> Self {
        tracing::error!(error = %err, "sqlite operation failed");
        match err {
            SqlError::QueryReturnedNoRows => Self::not_found("record not found"),
            _ => Self::internal("database operation failed"),
        }
    }
}

impl From<io::Error> for AppError {
    fn from(err: io::Error) -> Self {
        tracing::error!(error = %err, "filesystem operation failed");
        Self::asset_write_failed("failed to write asset file")
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        tracing::error!(error = %err, "json operation failed");
        Self::internal("failed to encode settings")
    }
}

impl From<crate::platform::PlatformError> for AppError {
    fn from(err: crate::platform::PlatformError) -> Self {
        Self::new(err.code.as_str(), err.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() {
        let json = serde_json::to_string(&AppError::window_closed("window is gone")).unwrap();
        assert!(json.contains("\"code\":\"WindowClosed\""));
        assert!(json.contains("\"message\":\"window is gone\""));
        assert!(!json.contains("HWND"));
    }
}
