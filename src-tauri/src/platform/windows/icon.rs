//! Best-effort icon probe. Failure must never block adding or scanning an app.
//! Persistence of icon bytes is owned by the service/storage layer, not Win32.

use std::path::Path;

use windows::core::PCWSTR;
use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_SMALLICON};
use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

pub fn try_probe_icon(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let wide = {
        use std::os::windows::ffi::OsStrExt;
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let mut info = SHFILEINFOW::default();
    let result = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_ATTRIBUTE_NORMAL,
            Some(&mut info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_SMALLICON,
        )
    };
    if result == 0 {
        return false;
    }
    if !info.hIcon.is_invalid() {
        let _ = unsafe { DestroyIcon(info.hIcon) };
        true
    } else {
        false
    }
}
