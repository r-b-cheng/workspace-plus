use std::path::Path;

use crate::platform::rules::{
    classify_launch_path, display_name_from_path, manual_fingerprint, normalized_display_name,
    trim_path, validate_existing_target, LaunchKind,
};
use crate::platform::windows::app_scan;
use crate::platform::windows::icon;
use crate::platform::windows::run_sta;
use crate::platform::{PlatformError, ResolvedManualAppTarget};

pub fn resolve_manual_app_target(path: &str) -> Result<ResolvedManualAppTarget, PlatformError> {
    let trimmed = trim_path(path).to_string();
    let kind = classify_launch_path(&trimmed)?;
    let fs_path = Path::new(&trimmed);
    validate_existing_target(fs_path)?;

    let resolved = match kind {
        LaunchKind::Executable => ResolvedManualAppTarget {
            display_name: display_name_from_path(&trimmed),
            app_type: "native_app".to_string(),
            source: "manual".to_string(),
            launch_target: trimmed.clone(),
            executable_path: Some(trimmed.clone()),
            scan_fingerprint: manual_fingerprint(&trimmed),
            platform: "windows".to_string(),
        },
        LaunchKind::Shortcut => resolve_shortcut_manual(&trimmed)?,
    };

    let _ = normalized_display_name(&resolved.display_name);
    let _ = icon::try_probe_icon(Path::new(
        resolved
            .executable_path
            .as_deref()
            .unwrap_or(resolved.launch_target.as_str()),
    ));
    Ok(resolved)
}

fn resolve_shortcut_manual(path: &str) -> Result<ResolvedManualAppTarget, PlatformError> {
    let owned = path.to_string();
    let parsed = run_sta(move || {
        let resolved = app_scan::resolve_shortcut_target(Path::new(&owned))?;
        if !Path::new(&resolved.target_path).is_file() {
            return Err(PlatformError::not_found("shortcut target was not found"));
        }
        if crate::platform::rules::path_extension(&resolved.target_path) != "exe" {
            return Err(PlatformError::invalid_target(
                "shortcut target must be an executable",
            ));
        }
        Ok(resolved)
    })?;

    Ok(ResolvedManualAppTarget {
        display_name: parsed.display_name,
        app_type: "shortcut".to_string(),
        source: "manual".to_string(),
        launch_target: path.to_string(),
        executable_path: Some(parsed.target_path),
        scan_fingerprint: manual_fingerprint(path),
        platform: "windows".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::PlatformErrorCode;
    use std::fs;
    use std::io::Write;

    #[test]
    fn existing_exe_resolves_and_missing_is_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("demo.exe");
        fs::File::create(&exe).unwrap().write_all(b"mz").unwrap();

        let resolved = resolve_manual_app_target(&exe.to_string_lossy()).unwrap();
        assert_eq!(resolved.app_type, "native_app");
        assert_eq!(resolved.source, "manual");
        assert!(resolved.scan_fingerprint.starts_with("manual:"));

        let missing = dir.path().join("gone.exe");
        let err = resolve_manual_app_target(&missing.to_string_lossy()).unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::NotFound);
    }

    #[test]
    fn broken_lnk_is_invalid_or_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let lnk = dir.path().join("broken.lnk");
        fs::write(&lnk, b"not-a-real-shortcut").unwrap();
        let err = resolve_manual_app_target(&lnk.to_string_lossy()).unwrap_err();
        assert!(
            err.code == PlatformErrorCode::InvalidTarget || err.code == PlatformErrorCode::NotFound
        );
    }

    #[test]
    fn folder_and_url_are_invalid() {
        let dir = tempfile::tempdir().unwrap();
        let err = resolve_manual_app_target(&dir.path().to_string_lossy()).unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::InvalidTarget);
        let err = resolve_manual_app_target("https://example.com").unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::InvalidTarget);
    }
}
