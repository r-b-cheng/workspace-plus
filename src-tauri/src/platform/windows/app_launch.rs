use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::GetProcessId;
use windows::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::platform::rules::{
    classify_launch_path, launch_result_from_parts, normalize_windows_path, trim_path, LaunchKind,
};
use crate::platform::windows::window_ops;
use crate::platform::windows::run_sta;
use crate::platform::{LaunchAppRequest, LaunchResult, PlatformError, PlatformWindow};

const CREATE_UNICODE_ENVIRONMENT: u32 = 0x0000_0400;
const WINDOW_MATCH_TIMEOUT: Duration = Duration::from_millis(800);

pub fn launch_app(request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError> {
    let target = trim_path(&request.launch_target).to_string();
    let display_name = request.display_name.clone();
    let kind = classify_launch_path(&target)?;
    let path = Path::new(&target);
    if !path.is_file() {
        return Err(PlatformError::not_found("launch target was not found"));
    }

    let started = run_sta({
        let target = target.clone();
        move || start_process(kind, &target)
    })?;

    let window = wait_for_matching_window(
        started.pid,
        started.process_path.as_deref().or(Some(target.as_str())),
        &display_name,
        WINDOW_MATCH_TIMEOUT,
    );
    Ok(launch_result_from_parts(
        started.pid,
        started.process_path,
        window,
    ))
}

struct StartedProcess {
    pid: Option<u32>,
    process_path: Option<String>,
}

fn start_process(kind: LaunchKind, target: &str) -> Result<StartedProcess, PlatformError> {
    match kind {
        LaunchKind::Shortcut => shell_execute(target, None),
        LaunchKind::Executable => match spawn_executable(target) {
            Ok(started) => Ok(started),
            Err(spawn_err) => shell_execute(target, Some(spawn_err)),
        },
    }
}

fn spawn_executable(path: &str) -> Result<StartedProcess, PlatformError> {
    let mut command = Command::new(path);
    if let Some(dir) = Path::new(path).parent() {
        command.current_dir(dir);
    }
    command.creation_flags(CREATE_UNICODE_ENVIRONMENT);
    match command.spawn() {
        Ok(child) => {
            let pid = child.id();
            Ok(StartedProcess {
                pid: Some(pid),
                process_path: Some(path.to_string()),
            })
        }
        Err(err) => Err(map_io_launch_error(err)),
    }
}

fn shell_execute(
    path: &str,
    fallback_from: Option<PlatformError>,
) -> Result<StartedProcess, PlatformError> {
    let wide = wide_null(path);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
        lpVerb: windows::core::w!("open"),
        lpFile: PCWSTR(wide.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };

    let result = unsafe { ShellExecuteExW(&mut info) };
    if let Err(err) = result {
        if let Some(previous) = fallback_from {
            return Err(previous);
        }
        if err.code().0 as u32 == 0x8007_0002 {
            return Err(PlatformError::not_found("shortcut target was not found"));
        }
        return Err(PlatformError::launch_failed(
            "系统拒绝启动该软件，请确认路径仍然有效。",
        ));
    }

    let pid = unsafe { take_process_id(info.hProcess) };
    Ok(StartedProcess {
        pid,
        process_path: None,
    })
}

unsafe fn take_process_id(handle: HANDLE) -> Option<u32> {
    if handle.is_invalid() || handle.0.is_null() {
        return None;
    }
    let pid = GetProcessId(handle);
    let _ = CloseHandle(handle);
    if pid == 0 {
        None
    } else {
        Some(pid)
    }
}

fn wait_for_matching_window(
    pid: Option<u32>,
    exe_hint: Option<&str>,
    display_name: &str,
    timeout: Duration,
) -> Option<PlatformWindow> {
    let started = Instant::now();
    let exe_hint = exe_hint.map(normalize_windows_path);
    let name = display_name.trim().to_lowercase();
    loop {
        if let Ok(windows) = window_ops::list_top_level_windows() {
            if let Some(window) = pick_matching_window(&windows, pid, exe_hint.as_deref(), &name) {
                return Some(window);
            }
        }
        if started.elapsed() >= timeout {
            return None;
        }
        thread::sleep(Duration::from_millis(80));
    }
}

fn pick_matching_window(
    windows: &[PlatformWindow],
    pid: Option<u32>,
    exe_hint: Option<&str>,
    display_name: &str,
) -> Option<PlatformWindow> {
    if let Some(pid) = pid {
        if let Some(window) = windows.iter().find(|window| window.process_id == Some(pid)) {
            return Some(window.clone());
        }
    }
    if let Some(exe) = exe_hint {
        if let Some(window) = windows.iter().find(|window| {
            window
                .process_path
                .as_deref()
                .map(normalize_windows_path)
                .as_deref()
                == Some(exe)
        }) {
            return Some(window.clone());
        }
    }
    if !display_name.is_empty() {
        if let Some(window) = windows.iter().find(|window| {
            window.title.to_lowercase().contains(display_name)
                && (pid.is_some() && window.process_id == pid
                    || exe_hint.is_some()
                        && window
                            .process_path
                            .as_deref()
                            .map(normalize_windows_path)
                            .as_deref()
                            == exe_hint)
        }) {
            return Some(window.clone());
        }
    }
    None
}

fn map_io_launch_error(err: std::io::Error) -> PlatformError {
    match err.kind() {
        std::io::ErrorKind::NotFound => PlatformError::not_found("executable was not found"),
        std::io::ErrorKind::PermissionDenied => PlatformError::new(
            crate::platform::PlatformErrorCode::PermissionDenied,
            "权限不足，无法启动该软件。",
        ),
        _ => PlatformError::launch_failed(format!("failed to launch executable: {err}")),
    }
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
