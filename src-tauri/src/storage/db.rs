use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use sha2::{Digest, Sha256};

use crate::errors::AppError;

const MIGRATIONS: &[(&str, &str)] = &[
    (
        "001_init_core",
        include_str!("../../migrations/001_init_core.sql"),
    ),
    ("002_indexes", include_str!("../../migrations/002_indexes.sql")),
    (
        "003_canvas_scenes",
        include_str!("../../migrations/003_canvas_scenes.sql"),
    ),
];

const SCHEMA_MIGRATIONS_SQL: &str = "
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT
);
";

/// App-data layout: `data/workspace-hub.sqlite3` and `assets/`.
#[derive(Clone, Debug)]
pub struct AppPaths {
    pub root: PathBuf,
    pub data_dir: PathBuf,
    pub db_path: PathBuf,
    pub assets_dir: PathBuf,
}

impl AppPaths {
    /// Creates the on-disk layout under `root` if it does not exist.
    pub fn from_root(root: PathBuf) -> Result<Self, AppError> {
        let data_dir = root.join("data");
        let assets_dir = root.join("assets");
        fs::create_dir_all(&data_dir)
            .map_err(|_| AppError::internal("cannot create app data directory"))?;
        fs::create_dir_all(&assets_dir)
            .map_err(|_| AppError::internal("cannot create assets directory"))?;
        Ok(Self {
            db_path: data_dir.join("workspace-hub.sqlite3"),
            data_dir,
            assets_dir,
            root,
        })
    }
}

/// Opens a SQLite file, enables WAL/foreign keys, and applies migrations.
pub fn open_database(path: &Path) -> Result<Connection, AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|_| AppError::internal("cannot create database directory"))?;
    }
    let conn = Connection::open(path).map_err(AppError::from)?;
    configure_connection(&conn)?;
    apply_migrations(&conn)?;
    Ok(conn)
}

/// Applies journal, sync, and foreign-key PRAGMAs on this connection.
pub fn configure_connection(conn: &Connection) -> Result<(), AppError> {
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(AppError::from)?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(AppError::from)?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(AppError::from)?;
    Ok(())
}

/// Applies pending schema migrations. Safe to call more than once.
pub fn apply_migrations(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(SCHEMA_MIGRATIONS_SQL)
        .map_err(|err| AppError::migration_failed(format!("cannot create migration table: {err}")))?;

    for (index, (name, sql)) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as i64;
        let already: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
                [version],
                |row| row.get(0),
            )
            .map_err(AppError::from)?;
        if already {
            continue;
        }

        conn.execute_batch(sql).map_err(|err| {
            AppError::migration_failed(format!("migration {name} failed: {err}"))
        })?;

        let checksum = sha256_hex(sql.as_bytes());
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at, checksum)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![version, name, now_utc(), checksum],
        )
        .map_err(|err| AppError::migration_failed(format!("cannot record {name}: {err}")))?;
    }

    Ok(())
}

/// Re-runs the raw SQL batches. Used to prove migrations are idempotent.
pub fn reapply_migration_sql(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(SCHEMA_MIGRATIONS_SQL)
        .map_err(|err| AppError::migration_failed(err.to_string()))?;
    for (name, sql) in MIGRATIONS {
        conn.execute_batch(sql).map_err(|err| {
            AppError::migration_failed(format!("re-apply {name} failed: {err}"))
        })?;
    }
    Ok(())
}

pub fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn normalize_name(name: &str) -> String {
    name.trim().to_lowercase()
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn journal_mode(conn: &Connection) -> Result<String, AppError> {
    conn.query_row("PRAGMA journal_mode", [], |row| row.get::<_, String>(0))
        .map_err(AppError::from)
}

pub fn foreign_keys_enabled(conn: &Connection) -> Result<bool, AppError> {
    let value: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .map_err(AppError::from)?;
    Ok(value == 1)
}
