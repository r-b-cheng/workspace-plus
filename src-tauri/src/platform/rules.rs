//! Platform-agnostic helpers for path checks, dedup, and opaque window ids.
//! These must stay free of Win32 so default `cargo test` never touches the desktop.

use std::collections::HashMap;
use std::path::Path;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::platform::{
    LaunchResult, PlatformError, PlatformWindow, ScannedApp,
};

pub const NATIVE_WINDOW_ID_PREFIX: &str = "win:";
pub const DEFAULT_LAUNCH_TIMEOUT: Duration = Duration::from_secs(15);
pub const DEFAULT_WINDOW_MATCH_TIMEOUT: Duration = Duration::from_millis(2500);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LaunchKind {
    Executable,
    Shortcut,
}

pub fn trim_path(path: &str) -> &str {
    path.trim().trim_matches('"')
}

pub fn path_extension(path: &str) -> String {
    Path::new(trim_path(path))
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

pub fn classify_launch_path(path: &str) -> Result<LaunchKind, PlatformError> {
    let trimmed = trim_path(path);
    if trimmed.is_empty() {
        return Err(PlatformError::invalid_target("path is required"));
    }

    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("steam://")
        || lower.starts_with("file://")
    {
        return Err(PlatformError::invalid_target("url targets are not supported"));
    }

    match path_extension(trimmed).as_str() {
        "exe" => Ok(LaunchKind::Executable),
        "lnk" => Ok(LaunchKind::Shortcut),
        _ => Err(PlatformError::invalid_target(
            "manual target must be an .exe or .lnk path",
        )),
    }
}

pub fn normalize_windows_path(path: &str) -> String {
    trim_path(path)
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

pub fn normalize_args(args: Option<&str>) -> String {
    args.unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

pub fn expand_env_strings(input: &str) -> String {
    let mut result = String::new();
    let mut rest = input;
    while let Some(start) = rest.find('%') {
        result.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end) = after.find('%') {
            let name = &after[..end];
            if name.is_empty() {
                result.push('%');
                rest = &after[end + 1..];
                continue;
            }
            match std::env::var(name) {
                Ok(value) => {
                    result.push_str(&value);
                    rest = &after[end + 1..];
                }
                Err(_) => {
                    result.push('%');
                    rest = after;
                }
            }
        } else {
            result.push_str(&rest[start..]);
            rest = "";
            break;
        }
    }
    result.push_str(rest);
    result
}

pub fn clean_display_icon(raw: &str) -> Option<String> {
    let trimmed = expand_env_strings(trim_path(raw));
    if trimmed.is_empty() {
        return None;
    }
    if let Some((path, index)) = trimmed.rsplit_once(',') {
        if index.trim().chars().all(|ch| ch == '-' || ch.is_ascii_digit()) {
            let cleaned = trim_path(path);
            if !cleaned.is_empty() {
                return Some(cleaned.to_string());
            }
        }
    }
    Some(trimmed)
}

pub fn launch_identity_key(
    executable_path: Option<&str>,
    launch_target: &str,
    launch_args: Option<&str>,
) -> String {
    let primary = executable_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(launch_target);
    format!(
        "{}|{}",
        normalize_windows_path(primary),
        normalize_args(launch_args)
    )
}

pub fn scan_fingerprint(
    executable_path: Option<&str>,
    launch_target: &str,
    launch_args: Option<&str>,
) -> String {
    format!(
        "startmenu:{}",
        launch_identity_key(executable_path, launch_target, launch_args)
    )
}

pub fn manual_fingerprint(path: &str) -> String {
    format!("manual:{}", normalize_windows_path(path))
}

pub fn is_unwanted_shortcut_name(name: &str) -> bool {
    let normalized = name.trim().to_lowercase();
    normalized.contains("uninstall")
        || normalized.contains("卸载")
        || normalized.starts_with("remove ")
}

pub fn is_executable_path(path: &str) -> bool {
    path_extension(path) == "exe"
}

pub fn display_name_from_path(path: &str) -> String {
    Path::new(trim_path(path))
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(trim_path(path))
        .to_string()
}

pub fn normalized_display_name(name: &str) -> String {
    name.trim().to_lowercase()
}

pub fn missing_path_error(path: &Path) -> PlatformError {
    if path_extension(&path.to_string_lossy()) == "exe"
        || path_extension(&path.to_string_lossy()) == "lnk"
    {
        PlatformError::not_found("target path was not found")
    } else {
        PlatformError::invalid_target("manual target must be an .exe or .lnk path")
    }
}

pub fn validate_existing_target(path: &Path) -> Result<(), PlatformError> {
    if path.is_dir() {
        return Err(PlatformError::invalid_target(
            "directory targets are not supported",
        ));
    }
    if !path.is_file() {
        return Err(missing_path_error(path));
    }
    Ok(())
}

pub fn merge_scanned_metadata(existing: &mut ScannedApp, incoming: &ScannedApp) {
    if existing.publisher.is_none() {
        existing.publisher = incoming.publisher.clone();
    }
    if existing.version.is_none() {
        existing.version = incoming.version.clone();
    }
    if existing.install_location.is_none() {
        existing.install_location = incoming.install_location.clone();
    }
    if existing.executable_path.is_none() {
        existing.executable_path = incoming.executable_path.clone();
    }
}

pub fn dedup_scanned_apps(apps: Vec<ScannedApp>) -> Vec<ScannedApp> {
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut out = Vec::new();
    for app in apps {
        let key = launch_identity_key(
            app.executable_path.as_deref(),
            &app.launch_target,
            app.launch_args.as_deref(),
        );
        if let Some(&index) = seen.get(&key) {
            merge_scanned_metadata(&mut out[index], &app);
            continue;
        }
        seen.insert(key, out.len());
        out.push(app);
    }
    out
}

pub fn encode_opaque_window_id(handle: usize) -> String {
    format!("{NATIVE_WINDOW_ID_PREFIX}{handle:x}")
}

pub fn decode_opaque_window_id(id: &str) -> Option<usize> {
    let trimmed = id.trim();
    if trimmed.to_ascii_lowercase().contains("hwnd") {
        return None;
    }
    let rest = trimmed.strip_prefix(NATIVE_WINDOW_ID_PREFIX)?;
    if rest.is_empty() || rest.len() > 16 {
        return None;
    }
    usize::from_str_radix(rest, 16).ok()
}

pub fn launch_result_from_parts(
    process_id: Option<u32>,
    process_path: Option<String>,
    window: Option<PlatformWindow>,
) -> LaunchResult {
    LaunchResult {
        process_id: process_id.or_else(|| window.as_ref().and_then(|item| item.process_id)),
        native_window_id: window.as_ref().map(|item| item.native_window_id.clone()),
        title: window.as_ref().map(|item| item.title.clone()),
        process_path: process_path.or_else(|| window.and_then(|item| item.process_path)),
    }
}

pub fn run_with_timeout<T, F>(timeout: Duration, work: F) -> Result<T, PlatformError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, PlatformError> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    thread::Builder::new()
        .name("wh-launch".into())
        .spawn(move || {
            let _ = tx.send(work());
        })
        .map_err(|err| PlatformError::launch_failed(err.to_string()))?;

    match rx.recv_timeout(timeout) {
        Ok(value) => value,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            Err(PlatformError::timeout("launch timed out before the process started"))
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            Err(PlatformError::launch_failed("launch worker stopped unexpectedly"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::PlatformErrorCode;

    fn scanned(name: &str, exe: &str, args: Option<&str>) -> ScannedApp {
        ScannedApp {
            display_name: name.to_string(),
            normalized_name: normalized_display_name(name),
            app_type: "shortcut".into(),
            platform: "windows".into(),
            source: "start_menu".into(),
            launch_target: format!("{name}.lnk"),
            launch_args: args.map(ToOwned::to_owned),
            working_dir: None,
            publisher: None,
            version: None,
            install_location: None,
            executable_path: Some(exe.to_string()),
            scan_fingerprint: scan_fingerprint(Some(exe), &format!("{name}.lnk"), args),
        }
    }

    #[test]
    fn rejects_urls_folders_and_other_extensions() {
        assert_eq!(
            classify_launch_path("https://example.com").unwrap_err().code,
            PlatformErrorCode::InvalidTarget
        );
        assert_eq!(
            classify_launch_path(r"C:\notes.txt").unwrap_err().code,
            PlatformErrorCode::InvalidTarget
        );
        assert_eq!(
            classify_launch_path(r"C:\Users\me\Documents").unwrap_err().code,
            PlatformErrorCode::InvalidTarget
        );
        assert_eq!(
            classify_launch_path("").unwrap_err().code,
            PlatformErrorCode::InvalidTarget
        );
    }

    #[test]
    fn accepts_exe_and_lnk_extensions() {
        assert_eq!(
            classify_launch_path(r#" "C:\Tools\app.EXE" "#).unwrap(),
            LaunchKind::Executable
        );
        assert_eq!(
            classify_launch_path(r"C:\Start Menu\Notepad.lnk").unwrap(),
            LaunchKind::Shortcut
        );
    }

    #[test]
    fn dedups_same_launch_target_and_keeps_profile_args() {
        let apps = vec![
            scanned("Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe", None),
            scanned(
                "Chrome User",
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                None,
            ),
            scanned(
                "Chrome Profile",
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                Some("--profile-directory=Work"),
            ),
        ];
        let merged = dedup_scanned_apps(apps);
        assert_eq!(merged.len(), 2);
        assert!(merged.iter().any(|app| app.display_name == "Chrome"));
        assert!(merged.iter().any(|app| app.display_name == "Chrome Profile"));
    }

    #[test]
    fn opaque_window_id_never_uses_hwnd_name() {
        let id = encode_opaque_window_id(0x0012_3456);
        assert!(id.starts_with("win:"));
        assert!(!id.to_ascii_lowercase().contains("hwnd"));
        assert_eq!(decode_opaque_window_id(&id), Some(0x0012_3456));
        assert_eq!(decode_opaque_window_id("hwnd:123456"), None);
        assert_eq!(decode_opaque_window_id("win:"), None);
    }

    #[test]
    fn timeout_and_launch_failed_are_distinct() {
        let timed_out = run_with_timeout(Duration::from_millis(20), || {
            thread::sleep(Duration::from_millis(120));
            Ok(())
        })
        .unwrap_err();
        assert_eq!(timed_out.code, PlatformErrorCode::Timeout);

        let failed = run_with_timeout::<(), _>(Duration::from_millis(200), || {
            Err(PlatformError::launch_failed("create process failed"))
        })
        .unwrap_err();
        assert_eq!(failed.code, PlatformErrorCode::LaunchFailed);
    }

    #[test]
    fn launch_without_window_is_still_success() {
        let result = launch_result_from_parts(Some(4242), Some(r"C:\app.exe".into()), None);
        assert_eq!(result.process_id, Some(4242));
        assert!(result.native_window_id.is_none());
    }

    #[test]
    fn cleans_registry_icon_and_expands_env() {
        std::env::set_var("WH_PKG05_TEST_ROOT", r"C:\Program Files\Demo");
        let cleaned = clean_display_icon(r#"%WH_PKG05_TEST_ROOT%\app.exe,0"#).unwrap();
        assert_eq!(normalize_windows_path(&cleaned), r"c:\program files\demo\app.exe");
        std::env::remove_var("WH_PKG05_TEST_ROOT");
    }

    #[test]
    fn skips_uninstaller_shortcut_names() {
        assert!(is_unwanted_shortcut_name("Uninstall Slack"));
        assert!(is_unwanted_shortcut_name("卸载示例"));
        assert!(!is_unwanted_shortcut_name("Notepad"));
    }
}
