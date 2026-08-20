-- First-cut schema. Statements are idempotent so the migration can be re-applied.

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  asset_type TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  storage_path TEXT NOT NULL,
  original_path TEXT,
  byte_size INTEGER,
  sha256 TEXT,
  width INTEGER,
  height INTEGER,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  last_opened_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS installed_apps (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  app_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  source TEXT NOT NULL,
  launch_target TEXT NOT NULL,
  launch_args TEXT,
  working_dir TEXT,
  icon_asset_id TEXT,
  publisher TEXT,
  version TEXT,
  install_location TEXT,
  executable_path TEXT,
  url TEXT,
  command_template TEXT,
  scan_fingerprint TEXT,
  last_scanned_at TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  is_user_added INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(icon_asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS workspace_apps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  installed_app_id TEXT NOT NULL,
  display_alias TEXT,
  purpose_note TEXT,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  launch_on_workspace_open INTEGER NOT NULL DEFAULT 0,
  last_launched_at TEXT,
  last_focused_at TEXT,
  last_window_id TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY(installed_app_id) REFERENCES installed_apps(id)
);

CREATE TABLE IF NOT EXISTS native_windows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_app_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_window_id TEXT NOT NULL,
  process_id INTEGER,
  process_path TEXT,
  title TEXT,
  bounds_json TEXT,
  is_minimized INTEGER,
  last_seen_at TEXT NOT NULL,
  last_focused_at TEXT,
  binding_confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY(workspace_app_id) REFERENCES workspace_apps(id)
);

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  title TEXT,
  content_markdown TEXT,
  content_text TEXT,
  asset_id TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL,
  height REAL,
  color TEXT,
  metadata_json TEXT,
  z_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY(asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  label TEXT,
  edge_type TEXT NOT NULL DEFAULT 'default',
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY(source_node_id) REFERENCES canvas_nodes(id),
  FOREIGN KEY(target_node_id) REFERENCES canvas_nodes(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  workspace_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
