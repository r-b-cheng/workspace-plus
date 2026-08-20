use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::Threading::{GetProcessId, WaitForInputIdle};
use windows::Win32::UI::Shell::{
    ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::platform::rules::{
    classify_launch_path, launch_result_from_parts, normalize_windows_path, run_with_timeout,
    trim_path, DEFAULT_LAUNCH_TIMEOUT, DEFAULT_WINDOW_MATCH_TIMEOUT, LaunchKind,
};
use crate::platform::windows::window_ops;
use crate::platform::{LaunchAppRequest, LaunchResult, PlatformError, PlatformWindow};

const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

pub fn launch_app(request: &LaunchAppRequest) -> Result<LaunchResult, PlatformError> {
    let target = trim_path(&request.launch_target).to_string();
    let display_name = request.display_name.clone();
    let kind = classify_launch_path(&target)?;
    let path = Path::new(&target);
    if !path.is_file() {
        return Err(PlatformError::not_found("launch target was not found"));
    }

    let target_for_match = target.clone();
    run_with_timeout(DEFAULT_LAUNCH_TIMEOUT, move || {
        let (pid, process_path) = match kind {
            LaunchKind::Executable => spawn_executable(&target)?,
            LaunchKind::Shortcut => shell_execute(&target)?,
        };
        let window = wait_for_matching_window(
            pid,
            process_path.as_deref().or(Some(target_for_match.as_str())),
            &display_name,
            DEFAULT_WINDOW_MATCH_TIMEOUT,
        );
        Ok(launch_result_from_parts(pid, process_path, window))
    })
}

fn spawn_executable(path: &str) -> Result<(Option<u32>, Option<String>), PlatformError> {
    let mut command = Command::new(path);
    if let Some(dir) = Path::new(path).parent() {
        command.current_dir(dir);
    }
    command.creation_flags(CREATE_NEW_PROCESS_GROUP);
    match command.spawn() {
        Ok(child) => {
            let pid = child.id();
            Ok((Some(pid), Some(path.to_string())))
        }
        Err(err) => Err(map_io_launch_error(err)),
    }
}

fn shell_execute(path: &str) -> Result<(Option<u32>, Option<String>), PlatformError> {
    let wide = wide_null(path);
    let mut info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
        lpVerb: windows::core::w!("open"),
        lpFile: PCWSTR(wide.as_ptr()),
        nShow: SW_SHOWNORMAL.0,
        ..Default::default()
    };

    unsafe {
        ShellExecuteExW(&mut info).map_err(|err| {
            if err.code().0 as u32 == 0x8007_0002 {
                PlatformError::not_found("shortcut target was not found")
            } else {
                PlatformError::launch_failed(format!("failed to launch shortcut: {err}"))
            }
        })?;
    }

    let pid = unsafe { take_process_id(info.hProcess) };
    Ok((pid, None))
}

unsafe fn take_process_id(handle: HANDLE) -> Option<u32> {
    if handle.is_invalid() || handle.0.is_null() {
        return None;
    }
    let pid = GetProcessId(handle);
    let _ = WaitForInputIdle(handle, 1500);
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
        thread::sleep(Duration::from_millis(100));
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
            "permission denied while launching",
        ),
        _ => PlatformError::launch_failed(format!("failed to launch executable: {err}")),
    }
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}
