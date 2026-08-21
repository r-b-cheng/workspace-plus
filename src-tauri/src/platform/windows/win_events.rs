//! Bound-window destroy hook and process-exit waits.
//!
//! Only `EVENT_OBJECT_DESTROY` is treated as close. Callbacks encode the hwnd
//! first and surface the opaque id when it is already in the running bound set.
//! Top-level is not required: a SetParented preview hwnd is a child, and a
//! dead top-level hwnd can make `GetAncestor` return 0.

use std::sync::mpsc::Sender;
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WAIT_OBJECT_0, WPARAM};
use windows::Win32::System::Threading::{
    GetCurrentThreadId, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
};
use windows::Win32::UI::Accessibility::{HWINEVENTHOOK, SetWinEventHook, UnhookWinEvent};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, GetMessageW, PostThreadMessageW, TranslateMessage, EVENT_OBJECT_DESTROY, MSG,
    WINEVENT_OUTOFCONTEXT, WM_QUIT,
};

use crate::platform::rules::encode_opaque_window_id;

/// `OBJID_WINDOW` without pulling the Accessibility feature set.
const OBJID_WINDOW: i32 = 0;

static EVENT_TX: std::sync::OnceLock<Sender<String>> = std::sync::OnceLock::new();
static BOUND_FILTER: std::sync::OnceLock<fn(&str) -> bool> = std::sync::OnceLock::new();

/// Drop DESTROY ids that are not currently running bound windows.
pub fn set_bound_opaque_filter(filter: fn(&str) -> bool) {
    let _ = BOUND_FILTER.set(filter);
}

#[derive(Debug)]
pub struct WinEventHookGuard {
    thread_id: u32,
    join: Option<JoinHandle<()>>,
}

impl Drop for WinEventHookGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        if let Some(handle) = self.join.take() {
            let _ = handle.join();
        }
    }
}

pub fn is_watched_win_event(event: u32, id_object: i32) -> bool {
    id_object == OBJID_WINDOW && event == EVENT_OBJECT_DESTROY
}

/// DESTROY of a bound opaque id is forwarded even when the hwnd is not top-level.
pub fn should_forward_destroy(opaque_id: &str, is_in_bound_set: bool) -> bool {
    !opaque_id.is_empty() && is_in_bound_set
}

/// Starts `SetWinEventHook` on a dedicated thread with a message loop.
///
/// Failure must not stop the product; the caller falls back to the watchdog.
pub fn start_win_event_hook(tx: Sender<String>) -> Result<WinEventHookGuard, String> {
    let _ = EVENT_TX.set(tx);
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let join = thread::Builder::new()
        .name("wh-win-events".into())
        .spawn(move || unsafe { win_event_thread(ready_tx) })
        .map_err(|err| err.to_string())?;

    let thread_id = ready_rx
        .recv()
        .map_err(|_| "window event thread stopped before the hook was ready".to_string())?
        .ok_or_else(|| "SetWinEventHook failed".to_string())?;

    Ok(WinEventHookGuard {
        thread_id,
        join: Some(join),
    })
}

unsafe fn win_event_thread(ready_tx: std::sync::mpsc::Sender<Option<u32>>) {
    let destroy = SetWinEventHook(
        EVENT_OBJECT_DESTROY,
        EVENT_OBJECT_DESTROY,
        None,
        Some(win_event_proc),
        0,
        0,
        WINEVENT_OUTOFCONTEXT,
    );

    if destroy.is_invalid() {
        let _ = ready_tx.send(None);
        return;
    }

    let _ = ready_tx.send(Some(GetCurrentThreadId()));

    let mut msg = MSG::default();
    while GetMessageW(&mut msg, HWND::default(), 0, 0).as_bool() {
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    let _ = UnhookWinEvent(destroy);
}

unsafe extern "system" fn win_event_proc(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _event_thread: u32,
    _event_time: u32,
) {
    if !is_watched_win_event(event, id_object) || hwnd.0.is_null() {
        return;
    }
    let opaque = encode_opaque_window_id(hwnd.0 as usize);
    let in_bound_set = BOUND_FILTER
        .get()
        .is_some_and(|filter| filter(&opaque));
    if !should_forward_destroy(&opaque, in_bound_set) {
        return;
    }
    if let Some(tx) = EVENT_TX.get() {
        let _ = tx.send(opaque);
    }
}

/// Blocks until `pid` exits. Returns false when the wait cannot be registered.
pub fn wait_for_process_exit(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    unsafe {
        let handle = match OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            Ok(handle) => handle,
            Err(_) => return false,
        };
        let waited = WaitForSingleObject(handle, INFINITE);
        let _ = CloseHandle(handle);
        waited == WAIT_OBJECT_0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watches_only_window_object_destroy() {
        use windows::Win32::UI::WindowsAndMessaging::{EVENT_OBJECT_CLOAKED, EVENT_OBJECT_HIDE};

        assert!(is_watched_win_event(EVENT_OBJECT_DESTROY, OBJID_WINDOW));
        assert!(!is_watched_win_event(EVENT_OBJECT_HIDE, OBJID_WINDOW));
        assert!(!is_watched_win_event(EVENT_OBJECT_CLOAKED, OBJID_WINDOW));
        assert!(!is_watched_win_event(EVENT_OBJECT_DESTROY, 1));
        assert!(!is_watched_win_event(0x8002, OBJID_WINDOW));
    }

    #[test]
    fn bound_destroy_is_forwarded_without_top_level_check() {
        assert!(should_forward_destroy("mock:setparent-child", true));
        assert!(should_forward_destroy("mock:dead-toplevel", true));
        assert!(!should_forward_destroy("mock:setparent-child", false));
        assert!(!should_forward_destroy("mock:random-child-control", false));
        assert!(!should_forward_destroy("", true));
    }
}
