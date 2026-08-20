use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use windows::core::{Interface, PCWSTR};
use windows::Win32::System::Com::{CoCreateInstance, IPersistFile, CLSCTX_INPROC_SERVER, STGM_READ};
use windows::Win32::System::Com::CoTaskMemFree;
use windows::Win32::Storage::FileSystem::WIN32_FIND_DATAW;
use windows::Win32::UI::Shell::{
    IShellLinkW, SHGetKnownFolderPath, ShellLink, FOLDERID_CommonStartMenu, FOLDERID_StartMenu,
    KF_FLAG_DEFAULT, SLGP_RAWPATH,
};
use windows::Win32::Foundation::HANDLE;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

use crate::platform::rules::{
    clean_display_icon, dedup_scanned_apps, expand_env_strings, is_executable_path,
    is_unwanted_shortcut_name, normalize_windows_path, normalized_display_name, scan_fingerprint,
};
use crate::platform::{PlatformError, ScanInstalledAppsResult, ScannedApp};
use crate::storage::now_utc;

const MAX_WALK_DEPTH: usize = 8;

#[derive(Clone, Debug)]
struct ResolvedShortcut {
    lnk_path: PathBuf,
    display_name: String,
    target_path: String,
    args: Option<String>,
    working_dir: Option<String>,
}

#[derive(Clone, Debug)]
struct UninstallMeta {
    display_name: String,
    publisher: Option<String>,
    version: Option<String>,
    install_location: Option<String>,
    display_icon: Option<String>,
}

pub fn scan_start_menu_apps() -> Result<ScanInstalledAppsResult, PlatformError> {
    let started_at = now_utc();
    let mut scanned_sources = vec!["start_menu".to_string()];
    let mut seen_lnk = HashSet::new();
    let mut resolved = Vec::new();

    for folder in start_menu_roots() {
        collect_lnk_files(&folder, 0, &mut seen_lnk, &mut resolved);
    }

    let uninstall = read_uninstall_entries();
    if !uninstall.is_empty() {
        scanned_sources.push("registry_uninstall".to_string());
    }

    let mut apps = Vec::new();
    for item in resolved {
        if is_unwanted_shortcut_name(&item.display_name) {
            continue;
        }
        if !is_executable_path(&item.target_path) {
            continue;
        }
        if !Path::new(&item.target_path).is_file() {
            continue;
        }

        let args = item.args.as_deref().map(str::trim).filter(|value| !value.is_empty());
        let working_dir = item
            .working_dir
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let launch_target = item.lnk_path.to_string_lossy().into_owned();
        let exe = item.target_path.clone();
        let mut app = ScannedApp {
            display_name: item.display_name.clone(),
            normalized_name: normalized_display_name(&item.display_name),
            app_type: "shortcut".to_string(),
            platform: "windows".to_string(),
            source: "start_menu".to_string(),
            launch_target: launch_target.clone(),
            launch_args: args.map(ToOwned::to_owned),
            working_dir,
            publisher: None,
            version: None,
            install_location: Path::new(&exe)
                .parent()
                .map(|parent| parent.to_string_lossy().into_owned()),
            executable_path: Some(exe.clone()),
            scan_fingerprint: scan_fingerprint(Some(&exe), &launch_target, args),
        };
        enrich_from_uninstall(&mut app, &uninstall);
        apps.push(app);
    }

    let apps = dedup_scanned_apps(apps);
    Ok(ScanInstalledAppsResult {
        apps,
        scanned_sources,
        started_at,
        finished_at: now_utc(),
    })
}

fn start_menu_roots() -> Vec<PathBuf> {
    [FOLDERID_StartMenu, FOLDERID_CommonStartMenu]
        .into_iter()
        .filter_map(|id| known_folder(&id))
        .collect()
}

fn known_folder(id: &windows::core::GUID) -> Option<PathBuf> {
    unsafe {
        let pwstr = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, HANDLE::default()).ok()?;
        let path = pwstr.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(pwstr.as_ptr().cast()));
        path.filter(|item| item.is_dir())
    }
}

fn collect_lnk_files(
    root: &Path,
    depth: usize,
    seen: &mut HashSet<String>,
    out: &mut Vec<ResolvedShortcut>,
) {
    if depth > MAX_WALK_DEPTH {
        return;
    }
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(err) => {
            tracing::debug!(path = %root.display(), error = %err, "start menu folder skipped");
            return;
        }
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_lnk_files(&path, depth + 1, seen, out);
            continue;
        }
        let is_lnk = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false);
        if !is_lnk {
            continue;
        }
        let key = normalize_windows_path(&path.to_string_lossy());
        if !seen.insert(key) {
            continue;
        }
        match resolve_shortcut(&path) {
            Ok(resolved) => out.push(resolved),
            Err(err) => tracing::debug!(path = %path.display(), error = %err, "shortcut skipped"),
        }
    }
}

fn resolve_shortcut(path: &Path) -> Result<ResolvedShortcut, PlatformError> {
    let wide = path_to_wide(path);
    let link: IShellLinkW = unsafe {
        CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(|err| {
            PlatformError::internal(format!("failed to create shell link: {err}"))
        })?
    };
    let persist: IPersistFile = link
        .cast()
        .map_err(|err| PlatformError::invalid_target(format!("shortcut is not persistable: {err}")))?;
    unsafe {
        persist
            .Load(PCWSTR(wide.as_ptr()), STGM_READ)
            .map_err(|_| PlatformError::invalid_target("shortcut could not be read"))?;
    }

    let mut target = [0u16; 1024];
    let mut find_data = WIN32_FIND_DATAW::default();
    unsafe {
        link.GetPath(&mut target, &mut find_data, SLGP_RAWPATH.0 as u32)
            .map_err(|_| PlatformError::invalid_target("shortcut target is missing"))?;
    }
    let target_path = expand_env_strings(&from_wide(&target));
    if target_path.is_empty() {
        return Err(PlatformError::invalid_target("shortcut has no executable target"));
    }

    let mut args_buf = [0u16; 1024];
    let mut dir_buf = [0u16; 1024];
    let mut desc_buf = [0u16; 512];
    let _ = unsafe { link.GetArguments(&mut args_buf) };
    let _ = unsafe { link.GetWorkingDirectory(&mut dir_buf) };
    let _ = unsafe { link.GetDescription(&mut desc_buf) };

    let args = nonempty(from_wide(&args_buf));
    let working_dir = nonempty(expand_env_strings(&from_wide(&dir_buf)));
    let description = nonempty(from_wide(&desc_buf));
    let display_name = path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or(description)
        .unwrap_or_else(|| "Application".to_string());

    Ok(ResolvedShortcut {
        lnk_path: path.to_path_buf(),
        display_name,
        target_path,
        args,
        working_dir,
    })
}

fn read_uninstall_entries() -> Vec<UninstallMeta> {
    const KEYS: &[(winreg::HKEY, &str)] = &[
        (
            HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
        (
            HKEY_LOCAL_MACHINE,
            r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ),
    ];

    let mut out = Vec::new();
    for (hive, path) in KEYS {
        let Ok(root) = RegKey::predef(*hive).open_subkey(path) else {
            continue;
        };
        for name in root.enum_keys().flatten() {
            let Ok(sub) = root.open_subkey(&name) else {
                continue;
            };
            let display_name: String = match sub.get_value("DisplayName") {
                Ok(value) => value,
                Err(_) => continue,
            };
            let publisher = sub.get_value("Publisher").ok();
            let version = sub.get_value("DisplayVersion").ok();
            let install_location = sub
                .get_value::<String, _>("InstallLocation")
                .ok()
                .map(|value| expand_env_strings(value.trim()))
                .filter(|value| !value.is_empty());
            let display_icon = sub
                .get_value::<String, _>("DisplayIcon")
                .ok()
                .and_then(|value| clean_display_icon(&value));
            out.push(UninstallMeta {
                display_name,
                publisher,
                version,
                install_location,
                display_icon,
            });
        }
    }
    out
}

fn enrich_from_uninstall(app: &mut ScannedApp, metas: &[UninstallMeta]) {
    let Some(meta) = find_uninstall_meta(
        app.executable_path.as_deref(),
        &app.display_name,
        metas,
    ) else {
        return;
    };
    if app.publisher.is_none() {
        app.publisher = meta.publisher.clone();
    }
    if app.version.is_none() {
        app.version = meta.version.clone();
    }
    if app.install_location.is_none() {
        app.install_location = meta.install_location.clone();
    }
}

fn find_uninstall_meta<'a>(
    exe: Option<&str>,
    display_name: &str,
    metas: &'a [UninstallMeta],
) -> Option<&'a UninstallMeta> {
    if let Some(exe) = exe.map(normalize_windows_path) {
        if let Some(matched) = metas.iter().find(|meta| {
            meta.display_icon
                .as_ref()
                .map(|icon| normalize_windows_path(icon) == exe)
                .unwrap_or(false)
        }) {
            return Some(matched);
        }

        let mut best: Option<(&UninstallMeta, usize)> = None;
        for meta in metas {
            if let Some(location) = &meta.install_location {
                let location = normalize_windows_path(location);
                if !location.is_empty() && exe.starts_with(&location) {
                    let score = location.len();
                    if best.as_ref().map(|(_, current)| score > *current).unwrap_or(true) {
                        best = Some((meta, score));
                    }
                }
            }
        }
        if let Some((meta, _)) = best {
            return Some(meta);
        }
    }

    let name = display_name.trim().to_lowercase();
    metas
        .iter()
        .find(|meta| meta.display_name.trim().to_lowercase() == name)
}

pub(crate) fn resolve_shortcut_target(path: &Path) -> Result<ResolvedShortcutPublic, PlatformError> {
    let resolved = resolve_shortcut(path)?;
    Ok(ResolvedShortcutPublic {
        display_name: resolved.display_name,
        target_path: resolved.target_path,
    })
}

pub(crate) struct ResolvedShortcutPublic {
    pub display_name: String,
    pub target_path: String,
}

fn path_to_wide(path: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn from_wide(buf: &[u16]) -> String {
    let end = buf.iter().position(|&unit| unit == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn nonempty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

