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
    classify_launch_path, extra_new_instance_args, is_executable_path, launch_result_from_parts,
    normalize_windows_path, pick_best_matching_window, split_launch_args, trim_path, LaunchKind,
    WindowMatchHint,
};
use crate::platform::windows::window_ops;
use crate::platform::windows::run_sta;
use crate::platform::{LaunchAppRequest, LaunchResult, PlatformError, PlatformWindow};

const CREATE_UNICODE_ENVIRONMENT: u32 = 0x0000_0400;
const WINDOW_MATCH_TIMEOUT: Duration = Duration::from_millis(1800);

pub fn launch_app(request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError> {
    let target = trim_path(&request.launch_target).to_string();
    let display_name = request.display_name.clone();
    let kind = classify_launch_path(&target)?;
    let path = Path::new(&target);
    if !path.is_file() {
        return Err(PlatformError::not_found("launch target was not found"));
    }

    let existing_window_ids = snapshot_window_ids();
    let requested_args = request.launch_args.clone();

    let (started, resolved_exe) = run_sta({
        let target = target.clone();
        move || {
            let resolved_exe = match kind {
                LaunchKind::Executable => Some(target.clone()),
                LaunchKind::Shortcut => super::app_scan::resolve_shortcut_target(Path::new(&target))
                    .ok()
                    .map(|resolved| resolved.target_path)
                    .filter(|path| is_executable_path(path)),
            };
            let mut args = split_launch_args(requested_args.as_deref());
            args.extend(extra_new_instance_args(
                resolved_exe.as_deref(),
                &args.join(" "),
            ));
            let started = start_process(kind, &target, &args, resolved_exe.as_deref())?;
            Ok((started, resolved_exe))
        }
    })?;

    let exe_hint = started
        .process_path
        .clone()
        .filter(|path| is_executable_path(path))
        .or(resolved_exe);

    let window = wait_for_matching_window(
        started.pid,
        exe_hint.as_deref(),
        &display_name,
        existing_window_ids,
        WINDOW_MATCH_TIMEOUT,
    );
    Ok(launch_result_from_parts(
        started.pid,
        started.process_path.or(exe_hint),
        window,
    ))
}

struct StartedProcess {
    pid: Option<u32>,
    process_path: Option<String>,
}

fn start_process(
    kind: LaunchKind,
    target: &str,
    args: &[String],
    resolved_exe: Option<&str>,
) -> Result<StartedProcess, PlatformError> {
    match kind {
        LaunchKind::Shortcut => {
            if !args.is_empty() {
                if let Some(exe) = resolved_exe {
                    return spawn_executable(exe, args)
                        .or_else(|spawn_err| shell_execute(target, Some(spawn_err), args));
                }
            }
            shell_execute(target, None, args)
        }
        LaunchKind::Executable => match spawn_executable(target, args) {
            Ok(started) => Ok(started),
            Err(spawn_err) => shell_execute(target, Some(spawn_err), args),
        },
    }
}

fn spawn_executable(path: &str, args: &[String]) -> Result<StartedProcess, PlatformError> {
    let mut command = Command::new(path);
    if let Some(dir) = Path::new(path).parent() {
        command.current_dir(dir);
    }
    command.args(args);
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
    args: &[String],
) -> Result<StartedProcess, PlatformError> {
    let wide = wide_null(path);
    let params = if args.is_empty() {
        None
    } else {
        Some(wide_null(&join_windows_args(args)))
    };
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
        lpVerb: windows::core::w!("open"),
        lpFile: PCWSTR(wide.as_ptr()),
        lpParameters: params
            .as_ref()
            .map(|value| PCWSTR(value.as_ptr()))
            .unwrap_or(PCWSTR::null()),
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

fn snapshot_window_ids() -> Vec<String> {
    window_ops::list_top_level_windows()
        .unwrap_or_default()
        .into_iter()
        .map(|window| window.native_window_id)
        .collect()
}

fn join_windows_args(args: &[String]) -> String {
    args.iter()
        .map(|arg| {
            if arg.chars().any(|ch| ch.is_whitespace() || ch == '"') {
                format!("\"{}\"", arg.replace('"', "\\\""))
            } else {
                arg.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn wait_for_matching_window(
    pid: Option<u32>,
    exe_hint: Option<&str>,
    display_name: &str,
    exclude_window_ids: Vec<String>,
    timeout: Duration,
) -> Option<PlatformWindow> {
    let started = Instant::now();
    let hint = WindowMatchHint {
        process_id: pid,
        executable_path: exe_hint.map(normalize_windows_path),
        display_name: display_name.to_string(),
        exclude_window_ids,
        ..WindowMatchHint::default()
    };
    loop {
        if let Ok(windows) = window_ops::list_top_level_windows() {
            if let Some(window) = pick_best_matching_window(&windows, &hint) {
                return Some(window);
            }
        }
        if started.elapsed() >= timeout {
            return None;
        }
        thread::sleep(Duration::from_millis(80));
    }
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
