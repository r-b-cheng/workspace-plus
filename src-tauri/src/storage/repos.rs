use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::domain::{
    app_type_to_launch_kind, installed_app_source_to_dto, native_window_status_to_dto,
    workspace_app_status_to_dto, Asset, CanvasEdge, CanvasNode, InstalledApp, Workspace,
    WorkspaceApp, WorkspaceAppWindow,
};
use crate::errors::AppError;

pub const ACTIVE_WORKSPACE_KEY: &str = "active_workspace_id";
pub const QUICK_SWITCH_SHORTCUT_KEY: &str = "quick_switch_shortcut";

#[derive(Clone, Debug)]
pub struct InstalledAppRow {
    pub id: String,
    pub display_name: String,
    pub normalized_name: String,
    pub app_type: String,
    pub platform: String,
    pub source: String,
    pub launch_target: String,
    pub launch_args: Option<String>,
    pub working_dir: Option<String>,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_location: Option<String>,
    pub executable_path: Option<String>,
    pub url: Option<String>,
    pub command_template: Option<String>,
    pub scan_fingerprint: Option<String>,
    pub last_scanned_at: Option<String>,
    pub is_available: bool,
    pub is_user_added: bool,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Clone, Debug)]
pub struct WorkspaceAppRow {
    pub id: String,
    pub workspace_id: String,
    pub installed_app_id: String,
    pub display_alias: Option<String>,
    pub purpose_note: Option<String>,
    pub category: Option<String>,
    pub sort_order: i64,
    pub last_launched_at: Option<String>,
    pub last_focused_at: Option<String>,
    pub last_window_id: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

pub fn workspace_get(conn: &Connection, id: &str) -> Result<Option<Workspace>, AppError> {
    let active_id = settings_get(conn, ACTIVE_WORKSPACE_KEY)?;
    let row = conn
        .query_row(
            "SELECT w.id, w.name, w.description, w.icon, w.color, w.is_archived,
                    w.last_opened_at, w.updated_at,
                    (SELECT COUNT(*) FROM workspace_apps a
                      WHERE a.workspace_id = w.id AND a.deleted_at IS NULL) AS app_count
             FROM workspaces w
             WHERE w.id = ?1 AND w.deleted_at IS NULL",
            [id],
            |row| map_workspace(row, active_id.as_deref()),
        )
        .optional()?;
    Ok(row)
}

pub fn workspace_list(conn: &Connection) -> Result<Vec<Workspace>, AppError> {
    let active_id = settings_get(conn, ACTIVE_WORKSPACE_KEY)?;
    let mut stmt = conn.prepare(
        "SELECT w.id, w.name, w.description, w.icon, w.color, w.is_archived,
                w.last_opened_at, w.updated_at,
                (SELECT COUNT(*) FROM workspace_apps a
                  WHERE a.workspace_id = w.id AND a.deleted_at IS NULL) AS app_count
         FROM workspaces w
         WHERE w.deleted_at IS NULL AND w.is_archived = 0
         ORDER BY (w.last_opened_at IS NULL), w.last_opened_at DESC,
                  w.sort_order ASC, w.updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| map_workspace(row, active_id.as_deref()))?;
    collect_rows(rows)
}

fn map_workspace(row: &Row<'_>, active_id: Option<&str>) -> rusqlite::Result<Workspace> {
    let id: String = row.get(0)?;
    Ok(Workspace {
        id: id.clone(),
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        color: row.get(4)?,
        archived: row.get::<_, i64>(5)? == 1,
        last_opened_at: row.get(6)?,
        updated_at: row.get(7)?,
        app_count: row.get::<_, i64>(8)? as u32,
        is_active: active_id == Some(id.as_str()),
    })
}

pub fn workspace_next_sort_order(conn: &Connection) -> Result<i64, AppError> {
    let value: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspaces",
        [],
        |row| row.get(0),
    )?;
    Ok(value)
}

pub fn workspace_insert(
    conn: &Connection,
    id: &str,
    name: &str,
    description: Option<&str>,
    icon: Option<&str>,
    color: Option<&str>,
    sort_order: i64,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspaces (
            id, name, description, icon, color, sort_order, is_archived,
            last_opened_at, created_at, updated_at, deleted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, NULL, ?7, ?7, NULL)",
        params![id, name, description, icon, color, sort_order, now],
    )?;
    Ok(())
}

pub fn workspace_rename(conn: &Connection, id: &str, name: &str, now: &str) -> Result<usize, AppError> {
    let changed = conn.execute(
        "UPDATE workspaces SET name = ?1, updated_at = ?2
         WHERE id = ?3 AND deleted_at IS NULL",
        params![name, now, id],
    )?;
    Ok(changed)
}

pub fn workspace_touch_opened(conn: &Connection, id: &str, now: &str) -> Result<usize, AppError> {
    let changed = conn.execute(
        "UPDATE workspaces SET last_opened_at = ?1, updated_at = ?1
         WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(changed)
}

pub fn workspace_soft_delete(conn: &Connection, id: &str, now: &str) -> Result<usize, AppError> {
    let changed = conn.execute(
        "UPDATE workspaces SET deleted_at = ?1, updated_at = ?1
         WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(changed)
}

pub fn installed_app_get(conn: &Connection, id: &str) -> Result<Option<InstalledAppRow>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, display_name, normalized_name, app_type, platform, source,
                    launch_target, launch_args, working_dir, publisher, version,
                    install_location, executable_path, url, command_template,
                    scan_fingerprint, last_scanned_at, is_available, is_user_added,
                    created_at, updated_at, deleted_at
             FROM installed_apps WHERE id = ?1",
            [id],
            map_installed_app_row,
        )
        .optional()?;
    Ok(row)
}

pub fn installed_app_find_by_fingerprint(
    conn: &Connection,
    platform: &str,
    fingerprint: &str,
) -> Result<Option<InstalledAppRow>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, display_name, normalized_name, app_type, platform, source,
                    launch_target, launch_args, working_dir, publisher, version,
                    install_location, executable_path, url, command_template,
                    scan_fingerprint, last_scanned_at, is_available, is_user_added,
                    created_at, updated_at, deleted_at
             FROM installed_apps
             WHERE platform = ?1 AND scan_fingerprint = ?2 AND deleted_at IS NULL",
            params![platform, fingerprint],
            map_installed_app_row,
        )
        .optional()?;
    Ok(row)
}

pub fn installed_app_list(
    conn: &Connection,
    query: Option<&str>,
) -> Result<Vec<InstalledAppRow>, AppError> {
    if let Some(raw) = query.map(str::trim).filter(|value| !value.is_empty()) {
        let like = format!("%{}%", raw.to_lowercase());
        let mut stmt = conn.prepare(
            "SELECT id, display_name, normalized_name, app_type, platform, source,
                    launch_target, launch_args, working_dir, publisher, version,
                    install_location, executable_path, url, command_template,
                    scan_fingerprint, last_scanned_at, is_available, is_user_added,
                    created_at, updated_at, deleted_at
             FROM installed_apps
             WHERE deleted_at IS NULL
               AND (normalized_name LIKE ?1
                    OR lower(display_name) LIKE ?1
                    OR lower(launch_target) LIKE ?1)
             ORDER BY display_name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([like], map_installed_app_row)?;
        collect_rows(rows)
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, display_name, normalized_name, app_type, platform, source,
                    launch_target, launch_args, working_dir, publisher, version,
                    install_location, executable_path, url, command_template,
                    scan_fingerprint, last_scanned_at, is_available, is_user_added,
                    created_at, updated_at, deleted_at
             FROM installed_apps
             WHERE deleted_at IS NULL
             ORDER BY display_name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], map_installed_app_row)?;
        collect_rows(rows)
    }
}

pub fn installed_app_list_scan_managed(conn: &Connection) -> Result<Vec<InstalledAppRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, display_name, normalized_name, app_type, platform, source,
                launch_target, launch_args, working_dir, publisher, version,
                install_location, executable_path, url, command_template,
                scan_fingerprint, last_scanned_at, is_available, is_user_added,
                created_at, updated_at, deleted_at
         FROM installed_apps
         WHERE deleted_at IS NULL AND is_user_added = 0 AND scan_fingerprint IS NOT NULL",
    )?;
    let rows = stmt.query_map([], map_installed_app_row)?;
    collect_rows(rows)
}

fn map_installed_app_row(row: &Row<'_>) -> rusqlite::Result<InstalledAppRow> {
    Ok(InstalledAppRow {
        id: row.get(0)?,
        display_name: row.get(1)?,
        normalized_name: row.get(2)?,
        app_type: row.get(3)?,
        platform: row.get(4)?,
        source: row.get(5)?,
        launch_target: row.get(6)?,
        launch_args: row.get(7)?,
        working_dir: row.get(8)?,
        publisher: row.get(9)?,
        version: row.get(10)?,
        install_location: row.get(11)?,
        executable_path: row.get(12)?,
        url: row.get(13)?,
        command_template: row.get(14)?,
        scan_fingerprint: row.get(15)?,
        last_scanned_at: row.get(16)?,
        is_available: row.get::<_, i64>(17)? == 1,
        is_user_added: row.get::<_, i64>(18)? == 1,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
        deleted_at: row.get(21)?,
    })
}

pub fn installed_app_insert(conn: &Connection, row: &InstalledAppRow) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO installed_apps (
            id, display_name, normalized_name, app_type, platform, source,
            launch_target, launch_args, working_dir, icon_asset_id, publisher,
            version, install_location, executable_path, url, command_template,
            scan_fingerprint, last_scanned_at, is_available, is_user_added,
            created_at, updated_at, deleted_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?11, ?12, ?13, ?14,
            ?15, ?16, ?17, ?18, ?19, ?20, ?21, NULL
         )",
        params![
            row.id,
            row.display_name,
            row.normalized_name,
            row.app_type,
            row.platform,
            row.source,
            row.launch_target,
            row.launch_args,
            row.working_dir,
            row.publisher,
            row.version,
            row.install_location,
            row.executable_path,
            row.url,
            row.command_template,
            row.scan_fingerprint,
            row.last_scanned_at,
            if row.is_available { 1 } else { 0 },
            if row.is_user_added { 1 } else { 0 },
            row.created_at,
            row.updated_at,
        ],
    )?;
    Ok(())
}

pub fn installed_app_update_from_scan(
    conn: &Connection,
    id: &str,
    display_name: &str,
    normalized_name: &str,
    app_type: &str,
    source: &str,
    launch_target: &str,
    launch_args: Option<&str>,
    working_dir: Option<&str>,
    publisher: Option<&str>,
    version: Option<&str>,
    install_location: Option<&str>,
    executable_path: Option<&str>,
    last_scanned_at: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE installed_apps
         SET display_name = ?1, normalized_name = ?2, app_type = ?3, source = ?4,
             launch_target = ?5, launch_args = ?6, working_dir = ?7, publisher = ?8,
             version = ?9, install_location = ?10, executable_path = ?11,
             last_scanned_at = ?12, is_available = 1, updated_at = ?13, deleted_at = NULL
         WHERE id = ?14",
        params![
            display_name,
            normalized_name,
            app_type,
            source,
            launch_target,
            launch_args,
            working_dir,
            publisher,
            version,
            install_location,
            executable_path,
            last_scanned_at,
            now,
            id,
        ],
    )?;
    Ok(())
}

pub fn installed_app_mark_unavailable(conn: &Connection, id: &str, now: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE installed_apps SET is_available = 0, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn workspace_app_ids_in_workspace(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT installed_app_id FROM workspace_apps
         WHERE workspace_id = ?1 AND deleted_at IS NULL",
    )?;
    let rows = stmt.query_map([workspace_id], |row| row.get(0))?;
    collect_rows(rows)
}

pub fn workspace_app_get(conn: &Connection, id: &str) -> Result<Option<WorkspaceAppRow>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, workspace_id, installed_app_id, display_alias, purpose_note,
                    category, sort_order, last_launched_at, last_focused_at,
                    last_window_id, status, created_at, updated_at, deleted_at
             FROM workspace_apps WHERE id = ?1",
            [id],
            map_workspace_app_row,
        )
        .optional()?;
    Ok(row)
}

pub fn workspace_app_find_active(
    conn: &Connection,
    workspace_id: &str,
    installed_app_id: &str,
) -> Result<Option<WorkspaceAppRow>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, workspace_id, installed_app_id, display_alias, purpose_note,
                    category, sort_order, last_launched_at, last_focused_at,
                    last_window_id, status, created_at, updated_at, deleted_at
             FROM workspace_apps
             WHERE workspace_id = ?1 AND installed_app_id = ?2 AND deleted_at IS NULL",
            params![workspace_id, installed_app_id],
            map_workspace_app_row,
        )
        .optional()?;
    Ok(row)
}

pub fn workspace_app_find_including_deleted(
    conn: &Connection,
    workspace_id: &str,
    installed_app_id: &str,
) -> Result<Option<WorkspaceAppRow>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, workspace_id, installed_app_id, display_alias, purpose_note,
                    category, sort_order, last_launched_at, last_focused_at,
                    last_window_id, status, created_at, updated_at, deleted_at
             FROM workspace_apps
             WHERE workspace_id = ?1 AND installed_app_id = ?2
             ORDER BY (deleted_at IS NULL) DESC, updated_at DESC
             LIMIT 1",
            params![workspace_id, installed_app_id],
            map_workspace_app_row,
        )
        .optional()?;
    Ok(row)
}

fn map_workspace_app_row(row: &Row<'_>) -> rusqlite::Result<WorkspaceAppRow> {
    Ok(WorkspaceAppRow {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        installed_app_id: row.get(2)?,
        display_alias: row.get(3)?,
        purpose_note: row.get(4)?,
        category: row.get(5)?,
        sort_order: row.get(6)?,
        last_launched_at: row.get(7)?,
        last_focused_at: row.get(8)?,
        last_window_id: row.get(9)?,
        status: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        deleted_at: row.get(13)?,
    })
}

pub fn workspace_app_next_sort_order(conn: &Connection, workspace_id: &str) -> Result<i64, AppError> {
    let value: i64 = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM workspace_apps WHERE workspace_id = ?1",
        [workspace_id],
        |row| row.get(0),
    )?;
    Ok(value)
}

pub fn workspace_app_insert(conn: &Connection, row: &WorkspaceAppRow) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO workspace_apps (
            id, workspace_id, installed_app_id, display_alias, purpose_note,
            category, sort_order, pinned, launch_on_workspace_open,
            last_launched_at, last_focused_at, last_window_id, status,
            created_at, updated_at, deleted_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, 0, ?8, ?9, ?10, ?11, ?12, ?13, NULL
         )",
        params![
            row.id,
            row.workspace_id,
            row.installed_app_id,
            row.display_alias,
            row.purpose_note,
            row.category,
            row.sort_order,
            row.last_launched_at,
            row.last_focused_at,
            row.last_window_id,
            row.status,
            row.created_at,
            row.updated_at,
        ],
    )?;
    Ok(())
}

pub fn workspace_app_restore(
    conn: &Connection,
    id: &str,
    status: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE workspace_apps
         SET deleted_at = NULL, status = ?1, updated_at = ?2
         WHERE id = ?3",
        params![status, now, id],
    )?;
    Ok(())
}

pub fn workspace_app_update_launch(
    conn: &Connection,
    id: &str,
    status: &str,
    last_window_id: Option<&str>,
    last_launched_at: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE workspace_apps
         SET status = ?1, last_window_id = ?2, last_launched_at = ?3, updated_at = ?4
         WHERE id = ?5",
        params![status, last_window_id, last_launched_at, now, id],
    )?;
    Ok(())
}

pub fn workspace_app_update_focus(
    conn: &Connection,
    id: &str,
    status: &str,
    last_focused_at: Option<&str>,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE workspace_apps
         SET status = ?1, last_focused_at = COALESCE(?2, last_focused_at), updated_at = ?3
         WHERE id = ?4",
        params![status, last_focused_at, now, id],
    )?;
    Ok(())
}

pub fn workspace_app_soft_delete(conn: &Connection, id: &str, now: &str) -> Result<usize, AppError> {
    let changed = conn.execute(
        "UPDATE workspace_apps SET deleted_at = ?1, updated_at = ?1
         WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(changed)
}

pub fn workspace_app_soft_delete_for_workspace(
    conn: &Connection,
    workspace_id: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE workspace_apps SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL",
        params![now, workspace_id],
    )?;
    Ok(())
}

pub fn workspace_app_list_dto(
    conn: &Connection,
    workspace_id: &str,
) -> Result<Vec<WorkspaceApp>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT wa.id, wa.workspace_id, wa.installed_app_id, ia.display_name,
                wa.display_alias, wa.purpose_note, wa.category, wa.status,
                wa.last_focused_at, wa.last_launched_at, nw.title, nw.external_window_id
         FROM workspace_apps wa
         JOIN installed_apps ia ON ia.id = wa.installed_app_id
         LEFT JOIN native_windows nw
                ON nw.id = wa.last_window_id AND nw.deleted_at IS NULL
         WHERE wa.workspace_id = ?1 AND wa.deleted_at IS NULL
         ORDER BY wa.pinned DESC, wa.sort_order ASC, wa.updated_at DESC",
    )?;
    let rows = stmt.query_map([workspace_id], |row| {
        Ok(WorkspaceApp {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            installed_app_id: row.get(2)?,
            name: row.get(3)?,
            alias: row.get(4)?,
            note: row.get(5)?,
            icon_url: None,
            category: row.get(6)?,
            status: workspace_app_status_to_dto(&row.get::<_, String>(7)?),
            last_focused_at: row.get(8)?,
            last_launched_at: row.get(9)?,
            window_title: row.get(10)?,
            native_window_id: row.get(11)?,
            preview_image_url: None,
            error_message: None,
            embed_enabled: false,
        })
    })?;
    let mut apps = collect_rows(rows)?;
    for app in &mut apps {
        app.embed_enabled = workspace_app_embed_enabled(conn, &app.id)?;
    }
    Ok(apps)
}

pub fn workspace_app_embed_key(workspace_app_id: &str) -> String {
    format!("workspace_app_embed:{workspace_app_id}")
}

pub fn workspace_app_embed_enabled(
    conn: &Connection,
    workspace_app_id: &str,
) -> Result<bool, AppError> {
    Ok(settings_get(conn, &workspace_app_embed_key(workspace_app_id))?.as_deref() == Some("true"))
}

pub fn workspace_app_get_dto(
    conn: &Connection,
    workspace_app_id: &str,
) -> Result<Option<WorkspaceApp>, AppError> {
    let Some(row) = workspace_app_get(conn, workspace_app_id)?.filter(|item| item.deleted_at.is_none())
    else {
        return Ok(None);
    };
    Ok(workspace_app_list_dto(conn, &row.workspace_id)?
        .into_iter()
        .find(|item| item.id == workspace_app_id))
}

pub fn native_window_insert(
    conn: &Connection,
    id: &str,
    workspace_id: &str,
    workspace_app_id: &str,
    platform: &str,
    external_window_id: &str,
    process_id: Option<i64>,
    process_path: Option<&str>,
    title: Option<&str>,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO native_windows (
            id, workspace_id, workspace_app_id, platform, external_window_id,
            process_id, process_path, title, bounds_json, is_minimized,
            last_seen_at, last_focused_at, binding_confidence, status,
            created_at, updated_at, deleted_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 0, ?9, NULL, 1, 'running',
            ?9, ?9, NULL
         )",
        params![
            id,
            workspace_id,
            workspace_app_id,
            platform,
            external_window_id,
            process_id,
            process_path,
            title,
            now,
        ],
    )?;
    Ok(())
}

pub fn native_window_get_external_id(
    conn: &Connection,
    id: &str,
) -> Result<Option<(String, String)>, AppError> {
    let row = conn
        .query_row(
            "SELECT external_window_id, status FROM native_windows
             WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    Ok(row)
}

#[derive(Clone, Debug)]
pub struct NativeWindowBinding {
    pub id: String,
    pub external_window_id: String,
    pub process_id: Option<i64>,
    pub process_path: Option<String>,
    pub title: Option<String>,
    pub status: String,
}

pub fn native_window_bound_external_ids(
    conn: &Connection,
    except_workspace_app_id: Option<&str>,
) -> Result<Vec<String>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT nw.external_window_id
         FROM native_windows nw
         INNER JOIN workspace_apps wa ON wa.id = nw.workspace_app_id
         WHERE wa.deleted_at IS NULL
           AND nw.deleted_at IS NULL
           AND nw.status = 'running'
           AND (?1 IS NULL OR nw.workspace_app_id != ?1)",
    )?;
    let rows = stmt.query_map(params![except_workspace_app_id], |row| row.get(0))?;
    collect_rows(rows)
}

pub fn native_window_get_binding(
    conn: &Connection,
    id: &str,
) -> Result<Option<NativeWindowBinding>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, external_window_id, process_id, process_path, title, status
             FROM native_windows
             WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok(NativeWindowBinding {
                    id: row.get(0)?,
                    external_window_id: row.get(1)?,
                    process_id: row.get(2)?,
                    process_path: row.get(3)?,
                    title: row.get(4)?,
                    status: row.get(5)?,
                })
            },
        )
        .optional()?;
    Ok(row)
}

pub fn workspace_app_bind_window(
    conn: &Connection,
    id: &str,
    last_window_id: &str,
    status: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE workspace_apps
         SET last_window_id = ?1, status = ?2, last_focused_at = ?3, updated_at = ?3
         WHERE id = ?4",
        params![last_window_id, status, now, id],
    )?;
    Ok(())
}

pub fn workspace_app_set_last_window(
    conn: &Connection,
    id: &str,
    last_window_id: Option<&str>,
    status: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE workspace_apps
         SET last_window_id = ?1, status = ?2, updated_at = ?3
         WHERE id = ?4",
        params![last_window_id, status, now, id],
    )?;
    Ok(())
}

#[derive(Clone, Debug)]
pub struct NativeWindowRow {
    pub id: String,
    pub workspace_id: String,
    pub workspace_app_id: String,
    pub external_window_id: String,
    pub process_id: Option<i64>,
    pub process_path: Option<String>,
    pub title: Option<String>,
    pub last_seen_at: String,
    pub last_focused_at: Option<String>,
    pub status: String,
}

fn map_native_window_row(row: &Row<'_>) -> rusqlite::Result<NativeWindowRow> {
    Ok(NativeWindowRow {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        workspace_app_id: row.get(2)?,
        external_window_id: row.get(3)?,
        process_id: row.get(4)?,
        process_path: row.get(5)?,
        title: row.get(6)?,
        last_seen_at: row.get(7)?,
        last_focused_at: row.get(8)?,
        status: row.get(9)?,
    })
}

const NATIVE_WINDOW_ROW_COLUMNS: &str = "id, workspace_id, workspace_app_id, external_window_id,
            process_id, process_path, title, last_seen_at, last_focused_at, status";

pub fn native_window_get(conn: &Connection, id: &str) -> Result<Option<NativeWindowRow>, AppError> {
    let row = conn
        .query_row(
            &format!(
                "SELECT {NATIVE_WINDOW_ROW_COLUMNS}
                 FROM native_windows
                 WHERE id = ?1 AND deleted_at IS NULL"
            ),
            [id],
            map_native_window_row,
        )
        .optional()?;
    Ok(row)
}

pub fn native_window_find_by_external(
    conn: &Connection,
    workspace_app_id: &str,
    external_window_id: &str,
) -> Result<Option<NativeWindowRow>, AppError> {
    let row = conn
        .query_row(
            &format!(
                "SELECT {NATIVE_WINDOW_ROW_COLUMNS}
                 FROM native_windows
                 WHERE workspace_app_id = ?1 AND external_window_id = ?2 AND deleted_at IS NULL
                 ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, updated_at DESC
                 LIMIT 1"
            ),
            params![workspace_app_id, external_window_id],
            map_native_window_row,
        )
        .optional()?;
    Ok(row)
}

pub fn native_window_list_rows(
    conn: &Connection,
    workspace_app_id: &str,
) -> Result<Vec<NativeWindowRow>, AppError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {NATIVE_WINDOW_ROW_COLUMNS}
         FROM native_windows
         WHERE workspace_app_id = ?1 AND deleted_at IS NULL"
    ))?;
    let rows = stmt.query_map([workspace_app_id], map_native_window_row)?;
    collect_rows(rows)
}

pub fn native_window_list_dto(
    conn: &Connection,
    workspace_app_id: &str,
) -> Result<Vec<WorkspaceAppWindow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_app_id, title, status, last_focused_at
         FROM native_windows
         WHERE workspace_app_id = ?1 AND deleted_at IS NULL
         ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END,
                  CASE WHEN last_focused_at IS NULL THEN 1 ELSE 0 END,
                  last_focused_at DESC,
                  last_seen_at DESC,
                  updated_at DESC",
    )?;
    let rows = stmt.query_map([workspace_app_id], |row| {
        Ok(WorkspaceAppWindow {
            id: row.get(0)?,
            workspace_app_id: row.get(1)?,
            title: row
                .get::<_, Option<String>>(2)?
                .unwrap_or_default(),
            status: native_window_status_to_dto(&row.get::<_, String>(3)?),
            last_focused_at: row.get(4)?,
        })
    })?;
    collect_rows(rows)
}

pub fn native_window_is_running(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let status: Option<String> = conn
        .query_row(
            "SELECT status FROM native_windows
             WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(status.as_deref() == Some("running"))
}

pub fn native_window_most_recent_running_id(
    conn: &Connection,
    workspace_app_id: &str,
) -> Result<Option<String>, AppError> {
    let id = conn
        .query_row(
            "SELECT id FROM native_windows
             WHERE workspace_app_id = ?1 AND deleted_at IS NULL AND status = 'running'
             ORDER BY CASE WHEN last_focused_at IS NULL THEN 1 ELSE 0 END,
                      last_focused_at DESC,
                      last_seen_at DESC
             LIMIT 1",
            [workspace_app_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(id)
}

pub fn native_window_update_seen(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    process_id: Option<i64>,
    process_path: Option<&str>,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE native_windows
         SET title = ?1, process_id = ?2, process_path = ?3,
             last_seen_at = ?4, status = 'running', updated_at = ?4
         WHERE id = ?5",
        params![title, process_id, process_path, now, id],
    )?;
    Ok(())
}

pub fn native_window_mark_closed(conn: &Connection, id: &str, now: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE native_windows SET status = 'closed', updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn native_window_touch_focus(conn: &Connection, id: &str, now: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE native_windows
         SET last_focused_at = ?1, last_seen_at = ?1, status = 'running', updated_at = ?1
         WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn native_window_soft_delete_for_workspace(
    conn: &Connection,
    workspace_id: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE native_windows SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL",
        params![now, workspace_id],
    )?;
    Ok(())
}

pub fn native_window_soft_delete_for_workspace_app(
    conn: &Connection,
    workspace_app_id: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE native_windows SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_app_id = ?2 AND deleted_at IS NULL",
        params![now, workspace_app_id],
    )?;
    Ok(())
}

pub fn canvas_node_list(conn: &Connection, workspace_id: &str) -> Result<Vec<CanvasNode>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, node_type, title, content_markdown, content_text,
                asset_id, x, y, width, height, color, metadata_json, z_index,
                created_at, updated_at
         FROM canvas_nodes
         WHERE workspace_id = ?1 AND deleted_at IS NULL
         ORDER BY z_index ASC, updated_at ASC",
    )?;
    let rows = stmt.query_map([workspace_id], map_canvas_node)?;
    collect_rows(rows)
}

fn map_canvas_node(row: &Row<'_>) -> rusqlite::Result<CanvasNode> {
    Ok(CanvasNode {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        node_type: row.get(2)?,
        title: row.get(3)?,
        content_markdown: row.get(4)?,
        content_text: row.get(5)?,
        asset_id: row.get(6)?,
        x: row.get(7)?,
        y: row.get(8)?,
        width: row.get(9)?,
        height: row.get(10)?,
        color: row.get(11)?,
        metadata_json: row.get(12)?,
        z_index: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

pub fn canvas_node_exists(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let found: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM canvas_nodes WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )?;
    Ok(found)
}

pub fn canvas_node_insert(conn: &Connection, node: &CanvasNode) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO canvas_nodes (
            id, workspace_id, node_type, title, content_markdown, content_text,
            asset_id, x, y, width, height, color, metadata_json, z_index,
            created_at, updated_at, deleted_at
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, NULL
         )",
        params![
            node.id,
            node.workspace_id,
            node.node_type,
            node.title,
            node.content_markdown,
            node.content_text,
            node.asset_id,
            node.x,
            node.y,
            node.width,
            node.height,
            node.color,
            node.metadata_json,
            node.z_index,
            node.created_at,
            node.updated_at,
        ],
    )?;
    Ok(())
}

pub fn canvas_node_update(conn: &Connection, node: &CanvasNode) -> Result<(), AppError> {
    conn.execute(
        "UPDATE canvas_nodes
         SET workspace_id = ?1, node_type = ?2, title = ?3, content_markdown = ?4,
             content_text = ?5, asset_id = ?6, x = ?7, y = ?8, width = ?9, height = ?10,
             color = ?11, metadata_json = ?12, z_index = ?13, updated_at = ?14,
             deleted_at = NULL
         WHERE id = ?15",
        params![
            node.workspace_id,
            node.node_type,
            node.title,
            node.content_markdown,
            node.content_text,
            node.asset_id,
            node.x,
            node.y,
            node.width,
            node.height,
            node.color,
            node.metadata_json,
            node.z_index,
            node.updated_at,
            node.id,
        ],
    )?;
    Ok(())
}

pub fn canvas_node_soft_delete(conn: &Connection, id: &str, now: &str) -> Result<usize, AppError> {
    let changed = conn.execute(
        "UPDATE canvas_nodes SET deleted_at = ?1, updated_at = ?1
         WHERE id = ?2 AND deleted_at IS NULL",
        params![now, id],
    )?;
    Ok(changed)
}

pub fn canvas_node_soft_delete_missing(
    conn: &Connection,
    workspace_id: &str,
    keep_ids: &[String],
    now: &str,
) -> Result<(), AppError> {
    if keep_ids.is_empty() {
        conn.execute(
            "UPDATE canvas_nodes SET deleted_at = ?1, updated_at = ?1
             WHERE workspace_id = ?2 AND deleted_at IS NULL",
            params![now, workspace_id],
        )?;
        return Ok(());
    }

    let placeholders = keep_ids
        .iter()
        .enumerate()
        .map(|(index, _)| format!("?{}", index + 3))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "UPDATE canvas_nodes SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL AND id NOT IN ({placeholders})"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut values: Vec<&dyn rusqlite::types::ToSql> = vec![&now, &workspace_id];
    for id in keep_ids {
        values.push(id);
    }
    stmt.execute(values.as_slice())?;
    Ok(())
}

pub fn canvas_node_soft_delete_for_workspace(
    conn: &Connection,
    workspace_id: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE canvas_nodes SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL",
        params![now, workspace_id],
    )?;
    Ok(())
}

pub fn canvas_edge_list(conn: &Connection, workspace_id: &str) -> Result<Vec<CanvasEdge>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, source_node_id, target_node_id, label, edge_type,
                metadata_json, created_at, updated_at
         FROM canvas_edges
         WHERE workspace_id = ?1 AND deleted_at IS NULL
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([workspace_id], |row| {
        Ok(CanvasEdge {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            source_node_id: row.get(2)?,
            target_node_id: row.get(3)?,
            label: row.get(4)?,
            edge_type: row.get(5)?,
            metadata_json: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    collect_rows(rows)
}

pub fn canvas_edge_exists(conn: &Connection, id: &str) -> Result<bool, AppError> {
    let found: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM canvas_edges WHERE id = ?1)",
        [id],
        |row| row.get(0),
    )?;
    Ok(found)
}

pub fn canvas_edge_insert(conn: &Connection, edge: &CanvasEdge) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO canvas_edges (
            id, workspace_id, source_node_id, target_node_id, label, edge_type,
            metadata_json, created_at, updated_at, deleted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)",
        params![
            edge.id,
            edge.workspace_id,
            edge.source_node_id,
            edge.target_node_id,
            edge.label,
            edge.edge_type,
            edge.metadata_json,
            edge.created_at,
            edge.updated_at,
        ],
    )?;
    Ok(())
}

pub fn canvas_edge_update(conn: &Connection, edge: &CanvasEdge) -> Result<(), AppError> {
    conn.execute(
        "UPDATE canvas_edges
         SET workspace_id = ?1, source_node_id = ?2, target_node_id = ?3, label = ?4,
             edge_type = ?5, metadata_json = ?6, updated_at = ?7, deleted_at = NULL
         WHERE id = ?8",
        params![
            edge.workspace_id,
            edge.source_node_id,
            edge.target_node_id,
            edge.label,
            edge.edge_type,
            edge.metadata_json,
            edge.updated_at,
            edge.id,
        ],
    )?;
    Ok(())
}

pub fn canvas_edge_soft_delete_for_node(
    conn: &Connection,
    workspace_id: &str,
    node_id: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE canvas_edges SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL
           AND (source_node_id = ?3 OR target_node_id = ?3)",
        params![now, workspace_id, node_id],
    )?;
    Ok(())
}

pub fn canvas_edge_soft_delete_missing(
    conn: &Connection,
    workspace_id: &str,
    keep_ids: &[String],
    now: &str,
) -> Result<(), AppError> {
    if keep_ids.is_empty() {
        conn.execute(
            "UPDATE canvas_edges SET deleted_at = ?1, updated_at = ?1
             WHERE workspace_id = ?2 AND deleted_at IS NULL",
            params![now, workspace_id],
        )?;
        return Ok(());
    }

    let placeholders = keep_ids
        .iter()
        .enumerate()
        .map(|(index, _)| format!("?{}", index + 3))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "UPDATE canvas_edges SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL AND id NOT IN ({placeholders})"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut values: Vec<&dyn rusqlite::types::ToSql> = vec![&now, &workspace_id];
    for id in keep_ids {
        values.push(id);
    }
    stmt.execute(values.as_slice())?;
    Ok(())
}

pub fn canvas_edge_soft_delete_for_workspace(
    conn: &Connection,
    workspace_id: &str,
    now: &str,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE canvas_edges SET deleted_at = ?1, updated_at = ?1
         WHERE workspace_id = ?2 AND deleted_at IS NULL",
        params![now, workspace_id],
    )?;
    Ok(())
}

pub fn canvas_latest_updated_at(conn: &Connection, workspace_id: &str) -> Result<Option<String>, AppError> {
    let value: Option<String> = conn.query_row(
        "SELECT MAX(updated_at) FROM (
            SELECT updated_at FROM canvas_nodes
             WHERE workspace_id = ?1 AND deleted_at IS NULL
            UNION ALL
            SELECT updated_at FROM canvas_edges
             WHERE workspace_id = ?1 AND deleted_at IS NULL
         )",
        [workspace_id],
        |row| row.get(0),
    )?;
    Ok(value)
}

pub fn asset_get(conn: &Connection, id: &str) -> Result<Option<Asset>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, asset_type, mime_type, file_name, storage_path, byte_size,
                    sha256, source, created_at
             FROM assets
             WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            map_asset,
        )
        .optional()?;
    Ok(row)
}

pub fn asset_find_by_sha256(conn: &Connection, sha256: &str) -> Result<Option<Asset>, AppError> {
    let row = conn
        .query_row(
            "SELECT id, asset_type, mime_type, file_name, storage_path, byte_size,
                    sha256, source, created_at
             FROM assets
             WHERE sha256 = ?1 AND deleted_at IS NULL
             LIMIT 1",
            [sha256],
            map_asset,
        )
        .optional()?;
    Ok(row)
}

fn map_asset(row: &Row<'_>) -> rusqlite::Result<Asset> {
    Ok(Asset {
        id: row.get(0)?,
        asset_type: row.get(1)?,
        mime_type: row.get(2)?,
        file_name: row.get(3)?,
        storage_path: row.get(4)?,
        byte_size: row.get(5)?,
        sha256: row.get(6)?,
        source: row.get(7)?,
        created_at: row.get(8)?,
    })
}

pub fn asset_insert(conn: &Connection, asset: &Asset, now: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO assets (
            id, asset_type, mime_type, file_name, storage_path, original_path,
            byte_size, sha256, width, height, source, created_at, updated_at, deleted_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, NULL, NULL, ?8, ?9, ?9, NULL)",
        params![
            asset.id,
            asset.asset_type,
            asset.mime_type,
            asset.file_name,
            asset.storage_path,
            asset.byte_size,
            asset.sha256,
            asset.source,
            now,
        ],
    )?;
    Ok(())
}

pub fn settings_get(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.and_then(|raw| serde_json::from_str(&raw).ok()))
}

pub fn settings_delete(conn: &Connection, key: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM app_settings WHERE key = ?1", [key])?;
    Ok(())
}

pub fn settings_set(
    conn: &Connection,
    key: &str,
    value: Option<&str>,
    workspace_id: Option<&str>,
    now: &str,
) -> Result<(), AppError> {
    let encoded = serde_json::to_string(&value)?;
    conn.execute(
        "INSERT INTO app_settings (key, value_json, scope, workspace_id, created_at, updated_at)
         VALUES (?1, ?2, 'global', ?3, ?4, ?4)
         ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            workspace_id = excluded.workspace_id,
            updated_at = excluded.updated_at",
        params![key, encoded, workspace_id, now],
    )?;
    Ok(())
}

pub fn to_installed_app_dto(row: &InstalledAppRow, already_in_workspace: bool) -> InstalledApp {
    InstalledApp {
        id: row.id.clone(),
        name: row.display_name.clone(),
        icon_url: None,
        source: installed_app_source_to_dto(&row.source),
        launch_kind: app_type_to_launch_kind(&row.app_type),
        category: None,
        display_path: Some(row.launch_target.clone()),
        already_in_workspace,
        is_available: row.is_available,
        platform: row.platform.clone(),
    }
}

fn collect_rows<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&Row<'_>) -> rusqlite::Result<T>>,
) -> Result<Vec<T>, AppError> {
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

