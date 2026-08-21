//! Opt-in HWND reparenting for a single already-bound window.
//!
//! Default `cargo test` must never reach SetParent: mock ids are rejected
//! before any window handle is used.

use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, POINT, RECT};
use windows::Win32::Security::{
    GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, TokenIntegrityLevel,
    TOKEN_MANDATORY_LABEL, TOKEN_QUERY,
};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentProcess, GetCurrentThreadId, OpenProcess, OpenProcessToken,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{EnableWindow, SetFocus};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, GetClassNameW, GetClientRect, GetForegroundWindow, GetParent,
    GetWindow, GetWindowLongW, GetWindowPlacement, GetWindowRect, GetWindowThreadProcessId,
    IsIconic, IsWindow, IsZoomed, MoveWindow, SetParent, SetWindowLongW, SetWindowPlacement,
    SetWindowPos, ShowWindow, GW_CHILD, GW_HWNDNEXT, GW_OWNER, GWL_EXSTYLE, GWL_STYLE, HWND_TOP,
    SET_WINDOW_POS_FLAGS, SHOW_WINDOW_CMD, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SWP_SHOWWINDOW, SW_MAXIMIZE, SW_MINIMIZE, SW_SHOW, SW_SHOWMAXIMIZED,
    SW_SHOWMINIMIZED, SW_SHOWMINNOACTIVE, SW_SHOWNORMAL, WINDOWPLACEMENT, WINDOWPLACEMENT_FLAGS,
    WS_CHILD, WS_POPUP,
};

use super::window_ops::hwnd_from_opaque_id;
use crate::platform::rules::decode_opaque_window_id;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SavedWindowPlacement {
    pub flags: u32,
    pub show_cmd: u32,
    pub min_x: i32,
    pub min_y: i32,
    pub max_x: i32,
    pub max_y: i32,
    pub normal_left: i32,
    pub normal_top: i32,
    pub normal_right: i32,
    pub normal_bottom: i32,
    pub screen_left: i32,
    pub screen_top: i32,
    pub screen_right: i32,
    pub screen_bottom: i32,
    pub has_placement: bool,
    pub has_screen_rect: bool,
}

impl Default for SavedWindowPlacement {
    fn default() -> Self {
        Self {
            flags: 0,
            show_cmd: SW_SHOWNORMAL.0 as u32,
            min_x: -1,
            min_y: -1,
            max_x: -1,
            max_y: -1,
            normal_left: 0,
            normal_top: 0,
            normal_right: 0,
            normal_bottom: 0,
            screen_left: 0,
            screen_top: 0,
            screen_right: 0,
            screen_bottom: 0,
            has_placement: false,
            has_screen_rect: false,
        }
    }
}

#[derive(Clone, Debug)]
pub struct EmbedRestoreInfo {
    pub opaque_window_id: String,
    pub original_style: i32,
    pub original_ex_style: i32,
    pub original_parent: isize,
    pub placement: SavedWindowPlacement,
}

pub fn should_skip_bounds_update(parent: isize, host: isize, style: i32) -> bool {
    parent != host || (style as u32 & WS_CHILD.0) == 0
}

/// After embed / bounds update: sit above WebView. Do not lock z-order or block activate.
pub fn embed_child_pos_flags() -> SET_WINDOW_POS_FLAGS {
    SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW
}

/// After release: restyle without stealing the desktop foreground.
pub fn restore_detached_pos_flags() -> SET_WINDOW_POS_FLAGS {
    SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_NOACTIVATE
}

/// Release order must stay style → parent → placement. Never MoveWindow with host bounds after detach.
#[cfg(test)]
fn embed_restore_phases() -> [&'static str; 4] {
    ["style", "parent", "placement", "frame-noactivate"]
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
        let placement = capture_placement(hwnd);

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
        raise_embedded_above_webview(hwnd);
        focus_embedded_child(hwnd);
        let _ = ShowWindow(hwnd, SW_SHOW);

        Ok(EmbedRestoreInfo {
            opaque_window_id: opaque_window_id.to_string(),
            original_style,
            original_ex_style,
            original_parent,
            placement,
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
        // style → parent → placement. Do not MoveWindow with leftover host bounds.
        SetWindowLongW(hwnd, GWL_STYLE, info.original_style);
        SetWindowLongW(hwnd, GWL_EXSTYLE, info.original_ex_style);
        let parent = HWND(info.original_parent as *mut core::ffi::c_void);
        let _ = SetParent(hwnd, parent);

        let placed = apply_saved_placement(hwnd, &info.placement);
        if !placed {
            let _ = apply_saved_screen_rect(hwnd, &info.placement);
        }
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            0,
            0,
            0,
            0,
            restore_detached_pos_flags(),
        );
        let _ = ShowWindow(hwnd, restore_show_cmd(info.placement.show_cmd));
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
        let parent = GetParent(hwnd)
            .map(|parent| parent.0 as isize)
            .unwrap_or(0);
        let style = GetWindowLongW(hwnd, GWL_STYLE);
        if should_skip_bounds_update(parent, host_hwnd, style) {
            return Ok(());
        }
        apply_host_bounds(hwnd, host, bounds, true);
        raise_embedded_above_webview(hwnd);
    }
    Ok(())
}

unsafe fn capture_placement(hwnd: HWND) -> SavedWindowPlacement {
    let mut wp = WINDOWPLACEMENT {
        length: core::mem::size_of::<WINDOWPLACEMENT>() as u32,
        ..Default::default()
    };
    let has_placement = GetWindowPlacement(hwnd, &mut wp).is_ok();
    let mut screen = RECT::default();
    let has_screen_rect = GetWindowRect(hwnd, &mut screen).is_ok();
    let show_cmd = if has_placement {
        wp.showCmd
    } else if IsIconic(hwnd).as_bool() {
        SW_SHOWMINNOACTIVE.0 as u32
    } else if IsZoomed(hwnd).as_bool() {
        SW_SHOWMAXIMIZED.0 as u32
    } else {
        SW_SHOWNORMAL.0 as u32
    };
    SavedWindowPlacement {
        flags: wp.flags.0,
        show_cmd,
        min_x: wp.ptMinPosition.x,
        min_y: wp.ptMinPosition.y,
        max_x: wp.ptMaxPosition.x,
        max_y: wp.ptMaxPosition.y,
        normal_left: wp.rcNormalPosition.left,
        normal_top: wp.rcNormalPosition.top,
        normal_right: wp.rcNormalPosition.right,
        normal_bottom: wp.rcNormalPosition.bottom,
        screen_left: screen.left,
        screen_top: screen.top,
        screen_right: screen.right,
        screen_bottom: screen.bottom,
        has_placement,
        has_screen_rect,
    }
}

unsafe fn apply_saved_placement(hwnd: HWND, saved: &SavedWindowPlacement) -> bool {
    if !saved.has_placement {
        return false;
    }
    let wp = WINDOWPLACEMENT {
        length: core::mem::size_of::<WINDOWPLACEMENT>() as u32,
        flags: WINDOWPLACEMENT_FLAGS(saved.flags),
        showCmd: saved.show_cmd,
        ptMinPosition: POINT {
            x: saved.min_x,
            y: saved.min_y,
        },
        ptMaxPosition: POINT {
            x: saved.max_x,
            y: saved.max_y,
        },
        rcNormalPosition: RECT {
            left: saved.normal_left,
            top: saved.normal_top,
            right: saved.normal_right,
            bottom: saved.normal_bottom,
        },
        ..Default::default()
    };
    SetWindowPlacement(hwnd, &wp).is_ok()
}

unsafe fn apply_saved_screen_rect(hwnd: HWND, saved: &SavedWindowPlacement) -> bool {
    if !saved.has_screen_rect {
        return false;
    }
    let width = saved.screen_right - saved.screen_left;
    let height = saved.screen_bottom - saved.screen_top;
    if width <= 0 || height <= 0 {
        return false;
    }
    SetWindowPos(
        hwnd,
        HWND_TOP,
        saved.screen_left,
        saved.screen_top,
        width,
        height,
        SWP_NOACTIVATE,
    )
    .is_ok()
}

fn restore_show_cmd(show_cmd: u32) -> SHOW_WINDOW_CMD {
    let cmd = SHOW_WINDOW_CMD(show_cmd as i32);
    if cmd == SW_SHOWMAXIMIZED || cmd == SW_MAXIMIZE {
        SW_SHOWMAXIMIZED
    } else if cmd == SW_SHOWMINIMIZED || cmd == SW_MINIMIZE || cmd == SW_SHOWMINNOACTIVE {
        SW_SHOWMINNOACTIVE
    } else {
        SW_SHOWNORMAL
    }
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
        raise_embedded_above_webview(hwnd);
        return;
    }
    let mut rect = RECT::default();
    if GetClientRect(host, &mut rect).is_ok() {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width > 0 && height > 0 {
            let _ = MoveWindow(hwnd, 0, 0, width, height, true);
            raise_embedded_above_webview(hwnd);
        }
    }
}

unsafe fn raise_embedded_above_webview(hwnd: HWND) {
    let _ = SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0, embed_child_pos_flags());
}

unsafe fn focus_embedded_child(hwnd: HWND) {
    let _ = EnableWindow(hwnd, true);
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
    let _ = SetFocus(hwnd);

    if attached_target {
        let _ = AttachThreadInput(current_tid, target_tid, false);
    }
    if attached_fg {
        let _ = AttachThreadInput(current_tid, fg_tid, false);
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
    use windows::Win32::UI::WindowsAndMessaging::SWP_NOZORDER;

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

    #[test]
    fn restore_info_keeps_copyable_placement() {
        let info = EmbedRestoreInfo {
            opaque_window_id: "mock:restore".into(),
            original_style: 0x00CF0000,
            original_ex_style: 0,
            original_parent: 0,
            placement: SavedWindowPlacement {
                flags: 0,
                show_cmd: SW_SHOWNORMAL.0 as u32,
                min_x: -1,
                min_y: -1,
                max_x: -1,
                max_y: -1,
                normal_left: 80,
                normal_top: 60,
                normal_right: 880,
                normal_bottom: 660,
                screen_left: 80,
                screen_top: 60,
                screen_right: 880,
                screen_bottom: 660,
                has_placement: true,
                has_screen_rect: true,
            },
        };
        let copied: SavedWindowPlacement = info.placement;
        assert_eq!(copied.normal_left, 80);
        assert_eq!(copied.normal_right, 880);
        assert_eq!(copied.show_cmd, SW_SHOWNORMAL.0 as u32);
        assert!(restore_embedded_window(&info).is_ok());
    }

    #[test]
    fn bounds_update_skips_when_not_child_of_host() {
        let child_style = WS_CHILD.0 as i32;
        let overlapped = 0x00CF_0000;
        assert!(should_skip_bounds_update(0, 42, child_style));
        assert!(should_skip_bounds_update(99, 42, child_style));
        assert!(should_skip_bounds_update(42, 42, overlapped));
        assert!(!should_skip_bounds_update(42, 42, child_style));
    }

    #[test]
    fn embed_raise_allows_zorder_and_activation() {
        let flags = embed_child_pos_flags();
        assert!(!flags.contains(SWP_NOZORDER));
        assert!(!flags.contains(SWP_NOACTIVATE));
        assert!(flags.contains(SWP_FRAMECHANGED));
        assert!(flags.contains(SWP_SHOWWINDOW));
    }

    #[test]
    fn restore_frame_does_not_steal_foreground() {
        let flags = restore_detached_pos_flags();
        assert!(flags.contains(SWP_NOACTIVATE));
        assert!(flags.contains(SWP_FRAMECHANGED));
        assert_eq!(
            embed_restore_phases(),
            ["style", "parent", "placement", "frame-noactivate"]
        );
    }

    #[test]
    fn restore_show_cmd_keeps_minmax_without_forcing_active() {
        assert_eq!(
            restore_show_cmd(SW_SHOWMAXIMIZED.0 as u32),
            SW_SHOWMAXIMIZED
        );
        assert_eq!(restore_show_cmd(SW_MAXIMIZE.0 as u32), SW_SHOWMAXIMIZED);
        assert_eq!(
            restore_show_cmd(SW_SHOWMINIMIZED.0 as u32),
            SW_SHOWMINNOACTIVE
        );
        assert_eq!(restore_show_cmd(SW_MINIMIZE.0 as u32), SW_SHOWMINNOACTIVE);
        assert_eq!(
            restore_show_cmd(SW_SHOWMINNOACTIVE.0 as u32),
            SW_SHOWMINNOACTIVE
        );
        assert_eq!(restore_show_cmd(SW_SHOWNORMAL.0 as u32), SW_SHOWNORMAL);
    }
}
