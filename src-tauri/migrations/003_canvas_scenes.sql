-- Drawing scene per workspace. One row, versioned JSON. Soft-deletable.

CREATE TABLE IF NOT EXISTS canvas_scenes (
  workspace_id TEXT PRIMARY KEY,
  scene_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
