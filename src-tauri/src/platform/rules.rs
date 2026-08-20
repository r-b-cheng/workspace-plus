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

/// Hints used to re-find a running app window after a stored HWND goes stale.
/// Matching is process identity only — title and PID never accept a window.
#[derive(Clone, Debug, Default)]
pub struct WindowMatchHint {
    pub process_id: Option<u32>,
    pub process_path: Option<String>,
    pub executable_path: Option<String>,
    pub launch_target: Option<String>,
    pub install_location: Option<String>,
    pub display_name: String,
    pub title_hint: Option<String>,
    pub stored_window_id: Option<String>,
    pub exclude_window_ids: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum ProcessIdentity {
    None = 0,
    Name = 1,
    InstallTree = 2,
    SameFile = 3,
    ExactPath = 4,
}

const MIN_NAME_IDENTITY_LEN: usize = 6;

pub fn window_matches_process(window: &PlatformWindow, hint: &WindowMatchHint) -> bool {
    process_identity(window, hint) != ProcessIdentity::None
}

pub fn pick_best_matching_window(
    windows: &[PlatformWindow],
    hint: &WindowMatchHint,
) -> Option<PlatformWindow> {
    matching_windows(windows, hint)
        .into_iter()
        .max_by_key(|(identity, window)| {
            (
                *identity,
                hint.process_id.is_some() && window.process_id == hint.process_id,
                hint.stored_window_id.as_deref() == Some(window.native_window_id.as_str()),
                title_rank(window, hint),
                window.title.len(),
            )
        })
        .map(|(_, window)| window.clone())
}

/// Focus must not steal another instance of the same app.
/// Use the stored HWND when it still matches; otherwise only accept a unique match.
pub fn pick_focus_window(
    windows: &[PlatformWindow],
    hint: &WindowMatchHint,
) -> Option<PlatformWindow> {
    let matches = matching_windows(windows, hint);
    if let Some(stored) = hint.stored_window_id.as_deref() {
        if let Some((_, window)) = matches
            .iter()
            .find(|(_, window)| window.native_window_id == stored)
        {
            return Some((*window).clone());
        }
    }
    if matches.len() == 1 {
        return Some(matches[0].1.clone());
    }
    None
}

/// Process-identity matches, excluding `hint.exclude_window_ids`.
pub fn list_matching_windows<'a>(
    windows: &'a [PlatformWindow],
    hint: &WindowMatchHint,
) -> Vec<&'a PlatformWindow> {
    matching_windows(windows, hint)
        .into_iter()
        .map(|(_, window)| window)
        .collect()
}

fn matching_windows<'a>(
    windows: &'a [PlatformWindow],
    hint: &WindowMatchHint,
) -> Vec<(ProcessIdentity, &'a PlatformWindow)> {
    windows
        .iter()
        .filter(|window| {
            !hint
                .exclude_window_ids
                .iter()
                .any(|id| id == &window.native_window_id)
        })
        .filter_map(|window| {
            let identity = process_identity(window, hint);
            (identity != ProcessIdentity::None).then_some((identity, window))
        })
        .collect()
}

pub fn split_launch_args(args: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    for ch in args.unwrap_or("").chars() {
        match ch {
            '"' => in_quotes = !in_quotes,
            ch if ch.is_whitespace() && !in_quotes => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            ch => current.push(ch),
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

pub fn extra_new_instance_args(executable_path: Option<&str>, existing_args: &str) -> Vec<String> {
    let stem = executable_path
        .and_then(path_file_stem)
        .unwrap_or_default();
    let existing = existing_args.to_ascii_lowercase();
    match stem.as_str() {
        "msedge" | "chrome" | "brave" | "chromium" | "vivaldi" => {
            if existing.contains("new-window") || existing.contains("--app=") {
                Vec::new()
            } else {
                vec!["--new-window".into()]
            }
        }
        "firefox" => {
            if existing.contains("new-window") || existing.contains("new-instance") {
                Vec::new()
            } else {
                vec!["-new-window".into()]
            }
        }
        _ => Vec::new(),
    }
}

fn process_identity(window: &PlatformWindow, hint: &WindowMatchHint) -> ProcessIdentity {
    let Some(window_path) = window
        .process_path
        .as_deref()
        .map(normalize_windows_path)
        .filter(|path| is_executable_path(path))
    else {
        return ProcessIdentity::None;
    };

    let known = hint_executable_paths(hint);
    if known.iter().any(|path| path == &window_path) {
        return ProcessIdentity::ExactPath;
    }

    let window_name = path_file_name(&window_path);
    let window_parent = path_parent(&window_path);
    let mut best = ProcessIdentity::None;

    for known_path in &known {
        if path_file_name(known_path) != window_name || window_name.is_none() {
            continue;
        }
        if path_parent(known_path) == window_parent {
            return ProcessIdentity::SameFile;
        }
        if shares_install_prefix(&window_path, known_path, hint.install_location.as_deref()) {
            best = ProcessIdentity::InstallTree;
        }
    }

    if best != ProcessIdentity::None {
        return best;
    }

    if !known.is_empty() {
        return ProcessIdentity::None;
    }

    name_identity(&window_path, hint)
}

fn name_identity(window_path: &str, hint: &WindowMatchHint) -> ProcessIdentity {
    let Some(stem) = path_file_stem(window_path).map(|value| compact_identity(&value)) else {
        return ProcessIdentity::None;
    };
    if stem.len() < MIN_NAME_IDENTITY_LEN {
        return ProcessIdentity::None;
    }

    let display = compact_identity(&hint.display_name);
    if display == stem {
        return ProcessIdentity::Name;
    }

    if let Some(launch_stem) = hint
        .launch_target
        .as_deref()
        .and_then(path_file_stem)
        .map(|value| compact_identity(&value))
    {
        if launch_stem == stem {
            return ProcessIdentity::Name;
        }
    }

    ProcessIdentity::None
}

fn title_rank(window: &PlatformWindow, hint: &WindowMatchHint) -> u8 {
    let title = window.title.to_lowercase();
    if let Some(title_hint) = hint.title_hint.as_deref() {
        let hint_title = title_hint.trim().to_lowercase();
        if !hint_title.is_empty() && title == hint_title {
            return 2;
        }
    }
    let display = normalized_display_name(&hint.display_name);
    if !display.is_empty() && title.contains(&display) {
        return 1;
    }
    0
}

fn hint_executable_paths(hint: &WindowMatchHint) -> Vec<String> {
    [hint.executable_path.as_deref(), hint.launch_target.as_deref()]
        .into_iter()
        .flatten()
        .map(normalize_windows_path)
        .filter(|path| is_executable_path(path))
        .collect()
}

fn shares_install_prefix(window_path: &str, known_path: &str, install_location: Option<&str>) -> bool {
    install_prefixes(known_path, install_location)
        .iter()
        .any(|prefix| window_path == prefix || window_path.starts_with(&format!("{prefix}\\")))
}

fn install_prefixes(known_path: &str, install_location: Option<&str>) -> Vec<String> {
    let mut prefixes = Vec::new();
    if let Some(location) = install_location
        .map(normalize_windows_path)
        .filter(|path| !path.is_empty() && path_depth(path) >= 2)
    {
        prefixes.push(location);
    }
    if let Some(parent) = path_parent(known_path).filter(|path| path_depth(path) >= 3) {
        if !prefixes.iter().any(|existing| existing == &parent) {
            prefixes.push(parent);
        }
    }
    prefixes
}

fn path_depth(path: &str) -> usize {
    path.split(['\\', '/']).filter(|part| !part.is_empty()).count()
}

fn path_parent(path: &str) -> Option<String> {
    Path::new(path)
        .parent()
        .map(|parent| normalize_windows_path(&parent.to_string_lossy()))
        .filter(|parent| !parent.is_empty())
}

fn path_file_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn path_file_stem(path: &str) -> Option<String> {
    Path::new(path)
        .file_stem()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn compact_identity(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
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

    fn window(id: &str, title: &str, path: Option<&str>, pid: Option<u32>) -> PlatformWindow {
        PlatformWindow {
            native_window_id: id.into(),
            process_id: pid,
            title: title.into(),
            process_path: path.map(ToOwned::to_owned),
        }
    }

    #[test]
    fn rediscovers_by_exact_exe_path_without_stored_hwnd() {
        let hint = WindowMatchHint {
            display_name: "CC Switch".into(),
            executable_path: Some(r"C:\Users\me\AppData\Local\cc-switch\CC Switch.exe".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![
            window("win:1", "论文写作 - Workspace Hub", Some(r"C:\hub\workspace-hub.exe"), Some(1)),
            window("win:2", "CC Switch", Some(r"C:\Users\me\AppData\Local\cc-switch\CC Switch.exe"), Some(88)),
            window("win:3", "Microsoft Edge", Some(r"C:\msedge.exe"), Some(9)),
        ];
        let found = pick_best_matching_window(&desktop, &hint).unwrap();
        assert_eq!(found.native_window_id, "win:2");
    }

    #[test]
    fn name_identity_finds_app_when_only_shortcut_name_is_known() {
        let hint = WindowMatchHint {
            display_name: "CC Switch".into(),
            launch_target: Some(r"C:\Users\me\Desktop\CC Switch.lnk".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![
            window("win:edge", "CC Switch", Some(r"C:\msedge.exe"), Some(11)),
            window("win:cc", "Settings", Some(r"D:\apps\cc-switch.exe"), Some(22)),
        ];
        let found = pick_best_matching_window(&desktop, &hint).unwrap();
        assert_eq!(found.native_window_id, "win:cc");
    }

    #[test]
    fn title_collision_does_not_bind_unrelated_process() {
        let hint = WindowMatchHint {
            display_name: "CC Switch".into(),
            launch_target: Some(r"C:\Users\me\Desktop\CC Switch.lnk".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![
            window("win:1", "CC Switch", Some(r"C:\Windows\explorer.exe"), Some(4)),
            window("win:2", "Switch User", Some(r"C:\Windows\explorer.exe"), Some(5)),
        ];
        assert!(pick_best_matching_window(&desktop, &hint).is_none());
    }

    #[test]
    fn same_filename_in_other_folder_is_not_a_match() {
        let hint = WindowMatchHint {
            display_name: "Google Chrome".into(),
            executable_path: Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe".into()),
            install_location: Some(r"C:\Program Files\Google\Chrome".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![window(
            "win:other",
            "Google Chrome",
            Some(r"D:\Downloads\chrome.exe"),
            Some(7),
        )];
        assert!(pick_best_matching_window(&desktop, &hint).is_none());
    }

    #[test]
    fn electron_versioned_exe_matches_install_tree() {
        let hint = WindowMatchHint {
            display_name: "CC Switch".into(),
            executable_path: Some(r"C:\Users\me\AppData\Local\cc-switch\CC Switch.exe".into()),
            install_location: Some(r"C:\Users\me\AppData\Local\cc-switch".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![window(
            "win:cc",
            "CC Switch",
            Some(r"C:\Users\me\AppData\Local\cc-switch\app-1.2.3\CC Switch.exe"),
            Some(22),
        )];
        let found = pick_best_matching_window(&desktop, &hint).unwrap();
        assert_eq!(found.native_window_id, "win:cc");
    }

    #[test]
    fn pid_or_title_alone_does_not_match() {
        let hint = WindowMatchHint {
            process_id: Some(88),
            display_name: "Google Chrome".into(),
            executable_path: Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe".into()),
            title_hint: Some("Google Chrome".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![window(
            "win:explorer",
            "Google Chrome",
            Some(r"C:\Windows\explorer.exe"),
            Some(88),
        )];
        assert!(pick_best_matching_window(&desktop, &hint).is_none());
        assert!(!window_matches_process(&desktop[0], &hint));
    }

    #[test]
    fn prefers_path_match_over_similar_title() {
        let hint = WindowMatchHint {
            display_name: "Google Chrome".into(),
            executable_path: Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe".into()),
            ..WindowMatchHint::default()
        };
        let desktop = vec![
            window("win:edge", "Google - Microsoft Edge", Some(r"C:\msedge.exe"), Some(3)),
            window(
                "win:chrome",
                "Inbox",
                Some(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
                Some(4),
            ),
        ];
        let found = pick_best_matching_window(&desktop, &hint).unwrap();
        assert_eq!(found.native_window_id, "win:chrome");
    }

    #[test]
    fn launch_match_skips_windows_that_already_existed() {
        let hint = WindowMatchHint {
            display_name: "Microsoft Edge".into(),
            executable_path: Some(
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".into(),
            ),
            exclude_window_ids: vec!["win:old".into()],
            ..WindowMatchHint::default()
        };
        let desktop = vec![
            window(
                "win:old",
                "Work mail",
                Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
                Some(11),
            ),
            window(
                "win:new",
                "New Tab",
                Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
                Some(11),
            ),
        ];
        let found = pick_best_matching_window(&desktop, &hint).unwrap();
        assert_eq!(found.native_window_id, "win:new");
    }

    #[test]
    fn focus_does_not_guess_among_multiple_same_app_windows() {
        let hint = WindowMatchHint {
            display_name: "Microsoft Edge".into(),
            executable_path: Some(
                r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe".into(),
            ),
            ..WindowMatchHint::default()
        };
        let desktop = vec![
            window(
                "win:personal",
                "News",
                Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
                Some(11),
            ),
            window(
                "win:work",
                "Docs",
                Some(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
                Some(11),
            ),
        ];
        assert!(pick_focus_window(&desktop, &hint).is_none());

        let mut stored = hint.clone();
        stored.stored_window_id = Some("win:work".into());
        assert_eq!(
            pick_focus_window(&desktop, &stored).unwrap().native_window_id,
            "win:work"
        );
    }

    #[test]
    fn browsers_get_new_window_flag() {
        assert_eq!(
            extra_new_instance_args(Some(r"C:\msedge.exe"), ""),
            vec!["--new-window".to_string()]
        );
        assert!(extra_new_instance_args(Some(r"C:\msedge.exe"), "--new-window").is_empty());
        assert_eq!(
            extra_new_instance_args(Some(r"C:\Program Files\Mozilla Firefox\firefox.exe"), ""),
            vec!["-new-window".to_string()]
        );
        assert!(extra_new_instance_args(Some(r"C:\Windows\notepad.exe"), "").is_empty());
    }
}
