//! macOS-only scan helpers: `open`, Core Graphics window list, Accessibility focus.

use std::collections::HashSet;
use std::ffi::{c_char, c_int, c_void, CStr};
use std::process::Command;
use std::ptr;
use std::thread;
use std::time::{Duration, Instant};

use crate::platform::macos::logic::{
    closed_window_error, decode_macos_window_id, encode_macos_window_id,
    focus_denied_without_permission, window_belongs_to_app, MacosWindowKey, ResolvedMacosTarget,
};
use crate::platform::rules::{launch_result_from_parts, split_launch_args};
use crate::platform::{FocusWindowResult, LaunchAppRequest, LaunchResult, PlatformError, PlatformWindow};

const WINDOW_MATCH_TIMEOUT: Duration = Duration::from_millis(2500);
const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
const K_CF_NUMBER_SINT32_TYPE: c_int = 3;
const K_CF_NUMBER_SINT64_TYPE: c_int = 4;
const K_CG_WINDOW_LIST_OPTION_ALL: u32 = 0;
const K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS: u32 = 1 << 4;
const K_AX_ERROR_SUCCESS: i32 = 0;
const K_AX_ERROR_API_DISABLED: i32 = -25211;
const PROC_ALL_PIDS: u32 = 1;
const PROC_PIDPATHINFO_MAXSIZE: usize = 4096;

type CfTypeRef = *const c_void;
type CfStringRef = *const c_void;
type CfArrayRef = *const c_void;
type CfDictionaryRef = *const c_void;
type CfNumberRef = *const c_void;
type CfBooleanRef = *const c_void;
type CfIndex = isize;

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: CfTypeRef);
    fn CFStringCreateWithCString(
        alloc: CfTypeRef,
        c_str: *const c_char,
        encoding: u32,
    ) -> CfStringRef;
    fn CFStringGetLength(the_string: CfStringRef) -> CfIndex;
    fn CFStringGetCString(
        the_string: CfStringRef,
        buffer: *mut c_char,
        buffer_size: CfIndex,
        encoding: u32,
    ) -> u8;
    fn CFArrayGetCount(the_array: CfArrayRef) -> CfIndex;
    fn CFArrayGetValueAtIndex(the_array: CfArrayRef, idx: CfIndex) -> CfTypeRef;
    fn CFDictionaryGetValueIfPresent(
        the_dict: CfDictionaryRef,
        key: CfTypeRef,
        value: *mut CfTypeRef,
    ) -> u8;
    fn CFNumberGetValue(number: CfNumberRef, the_type: c_int, value_ptr: *mut c_void) -> u8;
    static kCFBooleanTrue: CfBooleanRef;
    static kCFBooleanFalse: CfBooleanRef;
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CfArrayRef;
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateApplication(pid: i32) -> CfTypeRef;
    fn AXUIElementCopyAttributeValue(
        element: CfTypeRef,
        attribute: CfStringRef,
        value: *mut CfTypeRef,
    ) -> i32;
    fn AXUIElementSetAttributeValue(
        element: CfTypeRef,
        attribute: CfStringRef,
        value: CfTypeRef,
    ) -> i32;
    fn AXUIElementPerformAction(element: CfTypeRef, action: CfStringRef) -> i32;
}

extern "C" {
    fn proc_pidpath(pid: c_int, buffer: *mut c_char, buffersize: u32) -> c_int;
    fn proc_listpids(kind: u32, typeinfo: u32, buffer: *mut c_int, buffersize: c_int) -> c_int;
}

struct OwnedCf(CfTypeRef);

impl OwnedCf {
    fn from_create(ptr: CfTypeRef) -> Option<Self> {
        if ptr.is_null() {
            None
        } else {
            Some(Self(ptr))
        }
    }

    fn as_ptr(&self) -> CfTypeRef {
        self.0
    }
}

impl Drop for OwnedCf {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}

fn cf_string(value: &str) -> Option<OwnedCf> {
    let c_string = std::ffi::CString::new(value).ok()?;
    let created = unsafe {
        CFStringCreateWithCString(ptr::null(), c_string.as_ptr(), K_CF_STRING_ENCODING_UTF8)
    };
    OwnedCf::from_create(created)
}

fn cf_string_to_rust(value: CfStringRef) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let len = unsafe { CFStringGetLength(value) };
    if len < 0 {
        return None;
    }
    let buf_size = (len as usize).saturating_mul(4).saturating_add(8);
    let mut buf = vec![0u8; buf_size];
    let ok = unsafe {
        CFStringGetCString(
            value,
            buf.as_mut_ptr() as *mut c_char,
            buf_size as CfIndex,
            K_CF_STRING_ENCODING_UTF8,
        )
    };
    if ok == 0 {
        return None;
    }
    let cstr = unsafe { CStr::from_ptr(buf.as_ptr() as *const c_char) };
    Some(cstr.to_string_lossy().into_owned())
}

fn cf_number_i64(number: CfNumberRef) -> Option<i64> {
    if number.is_null() {
        return None;
    }
    let mut value64: i64 = 0;
    let ok = unsafe {
        CFNumberGetValue(
            number,
            K_CF_NUMBER_SINT64_TYPE,
            &mut value64 as *mut i64 as *mut c_void,
        )
    };
    if ok != 0 {
        return Some(value64);
    }
    let mut value32: i32 = 0;
    let ok = unsafe {
        CFNumberGetValue(
            number,
            K_CF_NUMBER_SINT32_TYPE,
            &mut value32 as *mut i32 as *mut c_void,
        )
    };
    if ok != 0 {
        Some(value32 as i64)
    } else {
        None
    }
}

fn dict_value(dict: CfDictionaryRef, key: &str) -> Option<CfTypeRef> {
    let key_cf = cf_string(key)?;
    let mut value: CfTypeRef = ptr::null();
    let present = unsafe { CFDictionaryGetValueIfPresent(dict, key_cf.as_ptr(), &mut value) };
    if present == 0 || value.is_null() {
        None
    } else {
        Some(value)
    }
}

fn dict_string(dict: CfDictionaryRef, key: &str) -> Option<String> {
    cf_string_to_rust(dict_value(dict, key)?)
}

fn dict_i64(dict: CfDictionaryRef, key: &str) -> Option<i64> {
    cf_number_i64(dict_value(dict, key)?)
}

pub fn is_process_trusted() -> bool {
    unsafe { AXIsProcessTrusted() != 0 }
}

pub fn process_path_for_pid(pid: u32) -> Option<String> {
    let signed_pid = c_int::try_from(pid).ok().filter(|pid| *pid > 0)?;
    // proc_pidpath may expose macOS's code-signing clone (.app.bundle) rather
    // than the installed .app. AppKit supplies the stable application identity.
    // Polling happens on background threads, so drain Cocoa temporaries here.
    let app_path = objc2::rc::autoreleasepool(|_| {
        let app = objc2_app_kit::NSRunningApplication::runningApplicationWithProcessIdentifier(signed_pid)?;
        let url = app.executableURL()?;
        let path = url.path()?.to_string();
        (!path.is_empty()).then_some(path)
    });
    if app_path.is_some() {
        return app_path;
    }
    // Plain processes and helper executables may have no NSRunningApplication.
    let mut buf = vec![0u8; PROC_PIDPATHINFO_MAXSIZE];
    let written = unsafe {
        proc_pidpath(
            signed_pid,
            buf.as_mut_ptr() as *mut c_char,
            buf.len() as u32,
        )
    };
    if written <= 0 {
        return None;
    }
    let cstr = unsafe { CStr::from_ptr(buf.as_ptr() as *const c_char) };
    let path = cstr.to_string_lossy().into_owned();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

pub fn list_top_level_windows() -> Result<Vec<PlatformWindow>, PlatformError> {
    let self_pid = std::process::id();
    let info = unsafe {
        CGWindowListCopyWindowInfo(
            K_CG_WINDOW_LIST_OPTION_ALL | K_CG_WINDOW_LIST_EXCLUDE_DESKTOP_ELEMENTS,
            0,
        )
    };
    let Some(info) = OwnedCf::from_create(info) else {
        return Ok(Vec::new());
    };

    let count = unsafe { CFArrayGetCount(info.as_ptr()) };
    let mut windows = Vec::new();
    let mut path_cache: std::collections::HashMap<u32, Option<String>> =
        std::collections::HashMap::new();

    for index in 0..count {
        let item = unsafe { CFArrayGetValueAtIndex(info.as_ptr(), index) };
        if item.is_null() {
            continue;
        }
        let Some(window) = describe_window(item, self_pid, &mut path_cache) else {
            continue;
        };
        windows.push(window);
    }
    Ok(windows)
}

fn describe_window(
    dict: CfTypeRef,
    self_pid: u32,
    path_cache: &mut std::collections::HashMap<u32, Option<String>>,
) -> Option<PlatformWindow> {
    let layer = dict_i64(dict, "kCGWindowLayer").unwrap_or(-1);
    if layer != 0 {
        return None;
    }
    let pid = dict_i64(dict, "kCGWindowOwnerPID")? as u32;
    if pid == 0 || pid == self_pid {
        return None;
    }
    let window_number = dict_i64(dict, "kCGWindowNumber")? as u32;
    let title = dict_string(dict, "kCGWindowName").unwrap_or_default();
    if title.trim().is_empty() {
        return None;
    }
    let process_path = path_cache
        .entry(pid)
        .or_insert_with(|| process_path_for_pid(pid))
        .clone();
    Some(PlatformWindow {
        native_window_id: encode_macos_window_id(pid, window_number),
        process_id: Some(pid),
        title,
        process_path,
    })
}

pub fn launch_app(
    target: &ResolvedMacosTarget,
    request: &LaunchAppRequest,
) -> Result<LaunchResult, PlatformError> {
    let existing: HashSet<String> = list_top_level_windows()
        .unwrap_or_default()
        .into_iter()
        .map(|window| window.native_window_id)
        .collect();

    let mut cmd = Command::new("open");
    cmd.arg(&target.bundle_path);
    let args = split_launch_args(request.launch_args.as_deref());
    if !args.is_empty() {
        cmd.arg("--args");
        cmd.args(args);
    }
    let status = cmd
        .status()
        .map_err(|err| PlatformError::launch_failed(err.to_string()))?;
    if !status.success() {
        return Err(PlatformError::launch_failed(
            "open failed to start the application",
        ));
    }

    let window = wait_for_matching_window(target, &existing);
    let process_id = window
        .as_ref()
        .and_then(|item| item.process_id)
        .or_else(|| find_pid_for_target(target));
    let process_path = window
        .as_ref()
        .and_then(|item| item.process_path.clone())
        .or_else(|| {
            target
                .executable_path
                .as_ref()
                .map(|path| path.to_string_lossy().replace('\\', "/"))
        });
    Ok(launch_result_from_parts(process_id, process_path, window))
}

fn wait_for_matching_window(
    target: &ResolvedMacosTarget,
    existing: &HashSet<String>,
) -> Option<PlatformWindow> {
    let started = Instant::now();
    loop {
        if let Ok(windows) = list_top_level_windows() {
            if let Some(window) = windows.into_iter().find(|window| {
                !existing.contains(&window.native_window_id)
                    && window_belongs_to_app(
                        window.process_path.as_deref(),
                        &target.bundle_path,
                        target.executable_path.as_deref(),
                    )
            }) {
                return Some(window);
            }
        }
        if started.elapsed() >= WINDOW_MATCH_TIMEOUT {
            return None;
        }
        thread::sleep(Duration::from_millis(80));
    }
}

fn find_pid_for_target(target: &ResolvedMacosTarget) -> Option<u32> {
    let needed = unsafe { proc_listpids(PROC_ALL_PIDS, 0, ptr::null_mut(), 0) };
    if needed <= 0 {
        return None;
    }
    let count = (needed as usize) / std::mem::size_of::<c_int>();
    let mut pids = vec![0 as c_int; count];
    let filled = unsafe { proc_listpids(PROC_ALL_PIDS, 0, pids.as_mut_ptr(), needed) };
    if filled <= 0 {
        return None;
    }
    let mut found = None;
    for pid in pids {
        if pid <= 0 {
            continue;
        }
        let pid = pid as u32;
        if window_belongs_to_app(
            process_path_for_pid(pid).as_deref(),
            &target.bundle_path,
            target.executable_path.as_deref(),
        ) {
            found = Some(pid);
        }
    }
    found
}

pub fn focus_window(native_window_id: &str) -> Result<FocusWindowResult, PlatformError> {
    let key = decode_macos_window_id(native_window_id).ok_or_else(closed_window_error)?;
    let current = list_top_level_windows()?;
    let Some(found) = current.iter().find(|window| {
        decode_macos_window_id(&window.native_window_id).as_ref() == Some(&key)
    }) else {
        return Err(closed_window_error());
    };

    if !is_process_trusted() {
        return Err(focus_denied_without_permission());
    }

    raise_window(&key, &found.title)
}

fn raise_window(key: &MacosWindowKey, title: &str) -> Result<FocusWindowResult, PlatformError> {
    let app = OwnedCf::from_create(unsafe { AXUIElementCreateApplication(key.process_id as i32) })
        .ok_or_else(closed_window_error)?;

    let frontmost = cf_string("AXFrontmost").ok_or_else(|| {
        PlatformError::internal("failed to allocate accessibility attribute")
    })?;
    let front_err = unsafe {
        AXUIElementSetAttributeValue(app.as_ptr(), frontmost.as_ptr(), kCFBooleanTrue)
    };
    if front_err == K_AX_ERROR_API_DISABLED {
        return Err(focus_denied_without_permission());
    }
    if front_err != K_AX_ERROR_SUCCESS {
        return Err(focus_denied_without_permission());
    }

    let restored = raise_named_ax_window(app.as_ptr(), title);
    if matches!(restored, Err(code) if code == K_AX_ERROR_API_DISABLED) {
        return Err(focus_denied_without_permission());
    }
    Ok(FocusWindowResult {
        focused: true,
        restored: restored.unwrap_or(false),
    })
}

fn raise_named_ax_window(app: CfTypeRef, title: &str) -> Result<bool, i32> {
    let windows_attr = cf_string("AXWindows").ok_or(K_AX_ERROR_API_DISABLED)?;
    let mut value: CfTypeRef = ptr::null();
    let err = unsafe { AXUIElementCopyAttributeValue(app, windows_attr.as_ptr(), &mut value) };
    if err != K_AX_ERROR_SUCCESS {
        return Err(err);
    }
    let Some(windows) = OwnedCf::from_create(value) else {
        return Ok(false);
    };

    let title_attr = cf_string("AXTitle").ok_or(K_AX_ERROR_API_DISABLED)?;
    let minimized_attr = cf_string("AXMinimized").ok_or(K_AX_ERROR_API_DISABLED)?;
    let raise_action = cf_string("AXRaise").ok_or(K_AX_ERROR_API_DISABLED)?;
    let count = unsafe { CFArrayGetCount(windows.as_ptr()) };

    let mut chosen: Option<CfTypeRef> = None;
    for index in 0..count {
        let element = unsafe { CFArrayGetValueAtIndex(windows.as_ptr(), index) };
        if element.is_null() {
            continue;
        }
        let mut title_value: CfTypeRef = ptr::null();
        let title_err =
            unsafe { AXUIElementCopyAttributeValue(element, title_attr.as_ptr(), &mut title_value) };
        if title_err == K_AX_ERROR_API_DISABLED {
            return Err(K_AX_ERROR_API_DISABLED);
        }
        let ax_title = if title_err == K_AX_ERROR_SUCCESS {
            let owned = OwnedCf::from_create(title_value);
            owned.and_then(|item| cf_string_to_rust(item.as_ptr()))
        } else {
            None
        };
        if ax_title.as_deref() == Some(title) {
            chosen = Some(element);
            break;
        }
        if chosen.is_none() {
            chosen = Some(element);
        }
    }

    let Some(element) = chosen else {
        return Ok(false);
    };

    let mut restored = false;
    let mut minimized_value: CfTypeRef = ptr::null();
    let min_err =
        unsafe { AXUIElementCopyAttributeValue(element, minimized_attr.as_ptr(), &mut minimized_value) };
    if min_err == K_AX_ERROR_API_DISABLED {
        return Err(K_AX_ERROR_API_DISABLED);
    }
    if min_err == K_AX_ERROR_SUCCESS && !minimized_value.is_null() {
        if minimized_value == unsafe { kCFBooleanTrue } {
            let set_err = unsafe {
                AXUIElementSetAttributeValue(element, minimized_attr.as_ptr(), kCFBooleanFalse)
            };
            if set_err == K_AX_ERROR_API_DISABLED {
                return Err(K_AX_ERROR_API_DISABLED);
            }
            restored = set_err == K_AX_ERROR_SUCCESS;
        }
        unsafe { CFRelease(minimized_value) };
    }

    let raise_err = unsafe { AXUIElementPerformAction(element, raise_action.as_ptr()) };
    if raise_err == K_AX_ERROR_API_DISABLED {
        return Err(K_AX_ERROR_API_DISABLED);
    }
    Ok(restored)
}

