//! Bound-window liveness: event reconcile, process exit, and active-workspace watchdog.

use std::collections::{HashMap, HashSet};
#[cfg(windows)]
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::AppService;
use crate::errors::AppError;
use crate::storage::{self, now_utc, ACTIVE_WORKSPACE_KEY};

pub const WORKSPACE_WINDOWS_CHANGED_EVENT: &str = "workspace-windows-changed";
#[cfg(windows)]
const WINDOW_EVENT_DEBOUNCE: Duration = Duration::from_millis(150);
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWindowsChanged {
    pub workspace_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_app_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_released: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_seq: Option<u64>,
}

pub trait WindowChangeSink: Send + Sync {
    fn emit_windows_changed(
        &self,
        workspace_id: &str,
        workspace_app_id: Option<&str>,
        preview_released: bool,
        preview_seq: Option<u64>,
    );
}

#[derive(Default)]
pub struct CapturingWindowChangeSink {
    events: Mutex<Vec<WorkspaceWindowsChanged>>,
}

impl CapturingWindowChangeSink {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn events(&self) -> Vec<WorkspaceWindowsChanged> {
        self.events
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }
}

impl WindowChangeSink for CapturingWindowChangeSink {
    fn emit_windows_changed(
        &self,
        workspace_id: &str,
        workspace_app_id: Option<&str>,
        preview_released: bool,
        preview_seq: Option<u64>,
    ) {
        if let Ok(mut events) = self.events.lock() {
            events.push(WorkspaceWindowsChanged {
                workspace_id: workspace_id.to_string(),
                workspace_app_id: workspace_app_id.map(ToOwned::to_owned),
                preview_released: preview_released.then_some(true),
                preview_seq: preview_released.then_some(preview_seq).flatten(),
            });
        }
    }
}

struct TauriWindowChangeSink(AppHandle);

impl WindowChangeSink for TauriWindowChangeSink {
    fn emit_windows_changed(
        &self,
        workspace_id: &str,
        workspace_app_id: Option<&str>,
        preview_released: bool,
        preview_seq: Option<u64>,
    ) {
        let payload = WorkspaceWindowsChanged {
            workspace_id: workspace_id.to_string(),
            workspace_app_id: workspace_app_id.map(ToOwned::to_owned),
            preview_released: preview_released.then_some(true),
            preview_seq: preview_released.then_some(preview_seq).flatten(),
        };
        if let Err(err) = self.0.emit(WORKSPACE_WINDOWS_CHANGED_EVENT, payload) {
            tracing::warn!(error = %err, "failed to emit workspace-windows-changed");
        }
    }
}

#[cfg(windows)]
struct ProcessWaitHub {
    waiting: Arc<Mutex<HashSet<u32>>>,
    wanted: Arc<Mutex<HashSet<u32>>>,
    on_exit: Arc<dyn Fn(u32) + Send + Sync>,
}

#[cfg(windows)]
impl ProcessWaitHub {
    fn ensure(&self, pid: u32) {
        if pid == 0 {
            return;
        }
        if let Ok(mut wanted) = self.wanted.lock() {
            wanted.insert(pid);
        } else {
            return;
        }
        {
            let Ok(mut waiting) = self.waiting.lock() else {
                return;
            };
            if !waiting.insert(pid) {
                return;
            }
        }

        let waiting = Arc::clone(&self.waiting);
        let on_exit = self.on_exit.clone();
        let wanted = Arc::clone(&self.wanted);
        let spawned = thread::Builder::new()
            .name(format!("wh-proc-wait-{pid}"))
            .spawn(move || {
                let exited = crate::platform::windows::win_events::wait_for_process_exit(pid, || {
                    wanted.lock().map(|pids| pids.contains(&pid)).unwrap_or(false)
                });
                if exited {
                    on_exit(pid);
                }
                if let Ok(mut guard) = waiting.lock() {
                    guard.remove(&pid);
                }
            });
        if spawned.is_err() {
            if let Ok(mut guard) = self.waiting.lock() {
                guard.remove(&pid);
            }
        }
    }
}

#[cfg(windows)]
static PROCESS_WAITS: Mutex<Option<Arc<ProcessWaitHub>>> = Mutex::new(None);
#[cfg(any(windows, test))]
static RUNNING_BOUND_IDS: Mutex<Option<HashSet<String>>> = Mutex::new(None);

#[cfg(any(windows, test))]
fn lock_running_bound_ids() -> Option<std::sync::MutexGuard<'static, Option<HashSet<String>>>> {
    RUNNING_BOUND_IDS.lock().ok()
}

pub fn note_bound_running(opaque_id: &str) {
    if opaque_id.is_empty() {
        return;
    }
    #[cfg(any(windows, test))]
    if let Some(mut guard) = lock_running_bound_ids() {
        guard.get_or_insert_with(HashSet::new).insert(opaque_id.to_string());
    }
}

pub fn note_bound_closed(opaque_id: &str) {
    let _ = opaque_id;
    #[cfg(any(windows, test))]
    if let Some(mut guard) = lock_running_bound_ids() {
        if let Some(ids) = guard.as_mut() {
            ids.remove(opaque_id);
        }
    }
}

#[cfg(any(windows, test))]
pub fn is_running_bound_opaque(opaque_id: &str) -> bool {
    lock_running_bound_ids()
        .and_then(|guard| guard.as_ref().map(|ids| ids.contains(opaque_id)))
        .unwrap_or(false)
}

#[cfg(windows)]
static HOOK_GUARD: Mutex<Option<Box<dyn Send>>> = Mutex::new(None);

/// Registers a process-exit wait when a window is bound. No-op until liveness starts.
pub fn note_bound_process(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(windows)]
    if let Ok(guard) = PROCESS_WAITS.lock() {
        if let Some(hub) = guard.as_ref() {
            hub.ensure(pid);
        }
    }
}

/// Starts the watchdog on every platform. Windows also starts the WinEvent hook.
///
/// Hook or process-wait failure must not prevent startup.
pub fn start_window_liveness(app: &AppHandle) {
    let handle = app.clone();
    handle
        .state::<AppService>()
        .set_window_change_sink(Arc::new(TauriWindowChangeSink(handle.clone())));

    #[cfg(windows)]
    {
        install_process_wait_hub(handle.clone());
        seed_running_bound_ids(&handle);
        register_existing_bound_pids(&handle);
    }
    spawn_watchdog(handle.clone());

    #[cfg(windows)]
    {
        if let Err(err) = start_windows_window_hook(handle) {
            tracing::warn!(error = %err, "window event hook unavailable; watchdog only");
        }
    }
}

#[cfg(windows)]
fn install_process_wait_hub(handle: AppHandle) {
    let hub = Arc::new(ProcessWaitHub {
        waiting: Arc::new(Mutex::new(HashSet::new())),
        wanted: Arc::new(Mutex::new(HashSet::new())),
        on_exit: Arc::new(move |pid| {
            let service = handle.state::<AppService>();
            if let Err(err) = service.handle_process_exited(pid) {
                tracing::warn!(error = %err, pid, "process-exit reconcile failed");
            }
        }),
    });
    if let Ok(mut guard) = PROCESS_WAITS.lock() {
        *guard = Some(hub);
    }
}

#[cfg(windows)]
fn seed_running_bound_ids(handle: &AppHandle) {
    let service = handle.state::<AppService>();
    match service.running_bound_opaque_ids() {
        Ok(ids) => {
            for id in ids {
                note_bound_running(&id);
            }
        }
        Err(err) => tracing::warn!(error = %err, "failed to seed running bound window ids"),
    }
}

#[cfg(windows)]
fn register_existing_bound_pids(handle: &AppHandle) {
    let service = handle.state::<AppService>();
    match service.running_bound_process_ids() {
        Ok(pids) => {
            for pid in pids {
                note_bound_process(pid);
            }
        }
        Err(err) => tracing::warn!(error = %err, "failed to register bound process waits"),
    }
}

fn spawn_watchdog(handle: AppHandle) {
    let result = thread::Builder::new()
        .name("wh-win-watchdog".into())
        .spawn(move || loop {
            run_watchdog_tick(&handle);
            thread::sleep(WATCHDOG_INTERVAL);
        });
    if let Err(err) = result {
        tracing::warn!(error = %err, "window liveness watchdog failed to start");
    }
}

fn run_watchdog_tick(handle: &AppHandle) {
    let service = handle.state::<AppService>();
    if let Err(err) = service.watchdog_reconcile_active_workspace() {
        tracing::warn!(error = %err, "window liveness watchdog failed");
    }
    #[cfg(windows)]
    match service.running_bound_process_ids() {
        Ok(pids) => {
            if let Ok(hub) = PROCESS_WAITS.lock() {
                if let Some(hub) = hub.as_ref() {
                    if let Ok(mut wanted) = hub.wanted.lock() {
                        *wanted = pids.iter().copied().collect();
                    }
                    for pid in pids {
                        hub.ensure(pid);
                    }
                }
            }
        }
        Err(err) => tracing::warn!(error = %err, "failed to refresh process waits"),
    }
}

#[cfg(windows)]
fn start_windows_window_hook(handle: AppHandle) -> Result<(), String> {
    crate::platform::windows::win_events::set_bound_opaque_filter(is_running_bound_opaque);
    let (tx, rx) = mpsc::channel();
    let guard = crate::platform::windows::win_events::start_win_event_hook(tx)?;
    if let Ok(mut slot) = HOOK_GUARD.lock() {
        *slot = Some(Box::new(guard));
    }

    thread::Builder::new()
        .name("wh-win-debounce".into())
        .spawn(move || debounce_gone_ids(rx, handle))
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[cfg(windows)]
fn debounce_gone_ids(rx: mpsc::Receiver<String>, handle: AppHandle) {
    let mut pending = HashSet::new();
    loop {
        match rx.recv() {
            Ok(id) => {
                pending.insert(id);
                loop {
                    match rx.recv_timeout(WINDOW_EVENT_DEBOUNCE) {
                        Ok(id) => {
                            pending.insert(id);
                        }
                        Err(RecvTimeoutError::Timeout) => break,
                        Err(RecvTimeoutError::Disconnected) => return,
                    }
                }
                let batch: Vec<String> = pending
                    .drain()
                    .filter(|opaque_id| is_running_bound_opaque(opaque_id))
                    .collect();
                if batch.is_empty() {
                    continue;
                }
                let service = handle.state::<AppService>();
                for opaque_id in batch {
                    if let Err(err) = service.handle_bound_window_gone(&opaque_id) {
                        tracing::warn!(error = %err, "bound-window gone reconcile failed");
                    }
                }
            }
            Err(_) => return,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct LivenessSnapshot {
    app_status: String,
    last_window_id: Option<String>,
    windows: Vec<(String, String)>,
}

impl AppService {
    pub fn set_window_change_sink(&self, sink: Arc<dyn WindowChangeSink>) {
        if let Ok(mut guard) = self.window_change_sink.lock() {
            *guard = Some(sink);
        }
    }

    pub fn running_bound_process_ids(&self) -> Result<Vec<u32>, AppError> {
        let conn = self.lock_db()?;
        storage::native_window_list_running_process_ids(&conn)
    }

    pub fn running_bound_opaque_ids(&self) -> Result<Vec<String>, AppError> {
        let conn = self.lock_db()?;
        storage::native_window_bound_external_ids(&conn, None)
    }

    pub fn handle_bound_window_gone(&self, opaque_id: &str) -> Result<bool, AppError> {
        let (workspace_id, workspace_app_id) = {
            let mut conn = self.lock_db()?;
            let tx = conn.transaction()?;
            let Some(row) = storage::native_window_find_running_by_external(&tx, opaque_id)? else {
                return Ok(false);
            };
            let workspace_id = row.workspace_id.clone();
            let workspace_app_id = row.workspace_app_id.clone();
            let now = now_utc();
            storage::native_window_mark_closed(&tx, &row.id, &now)?;
            note_bound_closed(opaque_id);
            if let Some(app) = storage::workspace_app_get(&tx, &workspace_app_id)?
                .filter(|item| item.deleted_at.is_none())
            {
                super::reconcile_workspace_app_window_status(
                    &tx,
                    &workspace_app_id,
                    app.last_window_id.as_deref(),
                    &app.status,
                    &now,
                )?;
            }
            tx.commit()?;
            (workspace_id, workspace_app_id)
        };

        let (preview_released, preview_seq) = self.release_embed_if_opaque_matches(opaque_id);
        self.emit_windows_changed(
            &workspace_id,
            Some(&workspace_app_id),
            preview_released,
            preview_seq,
        );
        Ok(true)
    }

    pub fn handle_process_exited(&self, pid: u32) -> Result<bool, AppError> {
        let (affected, closed_opaques) = {
            let mut conn = self.lock_db()?;
            let tx = conn.transaction()?;
            let rows = storage::native_window_list_running_by_pid(&tx, pid as i64)?;
            if rows.is_empty() {
                return Ok(false);
            }
            let now = now_utc();
            let mut app_ids = HashSet::new();
            let mut closed_opaques = Vec::new();
            for row in &rows {
                storage::native_window_mark_closed(&tx, &row.id, &now)?;
                note_bound_closed(&row.external_window_id);
                closed_opaques.push(row.external_window_id.clone());
                app_ids.insert((row.workspace_id.clone(), row.workspace_app_id.clone()));
            }
            for (_, workspace_app_id) in &app_ids {
                if let Some(app) = storage::workspace_app_get(&tx, workspace_app_id)?
                    .filter(|item| item.deleted_at.is_none())
                {
                    super::reconcile_workspace_app_window_status(
                        &tx,
                        workspace_app_id,
                        app.last_window_id.as_deref(),
                        &app.status,
                        &now,
                    )?;
                }
            }
            tx.commit()?;
            (app_ids, closed_opaques)
        };

        let mut preview_released = false;
        let mut preview_seq = None;
        for opaque in &closed_opaques {
            let (released, seq) = self.release_embed_if_opaque_matches(opaque);
            if released {
                preview_released = true;
                preview_seq = seq;
            }
        }
        self.emit_grouped_window_changes(affected, preview_released, preview_seq);
        Ok(true)
    }

    pub fn watchdog_reconcile_active_workspace(&self) -> Result<bool, AppError> {
        let workspace_id = {
            let conn = self.lock_db()?;
            match storage::settings_get(&conn, ACTIVE_WORKSPACE_KEY)? {
                Some(id) => id,
                None => return Ok(false),
            }
        };
        let mut preview_gone = false;
        if let Some(opaque) = self.embed_session_opaque_id() {
            if !self.adapter.window_is_open(&opaque) {
                let embed_app_id = self.embed_session_workspace_app_id();
                if self.handle_bound_window_gone(&opaque)? {
                    preview_gone = true;
                } else {
                    let (released, preview_seq) = self.release_embed_if_opaque_matches(&opaque);
                    if released {
                        self.emit_windows_changed(
                            &workspace_id,
                            embed_app_id.as_deref(),
                            true,
                            preview_seq,
                        );
                        preview_gone = true;
                    }
                }
            }
        }

        let app_ids = {
            let conn = self.lock_db()?;
            storage::workspace_app_list_liveness_ids(&conn, &workspace_id)?
        };
        if app_ids.is_empty() {
            return Ok(preview_gone);
        }

        let desktop = match self.adapter.list_windows(&crate::platform::ListWindowsRequest::default())
        {
            Ok(windows) => windows,
            Err(_) => return Ok(preview_gone),
        };

        let mut changed_app_ids = Vec::new();
        for workspace_app_id in app_ids {
            let before = self.liveness_snapshot(&workspace_app_id)?;
            self.sync_workspace_app_windows_from_desktop(&workspace_app_id, &desktop)?;
            let after = self.liveness_snapshot(&workspace_app_id)?;
            if before != after {
                changed_app_ids.push(workspace_app_id);
            }
        }

        if changed_app_ids.is_empty() {
            return Ok(preview_gone);
        }

        if changed_app_ids.len() == 1 {
            self.emit_windows_changed(&workspace_id, Some(&changed_app_ids[0]), false, None);
        } else {
            self.emit_windows_changed(&workspace_id, None, false, None);
        }
        Ok(true)
    }

    fn liveness_snapshot(&self, workspace_app_id: &str) -> Result<LivenessSnapshot, AppError> {
        let conn = self.lock_db()?;
        let app = storage::workspace_app_get(&conn, workspace_app_id)?
            .ok_or_else(|| AppError::not_found("workspace app not found"))?;
        let mut windows = storage::native_window_list_running_rows(&conn, workspace_app_id)?
            .into_iter()
            .map(|row| (row.id, row.status))
            .collect::<Vec<_>>();
        windows.sort();
        Ok(LivenessSnapshot {
            app_status: app.status,
            last_window_id: app.last_window_id,
            windows,
        })
    }

    fn emit_windows_changed(
        &self,
        workspace_id: &str,
        workspace_app_id: Option<&str>,
        preview_released: bool,
        preview_seq: Option<u64>,
    ) {
        if let Ok(guard) = self.window_change_sink.lock() {
            if let Some(sink) = guard.as_ref() {
                sink.emit_windows_changed(
                    workspace_id,
                    workspace_app_id,
                    preview_released,
                    preview_seq,
                );
            }
        }
    }

    fn emit_grouped_window_changes(
        &self,
        affected: HashSet<(String, String)>,
        preview_released: bool,
        preview_seq: Option<u64>,
    ) {
        let mut by_workspace: HashMap<String, Vec<String>> = HashMap::new();
        for (workspace_id, workspace_app_id) in affected {
            by_workspace
                .entry(workspace_id)
                .or_default()
                .push(workspace_app_id);
        }
        for (workspace_id, mut app_ids) in by_workspace {
            app_ids.sort();
            if app_ids.len() == 1 {
                self.emit_windows_changed(
                    &workspace_id,
                    Some(&app_ids[0]),
                    preview_released,
                    preview_seq,
                );
            } else {
                self.emit_windows_changed(&workspace_id, None, preview_released, preview_seq);
            }
        }
    }

    fn release_embed_if_opaque_matches(&self, opaque_id: &str) -> (bool, Option<u64>) {
        let Ok(_ops) = self.lock_embed_ops() else {
            return (false, None);
        };
        match self.release_embedded_window_locked(None, Some(opaque_id)) {
            Ok(Some(preview_seq)) => (true, Some(preview_seq)),
            _ => (false, None),
        }
    }

    #[doc(hidden)]
    pub fn test_release_embed_if_opaque_matches(&self, opaque_id: &str) -> (bool, Option<u64>) {
        self.release_embed_if_opaque_matches(opaque_id)
    }

    #[doc(hidden)]
    pub fn test_embed_session_preview_seq(&self) -> Option<u64> {
        self.lock_embed()
            .ok()
            .and_then(|guard| guard.as_ref().map(|session| session.preview_seq))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removing_apps_or_workspaces_releases_tracked_window_ids() {
        for delete_workspace in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let adapter = Arc::new(crate::platform::MockPlatformAdapter::new());
            let service = AppService::open(temp.path(), adapter).unwrap();
            let ws = service.create_workspace("cleanup", None, None, None).unwrap();
            service.refresh_installed_apps().unwrap();
            let app = service.search_installed_apps("notepad", None).unwrap().remove(0);
            let bound = service.launch_workspace_app(&ws.id, &app.id).unwrap();
            let opaque = format!("cleanup-{}", ws.id);
            {
                let conn = service.lock_db().unwrap();
                storage::native_window_insert(&conn, &storage::new_id(), &ws.id, &bound.id,
                    "mock", &opaque, None, None, Some("cleanup"), &now_utc()).unwrap();
            }
            note_bound_running(&opaque);
            assert!(is_running_bound_opaque(&opaque));
            if delete_workspace {
                service.delete_workspace(&ws.id).unwrap();
            } else {
                service.remove_workspace_app(&bound.id).unwrap();
            }
            assert!(!is_running_bound_opaque(&opaque));
        }
    }

    #[test]
    fn watchdog_snapshot_excludes_closed_history() {
        let temp = tempfile::tempdir().unwrap();
        let adapter = Arc::new(crate::platform::MockPlatformAdapter::new());
        let service = AppService::open(temp.path(), adapter).unwrap();
        let ws = service.create_workspace("history", None, None, None).unwrap();
        service.refresh_installed_apps().unwrap();
        let app = service.search_installed_apps("notepad", None).unwrap().remove(0);
        let bound = service.launch_workspace_app(&ws.id, &app.id).unwrap();
        {
            let mut conn = service.lock_db().unwrap();
            let tx = conn.transaction().unwrap();
            for index in 0..2000 {
                let id = format!("history-{index}");
                storage::native_window_insert(&tx, &id, &ws.id, &bound.id, "mock", &id,
                    None, None, Some("old window"), &now_utc()).unwrap();
                storage::native_window_mark_closed(&tx, &id, &now_utc()).unwrap();
            }
            tx.commit().unwrap();
            assert_eq!(storage::native_window_list_rows(&conn, &bound.id).unwrap().len(), 2001);
        }
        assert_eq!(service.liveness_snapshot(&bound.id).unwrap().windows.len(), 1);
        assert!(!service.watchdog_reconcile_active_workspace().unwrap());
        assert_eq!(service.liveness_snapshot(&bound.id).unwrap().windows.len(), 1);
    }

    #[test]
    fn payload_has_workspace_id_and_no_hwnd() {
        let payload = WorkspaceWindowsChanged {
            workspace_id: "ws-1".into(),
            workspace_app_id: Some("wa-1".into()),
            preview_released: Some(true),
            preview_seq: Some(1),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("workspaceId"));
        assert!(json.contains("workspaceAppId"));
        assert!(json.contains("previewReleased"));
        assert!(json.contains("previewSeq"));
        assert!(!json.to_ascii_lowercase().contains("hwnd"));
        assert!(!json.contains("externalWindowId"));
        assert!(!json.contains("external_window_id"));
        assert!(!json.contains("EVENT_OBJECT"));

        let without_release = WorkspaceWindowsChanged {
            workspace_id: "ws-1".into(),
            workspace_app_id: Some("wa-1".into()),
            preview_released: None,
            preview_seq: None,
        };
        let omitted = serde_json::to_string(&without_release).unwrap();
        assert!(!omitted.contains("previewSeq"));
        assert!(!omitted.contains("previewReleased"));
    }

    #[test]
    fn bound_set_ignores_unbound_opaque_ids() {
        note_bound_running("mock:bound");
        assert!(is_running_bound_opaque("mock:bound"));
        assert!(!is_running_bound_opaque("mock:explorer-toast"));
        note_bound_closed("mock:bound");
        assert!(!is_running_bound_opaque("mock:bound"));
    }
}
