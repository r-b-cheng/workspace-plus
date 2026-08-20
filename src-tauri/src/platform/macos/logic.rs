//! Pure macOS helpers. These compile on Windows so fixtures can be unit-tested.

use std::fs;
use std::path::{Path, PathBuf};

use crate::platform::macos::plist::{parse_info_plist_bytes, BundleInfo};
use crate::platform::rules::{
    dedup_scanned_apps, display_name_from_path, is_unwanted_shortcut_name, normalized_display_name,
    path_extension, trim_path,
};
use crate::platform::{
    PlatformError, ResolvedManualAppTarget, ScanInstalledAppsResult, ScannedApp,
};
use crate::storage::now_utc;

pub const MACOS_WINDOW_ID_PREFIX: &str = "macwin:";
pub const ACCESSIBILITY_DENIED_MESSAGE: &str =
    "未获得辅助功能权限，无法把窗口置前。请打开「系统设置 → 隐私与安全性 → 辅助功能」，勾选 Workspace Hub 后重试。";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MacosWindowKey {
    pub process_id: u32,
    pub window_number: u32,
}

#[derive(Clone, Debug)]
pub struct ResolvedMacosTarget {
    pub bundle_path: PathBuf,
    pub executable_path: Option<PathBuf>,
    pub display_name: String,
}

#[derive(Clone, Debug)]
pub struct ScanRoot {
    pub path: PathBuf,
    pub source: &'static str,
}

pub fn accessibility_denied_message() -> &'static str {
    ACCESSIBILITY_DENIED_MESSAGE
}

pub fn normalize_macos_path(path: &str) -> String {
    trim_path(path)
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

pub fn is_app_bundle_path(path: &str) -> bool {
    path_extension(path) == "app"
}

pub fn macos_scan_fingerprint(launch_target: &str) -> String {
    format!("macos-app:{}", normalize_macos_path(launch_target))
}

pub fn macos_manual_fingerprint(path: &str) -> String {
    format!("manual:{}", normalize_macos_path(path))
}

pub fn encode_macos_window_id(process_id: u32, window_number: u32) -> String {
    format!("{MACOS_WINDOW_ID_PREFIX}{process_id:x}-{window_number:x}")
}

pub fn decode_macos_window_id(id: &str) -> Option<MacosWindowKey> {
    let trimmed = id.trim();
    if contains_forbidden_window_term(trimmed) {
        return None;
    }
    let rest = trimmed.strip_prefix(MACOS_WINDOW_ID_PREFIX)?;
    let (pid, wid) = rest.split_once('-')?;
    if pid.is_empty() || wid.is_empty() || pid.len() > 8 || wid.len() > 8 {
        return None;
    }
    Some(MacosWindowKey {
        process_id: u32::from_str_radix(pid, 16).ok()?,
        window_number: u32::from_str_radix(wid, 16).ok()?,
    })
}

pub fn contains_forbidden_window_term(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("axuielement") || lower.contains("cgwindow") || lower.contains("hwnd")
}

pub fn closed_window_error() -> PlatformError {
    PlatformError::window_closed("window is closed or no longer valid")
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn focus_denied_without_permission() -> PlatformError {
    PlatformError::focus_denied(ACCESSIBILITY_DENIED_MESSAGE)
}

pub fn looks_like_url(path: &str) -> bool {
    let lower = trim_path(path).to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:")
        || lower.starts_with("file://")
}

pub fn default_scan_roots() -> Vec<ScanRoot> {
    let mut roots = vec![
        ScanRoot {
            path: PathBuf::from("/Applications"),
            source: "common_path",
        },
        ScanRoot {
            path: PathBuf::from("/Applications/Utilities"),
            source: "common_path",
        },
        ScanRoot {
            path: PathBuf::from("/System/Applications"),
            source: "common_path",
        },
        ScanRoot {
            path: PathBuf::from("/System/Applications/Utilities"),
            source: "common_path",
        },
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(ScanRoot {
            path: PathBuf::from(home).join("Applications"),
            source: "common_path",
        });
    }
    roots
}

pub fn scan_app_directories(roots: &[ScanRoot]) -> ScanInstalledAppsResult {
    let started_at = now_utc();
    let mut apps = Vec::new();
    let mut scanned_sources = Vec::new();

    for root in roots {
        if !scanned_sources.iter().any(|source| source == root.source) {
            scanned_sources.push(root.source.to_string());
        }
        collect_apps_in_dir(&root.path, root.source, &mut apps);
    }

    ScanInstalledAppsResult {
        apps: dedup_scanned_apps(apps),
        scanned_sources,
        started_at,
        finished_at: now_utc(),
    }
}

fn collect_apps_in_dir(dir: &Path, source: &str, out: &mut Vec<ScannedApp>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_app_bundle_dir(&path) {
            continue;
        }
        if let Some(app) = scanned_from_bundle(&path, source) {
            if !is_unwanted_shortcut_name(&app.display_name) {
                out.push(app);
            }
        }
    }
}

pub fn is_app_bundle_dir(path: &Path) -> bool {
    path.is_dir() && is_app_bundle_path(&path.to_string_lossy())
}

pub fn read_bundle_info(bundle: &Path) -> Option<BundleInfo> {
    let plist_path = bundle.join("Contents").join("Info.plist");
    let bytes = fs::read(plist_path).ok()?;
    parse_info_plist_bytes(&bytes)
}

pub fn executable_path_for_bundle(bundle: &Path, info: Option<&BundleInfo>) -> Option<PathBuf> {
    let exec_name = info
        .and_then(|item| item.executable.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| {
            bundle
                .file_stem()
                .and_then(|value| value.to_str())
                .map(ToOwned::to_owned)
        })?;
    let candidate = bundle.join("Contents").join("MacOS").join(exec_name);
    candidate.is_file().then_some(candidate)
}

fn scanned_from_bundle(bundle: &Path, source: &str) -> Option<ScannedApp> {
    let fallback = display_name_from_path(&bundle.to_string_lossy());
    let info = read_bundle_info(bundle);
    let display_name = info
        .as_ref()
        .map(|item| item.resolved_display_name(&fallback))
        .unwrap_or(fallback);
    let launch_target = bundle.to_string_lossy().replace('\\', "/");
    let executable_path = executable_path_for_bundle(bundle, info.as_ref())
        .map(|path| path.to_string_lossy().replace('\\', "/"));
    Some(ScannedApp {
        normalized_name: normalized_display_name(&display_name),
        display_name,
        app_type: "native_app".to_string(),
        platform: "macos".to_string(),
        source: source.to_string(),
        launch_target: launch_target.clone(),
        launch_args: None,
        working_dir: None,
        publisher: info.as_ref().and_then(|item| item.identifier.clone()),
        version: info.as_ref().and_then(|item| item.version.clone()),
        install_location: Some(launch_target.clone()),
        executable_path,
        scan_fingerprint: macos_scan_fingerprint(&launch_target),
    })
}

pub fn resolve_existing_launch_target(path: &str) -> Result<ResolvedMacosTarget, PlatformError> {
    let trimmed = trim_path(path);
    if trimmed.is_empty() {
        return Err(PlatformError::invalid_target("path is required"));
    }
    if looks_like_url(trimmed) {
        return Err(PlatformError::invalid_target("url targets are not supported"));
    }

    let fs_path = PathBuf::from(trimmed);
    let bundle = bundle_path_from_input(&fs_path).ok_or_else(|| {
        PlatformError::invalid_target("manual target must be a .app bundle or an executable inside one")
    })?;

    if !bundle.exists() {
        return Err(PlatformError::not_found("target path was not found"));
    }
    if !is_app_bundle_dir(&bundle) {
        return Err(PlatformError::invalid_target(
            "manual target must be a .app bundle or an executable inside one",
        ));
    }

    if is_macos_inner_executable_input(&fs_path) && !fs_path.is_file() {
        return Err(if fs_path.exists() {
            PlatformError::invalid_target("launch target inside the bundle is not an executable")
        } else {
            PlatformError::not_found("target path was not found")
        });
    }

    let fallback = display_name_from_path(&bundle.to_string_lossy());
    let info = read_bundle_info(&bundle);
    let display_name = info
        .as_ref()
        .map(|item| item.resolved_display_name(&fallback))
        .unwrap_or(fallback);
    let executable_path = if is_macos_inner_executable_input(&fs_path) {
        Some(fs_path)
    } else {
        executable_path_for_bundle(&bundle, info.as_ref())
    };

    Ok(ResolvedMacosTarget {
        bundle_path: bundle,
        executable_path,
        display_name,
    })
}

pub fn resolve_manual_app_target(path: &str) -> Result<ResolvedManualAppTarget, PlatformError> {
    let resolved = resolve_existing_launch_target(path)?;
    let launch_target = resolved.bundle_path.to_string_lossy().replace('\\', "/");
    let executable_path = resolved
        .executable_path
        .as_ref()
        .map(|item| item.to_string_lossy().replace('\\', "/"));
    Ok(ResolvedManualAppTarget {
        display_name: resolved.display_name,
        app_type: "native_app".to_string(),
        source: "manual".to_string(),
        executable_path,
        scan_fingerprint: macos_manual_fingerprint(&launch_target),
        launch_target,
        platform: "macos".to_string(),
    })
}

fn bundle_path_from_input(path: &Path) -> Option<PathBuf> {
    if is_app_bundle_path(&path.to_string_lossy()) {
        return Some(path.to_path_buf());
    }
    for ancestor in path.ancestors() {
        if is_app_bundle_path(&ancestor.to_string_lossy()) {
            return Some(ancestor.to_path_buf());
        }
    }
    None
}

fn is_macos_inner_executable_input(path: &Path) -> bool {
    crate::platform::rules::is_macos_bundle_executable(&path.to_string_lossy())
}

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn window_belongs_to_app(
    process_path: Option<&str>,
    bundle_path: &Path,
    executable_path: Option<&Path>,
) -> bool {
    let Some(process_path) = process_path else {
        return false;
    };
    let process = normalize_macos_path(process_path);
    if let Some(executable) = executable_path {
        if process == normalize_macos_path(&executable.to_string_lossy()) {
            return true;
        }
    }
    let bundle = normalize_macos_path(&bundle_path.to_string_lossy());
    process == bundle || process.starts_with(&format!("{bundle}/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::PlatformErrorCode;
    use std::io::Write;

    fn write_xml_plist(dir: &Path, xml: &str) {
        let contents = dir.join("Contents");
        fs::create_dir_all(contents.join("MacOS")).unwrap();
        fs::write(contents.join("Info.plist"), xml).unwrap();
    }

    #[test]
    fn permission_copy_points_at_system_settings() {
        let message = accessibility_denied_message();
        assert!(message.contains("辅助功能") || message.contains("系统设置"));
        assert!(message.contains("系统设置"));
        assert!(message.contains("辅助功能"));
    }

    #[test]
    fn opaque_ids_never_mention_ax_or_cg() {
        let id = encode_macos_window_id(512, 0x2a);
        assert!(id.starts_with("macwin:"));
        assert!(!contains_forbidden_window_term(&id));
        let decoded = decode_macos_window_id(&id).unwrap();
        assert_eq!(decoded.process_id, 512);
        assert_eq!(decoded.window_number, 0x2a);
        assert!(decode_macos_window_id("AXUIElement:1").is_none());
        assert!(decode_macos_window_id("cgwindow:9").is_none());
        assert!(decode_macos_window_id("macwin:").is_none());
        assert!(decode_macos_window_id("win:1").is_none());
    }

    #[test]
    fn resolve_requires_app_bundle() {
        let err = resolve_existing_launch_target("").unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::InvalidTarget);

        let err = resolve_existing_launch_target("https://example.com").unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::InvalidTarget);

        let err = resolve_existing_launch_target("/tmp/notes.txt").unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::InvalidTarget);

        let err = resolve_existing_launch_target("/Applications/Missing Demo.app").unwrap_err();
        assert_eq!(err.code, PlatformErrorCode::NotFound);
    }

    #[test]
    fn resolve_reads_fixture_bundle() {
        let dir = tempfile::tempdir().unwrap();
        let bundle = dir.path().join("Demo App.app");
        write_xml_plist(
            &bundle,
            r#"<dict>
                <key>CFBundleDisplayName</key>
                <string>Demo App</string>
                <key>CFBundleExecutable</key>
                <string>DemoApp</string>
            </dict>"#,
        );
        let exec = bundle.join("Contents").join("MacOS").join("DemoApp");
        fs::File::create(&exec).unwrap().write_all(b"mz").unwrap();

        let resolved = resolve_manual_app_target(&bundle.to_string_lossy()).unwrap();
        assert_eq!(resolved.display_name, "Demo App");
        assert_eq!(resolved.app_type, "native_app");
        assert_eq!(resolved.platform, "macos");
        assert_eq!(resolved.source, "manual");
        assert!(resolved
            .executable_path
            .as_deref()
            .unwrap()
            .replace('\\', "/")
            .ends_with("Contents/MacOS/DemoApp"));
    }

    #[test]
    fn scan_reads_xml_and_skips_binary_plist() {
        let dir = tempfile::tempdir().unwrap();
        let good = dir.path().join("Good.app");
        write_xml_plist(
            &good,
            r#"<dict><key>CFBundleName</key><string>Good App</string>
            <key>CFBundleExecutable</key><string>Good</string></dict>"#,
        );
        fs::File::create(good.join("Contents").join("MacOS").join("Good"))
            .unwrap()
            .write_all(b"ok")
            .unwrap();

        let bad = dir.path().join("Binary.app");
        fs::create_dir_all(bad.join("Contents").join("MacOS")).unwrap();
        fs::write(bad.join("Contents").join("Info.plist"), b"bplist00\x01").unwrap();

        let scanned = scan_app_directories(&[ScanRoot {
            path: dir.path().to_path_buf(),
            source: "common_path",
        }]);
        assert_eq!(scanned.apps.len(), 2);
        let good_app = scanned
            .apps
            .iter()
            .find(|app| app.launch_target.replace('\\', "/").contains("Good.app"))
            .unwrap();
        assert_eq!(good_app.display_name, "Good App");
        assert_eq!(good_app.platform, "macos");
        assert_eq!(good_app.app_type, "native_app");
        assert_eq!(good_app.source, "common_path");
        assert!(good_app.executable_path.is_some());

        let binary_app = scanned
            .apps
            .iter()
            .find(|app| app.launch_target.replace('\\', "/").contains("Binary.app"))
            .unwrap();
        assert_eq!(binary_app.display_name, "Binary");
        assert!(binary_app.executable_path.is_none());
    }
}
