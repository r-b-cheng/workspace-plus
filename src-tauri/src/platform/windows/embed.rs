//! Opt-in HWND reparenting for a single already-bound window.
//!
//! Default `cargo test` must never reach SetParent: mock ids are rejected
//! before any window handle is used.

use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, RECT};
use windows::Win32::Security::{
    GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, TokenIntegrityLevel,
    TOKEN_MANDATORY_LABEL, TOKEN_QUERY,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetClientRect, GetParent, GetWindow, GetWindowLongW, GetWindowRect,
    GetWindowThreadProcessId, IsWindow, MoveWindow, SetParent, SetWindowLongW, SetWindowPos,
    ShowWindow, GW_CHILD, GW_HWNDNEXT, GW_OWNER, GWL_EXSTYLE, GWL_STYLE, SWP_FRAMECHANGED,
    SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SWP_SHOWWINDOW, SW_SHOW, WS_CHILD,
    WS_POPUP,
};

use super::window_ops::hwnd_from_opaque_id;
use crate::platform::rules::decode_opaque_window_id;

#[derive(Clone, Debug)]
pub struct EmbedRestoreInfo {
    pub opaque_window_id: String,
    pub original_style: i32,
    pub original_ex_style: i32,
    pub original_parent: isize,
}

pub fn reject_reason_for_opaque_id(opaque_window_id: &str) -> Option<&'static str> {
    if opaque_window_id.starts_with("mock:") {
        return Some("该窗口无法在本窗口预览，已改回切换真实窗口。");
    }
    if decode_opaque_window_id(opaque_window_id).is_none() {
        return Some("无法识别该窗口，不能在本窗口预览。");
    }
    None
}

pub fn reject_reason_for_class_name(class_name: &str) -> Option<&'static str> {
    let class_name = class_name.trim();
    if class_name.eq_ignore_ascii_case("ApplicationFrameWindow")
        || class_name.eq_ignore_ascii_case("Windows.UI.Core.CoreWindow")
        || class_name.eq_ignore_ascii_case("ApplicationFrameTitleBarWindow")
    {
        return Some("UWP 窗口无法在本窗口预览。");
    }
    if class_name.starts_with("Chrome_WidgetWin")
        || class_name.eq_ignore_ascii_case("Chrome_RenderWidgetHostHWND")
        || class_name.starts_with("Chrome_WidgetWin_")
    {
        return Some("浏览器或 Electron 窗口无法在本窗口预览。");
    }
    None
}

pub fn reparent_to_host(
    opaque_window_id: &str,
    host_hwnd: isize,
    bounds: Option<(i32, i32, i32, i32)>,
) -> Result<EmbedRestoreInfo, String> {
    if let Some(reason) = reject_reason_for_opaque_id(opaque_window_id) {
        return Err(reason.to_string());
    }
    if host_hwnd == 0 {
        return Err("没有可用的宿主窗口，无法预览。".into());
    }

    let hwnd = hwnd_from_opaque_id(opaque_window_id)
        .map_err(|_| "窗口已关闭或无效，无法预览。".to_string())?;
    unsafe {
        if !IsWindow(hwnd).as_bool() {
            return Err("窗口已关闭或无效，无法预览。".into());
        }

        if let Some(reason) = reject_reason_for_class_name(&window_class_name(hwnd)) {
            return Err(reason.to_string());
        }

        if let Ok(owner) = GetWindow(hwnd, GW_OWNER) {
            if !owner.0.is_null() {
                return Err("该窗口由其他窗口拥有，无法在本窗口预览。".into());
            }
        }

        if let Some(reason) = reject_reason_for_integrity(hwnd) {
            return Err(reason);
        }

        let original_style = GetWindowLongW(hwnd, GWL_STYLE);
        let original_ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        let original_parent = GetParent(hwnd)
            .map(|parent| parent.0 as isize)
            .unwrap_or(0);

        let style = original_style as u32;
        let new_style = (style & !WS_POPUP.0) | WS_CHILD.0;
        SetWindowLongW(hwnd, GWL_STYLE, new_style as i32);

        let host = HWND(host_hwnd as *mut core::ffi::c_void);
        let parented = SetParent(hwnd, host).is_ok()
            && GetParent(hwnd)
                .map(|parent| parent.0 == host.0)
                .unwrap_or(false);
        if !parented {
            SetWindowLongW(hwnd, GWL_STYLE, original_style);
            SetWindowLongW(hwnd, GWL_EXSTYLE, original_ex_style);
            return Err("无法把窗口放到本产品客户区。".into());
        }

        apply_host_bounds(hwnd, host, bounds, true);
        let _ = SetWindowPos(
            hwnd,
            HWND::default(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
        );
        let _ = ShowWindow(hwnd, SW_SHOW);

        Ok(EmbedRestoreInfo {
            opaque_window_id: opaque_window_id.to_string(),
            original_style,
            original_ex_style,
            original_parent,
        })
    }
}

pub fn restore_embedded_window(info: &EmbedRestoreInfo) -> Result<(), String> {
    if reject_reason_for_opaque_id(&info.opaque_window_id).is_some() {
        return Ok(());
    }
    let Ok(hwnd) = hwnd_from_opaque_id(&info.opaque_window_id) else {
        return Ok(());
    };
    unsafe {
        if !IsWindow(hwnd).as_bool() {
            return Ok(());
        }
        let parent = HWND(info.original_parent as *mut core::ffi::c_void);
        let _ = SetParent(hwnd, parent);
        SetWindowLongW(hwnd, GWL_STYLE, info.original_style);
        SetWindowLongW(hwnd, GWL_EXSTYLE, info.original_ex_style);
        let _ = SetWindowPos(
            hwnd,
            HWND::default(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW,
        );
        let _ = ShowWindow(hwnd, SW_SHOW);
    }
    Ok(())
}

pub fn update_embedded_bounds(
    opaque_window_id: &str,
    host_hwnd: isize,
    bounds: Option<(i32, i32, i32, i32)>,
) -> Result<(), String> {
    if reject_reason_for_opaque_id(opaque_window_id).is_some() {
        return Ok(());
    }
    if host_hwnd == 0 {
        return Err("没有可用的宿主窗口，无法预览。".into());
    }
    let hwnd = hwnd_from_opaque_id(opaque_window_id)
        .map_err(|_| "窗口已关闭或无效，无法预览。".to_string())?;
    unsafe {
        if !IsWindow(hwnd).as_bool() {
            return Err("窗口已关闭或无效，无法预览。".into());
        }
        let host = HWND(host_hwnd as *mut core::ffi::c_void);
        apply_host_bounds(hwnd, host, bounds, true);
    }
    Ok(())
}

unsafe fn apply_host_bounds(
    hwnd: HWND,
    host: HWND,
    bounds: Option<(i32, i32, i32, i32)>,
    from_webview: bool,
) {
    if let Some((x, y, width, height)) = bounds.filter(|item| item.2 > 0 && item.3 > 0) {
        let (ox, oy) = if from_webview {
            webview_origin_in_host_client(host, hwnd)
        } else {
            (0, 0)
        };
        let _ = MoveWindow(hwnd, x + ox, y + oy, width, height, true);
        return;
    }
    let mut rect = RECT::default();
    if GetClientRect(host, &mut rect).is_ok() {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width > 0 && height > 0 {
            let _ = MoveWindow(hwnd, 0, 0, width, height, true);
        }
    }
}

unsafe fn webview_origin_in_host_client(host: HWND, embedded: HWND) -> (i32, i32) {
    let Ok(mut cursor) = GetWindow(host, GW_CHILD) else {
        return (0, 0);
    };
    if cursor.0.is_null() {
        return (0, 0);
    }
    loop {
        if cursor.0 != embedded.0 {
            let mut child = RECT::default();
            let mut host_window = RECT::default();
            let mut host_client = RECT::default();
            if GetWindowRect(cursor, &mut child).is_err()
                || GetWindowRect(host, &mut host_window).is_err()
                || GetClientRect(host, &mut host_client).is_err()
            {
                return (0, 0);
            }
            let frame_x =
                (host_window.right - host_window.left) - (host_client.right - host_client.left);
            let frame_y =
                (host_window.bottom - host_window.top) - (host_client.bottom - host_client.top);
            let border = frame_x / 2;
            return (
                child.left - host_window.left - border,
                child.top - host_window.top - (frame_y - border),
            );
        }
        match GetWindow(cursor, GW_HWNDNEXT) {
            Ok(next) if !next.0.is_null() => cursor = next,
            _ => break,
        }
    }
    (0, 0)
}

unsafe fn window_class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let len = GetClassNameW(hwnd, &mut buf);
    if len <= 0 {
        return String::new();
    }
    String::from_utf16_lossy(&buf[..len as usize])
}

unsafe fn reject_reason_for_integrity(hwnd: HWND) -> Option<String> {
    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
        return Some("没有权限预览该窗口。".into());
    }
    let self_level = integrity_rid(GetCurrentProcess())?;
    let target = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
        Ok(handle) => handle,
        Err(_) => return Some("没有权限预览该窗口。".into()),
    };
    let target_level = integrity_rid(target);
    let _ = CloseHandle(target);
    let Some(target_level) = target_level else {
        return Some("没有权限预览该窗口。".into());
    };
    if target_level > self_level {
        return Some("管理员或更高权限的窗口无法在本窗口预览。".into());
    }
    None
}

unsafe fn integrity_rid(process: HANDLE) -> Option<u32> {
    let mut token = HANDLE::default();
    OpenProcessToken(process, TOKEN_QUERY, &mut token).ok()?;
    let mut needed = 0u32;
    let _ = GetTokenInformation(token, TokenIntegrityLevel, None, 0, &mut needed);
    if needed == 0 {
        let _ = CloseHandle(token);
        return None;
    }
    let mut buf = vec![0u8; needed as usize];
    let ok = GetTokenInformation(
        token,
        TokenIntegrityLevel,
        Some(buf.as_mut_ptr().cast()),
        needed,
        &mut needed,
    );
    let _ = CloseHandle(token);
    ok.ok()?;
    let label = &*(buf.as_ptr() as *const TOKEN_MANDATORY_LABEL);
    let count = *GetSidSubAuthorityCount(label.Label.Sid);
    if count == 0 {
        return None;
    }
    Some(*GetSidSubAuthority(label.Label.Sid, u32::from(count) - 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mock_ids_are_rejected_before_reparent() {
        assert!(reject_reason_for_opaque_id("mock:abc").is_some());
        assert!(reject_reason_for_opaque_id("hwnd:1").is_some());
        assert!(reject_reason_for_opaque_id("win:").is_some());
        assert!(reject_reason_for_opaque_id("win:1").is_none());
        assert!(update_embedded_bounds("mock:abc", 0, Some((8, 16, 320, 240))).is_ok());
    }

    #[test]
    fn unsupported_classes_are_rejected() {
        assert!(reject_reason_for_class_name("ApplicationFrameWindow").is_some());
        assert!(reject_reason_for_class_name("Chrome_WidgetWin_1").is_some());
        assert!(reject_reason_for_class_name("Notepad").is_none());
    }

    #[test]
    fn reasons_never_mention_hwnd() {
        for reason in [
            reject_reason_for_opaque_id("mock:x"),
            reject_reason_for_class_name("Chrome_WidgetWin_1"),
            reject_reason_for_class_name("ApplicationFrameWindow"),
        ]
        .into_iter()
        .flatten()
        {
            assert!(!reason.to_ascii_lowercase().contains("hwnd"));
        }
    }
}
