use tauri::{AppHandle, Emitter, State};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::domain::{
    classify_registration_error, to_plugin_accelerator, AppSettings, REGISTRATION_DENIED,
    REGISTRATION_REGISTERED, REGISTRATION_UNREGISTERED,
};
use crate::errors::AppError;
use crate::services::AppService;

#[tauri::command(rename_all = "camelCase")]
pub fn get_app_settings(state: State<AppService>) -> Result<AppSettings, AppError> {
    state.get_app_settings()
}

#[tauri::command(rename_all = "camelCase")]
pub fn update_app_settings(
    app: AppHandle,
    state: State<AppService>,
    quick_switch_shortcut: Option<String>,
) -> Result<AppSettings, AppError> {
    let settings = state.update_app_settings(quick_switch_shortcut)?;
    apply_quick_switch_shortcut(&app, &state, Some(&settings.quick_switch_shortcut));
    state.get_app_settings()
}

/// Registers the stored (or provided) shortcut. Failures are recorded, never panic.
pub fn apply_quick_switch_shortcut(
    app: &AppHandle,
    service: &AppService,
    shortcut_override: Option<&str>,
) {
    let shortcut = match shortcut_override.map(ToOwned::to_owned) {
        Some(value) => value,
        None => match service.get_app_settings() {
            Ok(settings) => settings.quick_switch_shortcut,
            Err(err) => {
                let _ = service.record_shortcut_registration(
                    REGISTRATION_UNREGISTERED,
                    Some(err.message),
                );
                return;
            }
        },
    };

    let accelerator = match to_plugin_accelerator(&shortcut) {
        Ok(value) => value,
        Err(err) => {
            let _ = service.record_shortcut_registration(REGISTRATION_DENIED, Some(err.message));
            return;
        }
    };

    if let Err(err) = app.global_shortcut().unregister_all() {
        tracing::warn!(error = %err, "failed to unregister previous global shortcuts");
    }

    match app.global_shortcut().register(accelerator.as_str()) {
        Ok(()) => {
            let _ = service.record_shortcut_registration(REGISTRATION_REGISTERED, None);
        }
        Err(err) => {
            let (status, message) = classify_registration_error(&err.to_string());
            let _ = service.record_shortcut_registration(status, Some(message));
        }
    }
}

pub fn emit_quick_switch_open(app: &AppHandle) {
    if let Err(err) = app.emit("quick-switch:open", ()) {
        tracing::warn!(error = %err, "failed to emit quick-switch:open");
    }
}
