-- Query indexes and uniqueness rules. Idempotent.

CREATE INDEX IF NOT EXISTS idx_workspaces_active_order
  ON workspaces(is_archived, sort_order, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspaces_last_opened
  ON workspaces(last_opened_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_installed_apps_name
  ON installed_apps(normalized_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_installed_apps_type_available
  ON installed_apps(app_type, is_available)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_installed_apps_fingerprint
  ON installed_apps(platform, scan_fingerprint)
  WHERE scan_fingerprint IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_apps_unique_active
  ON workspace_apps(workspace_id, installed_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_apps_workspace_order
  ON workspace_apps(workspace_id, pinned, sort_order, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_apps_app
  ON workspace_apps(installed_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_native_windows_workspace_app_seen
  ON native_windows(workspace_app_id, last_seen_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_native_windows_external
  ON native_windows(platform, external_window_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_native_windows_status
  ON native_windows(workspace_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_workspace_updated
  ON canvas_nodes(workspace_id, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_workspace_type
  ON canvas_nodes(workspace_id, node_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_canvas_edges_workspace_source
  ON canvas_edges(workspace_id, source_node_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_canvas_edges_unique_active
  ON canvas_edges(workspace_id, source_node_id, target_node_id, edge_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assets_sha256
  ON assets(sha256)
  WHERE sha256 IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assets_type
  ON assets(asset_type)
  WHERE deleted_at IS NULL;
