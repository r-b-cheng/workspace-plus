use std::collections::HashMap;

use windows::Win32::Foundation::{BOOL, CloseHandle, HWND, LPARAM};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, BringWindowToTop, EnumWindows, GetAncestor, GetForegroundWindow,
    GetWindow, GetWindowLongPtrW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow,
    IsWindowVisible, SetForegroundWindow, ShowWindow, ASFW_ANY, GA_ROOT, GW_OWNER, GWL_EXSTYLE,
    SW_RESTORE, SW_SHOW, WS_EX_TOOLWINDOW,
};

use crate::platform::rules::{decode_opaque_window_id, encode_opaque_window_id};
use crate::platform::{FocusWindowResult, PlatformError, PlatformWindow};

pub fn list_top_level_windows() -> Result<Vec<PlatformWindow>, PlatformError> {
    let self_pid = std::process::id();
    let mut hwnds = Vec::new();
    unsafe {
        EnumWindows(Some(enum_windows_proc), LPARAM((&mut hwnds as *mut Vec<HWND>) as isize))
            .map_err(|err| PlatformError::internal(format!("failed to enumerate windows: {err}")))?;
    }

    let mut path_cache = HashMap::new();
    let mut windows = Vec::new();
    for hwnd in hwnds {
        if let Some(window) = describe_window(hwnd, self_pid, &mut path_cache) {
            windows.push(window);
        }
    }
    Ok(windows)
}

pub fn focus_window(native_window_id: &str) -> Result<FocusWindowResult, PlatformError> {
    let hwnd = hwnd_from_opaque_id(native_window_id)?;
    unsafe {
        if !IsWindow(hwnd).as_bool() {
            return Err(PlatformError::window_closed("window is closed or no longer valid"));
        }

        let mut restored = false;
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            restored = true;
        }

        if try_set_foreground(hwnd) {
            return Ok(FocusWindowResult {
                focused: true,
                restored,
            });
        }
    }
    Err(PlatformError::focus_denied(
        "the system refused to bring this window to the foreground",
    ))
}

pub fn request_close_window(native_window_id: &str) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
    use windows::Win32::Foundation::{LPARAM, WPARAM};

    let Ok(hwnd) = hwnd_from_opaque_id(native_window_id) else {
        return false;
    };
    unsafe { PostMessageW(hwnd, WM_CLOSE, WPARAM(0), LPARAM(0)).is_ok() }
}

fn hwnd_from_opaque_id(native_window_id: &str) -> Result<HWND, PlatformError> {
    let handle = decode_opaque_window_id(native_window_id)
        .ok_or_else(|| PlatformError::window_closed("window is closed or no longer valid"))?;
    Ok(HWND(handle as *mut core::ffi::c_void))
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let collected = &mut *(lparam.0 as *mut Vec<HWND>);
    if is_candidate_window(hwnd) {
        collected.push(hwnd);
    }
    BOOL(1)
}

unsafe fn is_candidate_window(hwnd: HWND) -> bool {
    if !IsWindow(hwnd).as_bool() {
        return false;
    }
    if !IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() {
        return false;
    }
    if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
        if !owner.0.is_null() {
            return false;
        }
    }
    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    if ex_style & WS_EX_TOOLWINDOW.0 as isize != 0 {
        return false;
    }
    let mut title = [0u16; 512];
    let len = GetWindowTextW(hwnd, &mut title);
    if len <= 0 {
        return false;
    }
    let title = String::from_utf16_lossy(&title[..len as usize]);
    if title.eq_ignore_ascii_case("Program Manager") {
        return false;
    }
    true
}

fn describe_window(
    hwnd: HWND,
    self_pid: u32,
    path_cache: &mut HashMap<u32, Option<String>>,
) -> Option<PlatformWindow> {
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(hwnd, Some(&mut pid)) };
    if pid == 0 || pid == self_pid {
        return None;
    }

    let mut title_buf = [0u16; 512];
    let len = unsafe { GetWindowTextW(hwnd, &mut title_buf) };
    if len <= 0 {
        return None;
    }
    let title = String::from_utf16_lossy(&title_buf[..len as usize]);
    let process_path = path_cache
        .entry(pid)
        .or_insert_with(|| query_process_path(pid))
        .clone();

    Some(PlatformWindow {
        native_window_id: encode_opaque_window_id(hwnd.0 as usize),
        process_id: Some(pid),
        title,
        process_path,
    })
}

fn query_process_path(pid: u32) -> Option<String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);
        ok.ok()?;
        let end = buf.iter().position(|&unit| unit == 0).unwrap_or(size as usize);
        let path = String::from_utf16_lossy(&buf[..end]);
        if path.is_empty() {
            None
        } else {
            Some(path)
        }
    }
}

unsafe fn try_set_foreground(hwnd: HWND) -> bool {
    let _ = AllowSetForegroundWindow(ASFW_ANY);
    let foreground = GetForegroundWindow();
    let mut fg_pid = 0u32;
    let fg_tid = GetWindowThreadProcessId(foreground, Some(&mut fg_pid));
    let mut target_pid = 0u32;
    let target_tid = GetWindowThreadProcessId(hwnd, Some(&mut target_pid));
    let current_tid = GetCurrentThreadId();

    let attached_fg = fg_tid != 0
        && fg_tid != current_tid
        && AttachThreadInput(current_tid, fg_tid, true).as_bool();
    let attached_target = target_tid != 0
        && target_tid != current_tid
        && target_tid != fg_tid
        && AttachThreadInput(current_tid, target_tid, true).as_bool();

    let _ = BringWindowToTop(hwnd);
    let _ = ShowWindow(hwnd, SW_SHOW);
    let _ = SetForegroundWindow(hwnd);

    if attached_target {
        let _ = AttachThreadInput(current_tid, target_tid, false);
    }
    if attached_fg {
        let _ = AttachThreadInput(current_tid, fg_tid, false);
    }

    window_is_foreground(hwnd)
}

unsafe fn window_is_foreground(hwnd: HWND) -> bool {
    let foreground = GetForegroundWindow();
    if hwnd_eq(foreground, hwnd) {
        return true;
    }
    hwnd_eq(GetAncestor(foreground, GA_ROOT), hwnd)
}

fn hwnd_eq(left: HWND, right: HWND) -> bool {
    left.0 == right.0
}
