# SQLite 数据模型与本地存储规格

制定日期：2026-06-07

本文定义第一版本地工作区管理器的数据模型、SQLite 表结构、索引、删除策略、自动保存策略和备份迁移边界。它面向 `Tauri 2 + React + TypeScript + Rust + SQLite` 的实现方式：前端只处理界面状态和业务语义调用，真实持久化由 Rust 后端通过 Repository/Service 层写入 SQLite；Windows/macOS 的软件扫描、启动和窗口能力由平台适配层提供，不把系统 API 细节写进数据库模型。

最重要的边界是：系统软件和工作区软件不是同一个对象。`installed_apps` 表示“这台电脑上可启动的软件、文件夹、URL 或命令”，是全局软件库；`workspace_apps` 表示“某个工作区绑定了某个可启动对象，并在这个工作区里有自己的别名、用途、排序、窗口绑定和状态”。同一个 Chrome 可以在多个工作区里出现，每个工作区可以有不同的备注和用途；删除工作区软件关联不能卸载 Chrome，删除工作区也不能关闭真实外部窗口。

## 1. 存储位置与文件组成

第一版使用一个主 SQLite 数据库保存结构化数据，资源文件单独落盘。推荐在 Tauri app data 目录下使用以下结构：

```text
workspace-hub/
  data/
    workspace-hub.sqlite3
    backups/
  assets/
    <asset_id>.<ext>
  logs/
```

SQLite 存储工作区、软件库、工作区软件关联、原生窗口绑定、白板节点、白板边、操作记录、资源元数据、设置和迁移记录。图片、截图等二进制内容不建议直接塞进 SQLite BLOB，第一版应保存到 `assets/` 目录，再由 `assets` 表记录路径、哈希、大小、来源和归属关系。这样数据库备份、白板保存和后续迁移都更可控。

数据库开启 `PRAGMA foreign_keys = ON`。建议使用 WAL 模式，降低自动保存时的写入阻塞：

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
```

## 2. 标识、时间与通用字段

主键统一使用 UUID 字符串，避免前端临时对象、Rust 后端和后续导入导出之间出现自增 ID 冲突。时间统一保存为 UTC ISO-8601 字符串，例如 `2026-06-07T10:30:00Z`。展示层再按用户本地时区格式化。

核心表建议保留以下通用字段：

```text
id TEXT PRIMARY KEY
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
deleted_at TEXT NULL
```

`deleted_at` 用于软删除。MVP 阶段不要急着做物理删除，因为工作区、白板节点、资源文件和操作记录存在引用关系，软删除更方便撤销、归档、备份和排查数据问题。物理清理由后续维护任务执行，并且必须遵守资源引用计数和备份策略。

## 3. workspaces

`workspaces` 是最高层组织单位，表示一个项目、任务或阶段性上下文。它不包含软件扫描结果本身，只引用工作区自己的软件关联、窗口绑定、白板和操作记录。

建议字段：

```sql
CREATE TABLE workspaces (
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
```

推荐索引：

```sql
CREATE INDEX idx_workspaces_active_order
  ON workspaces(is_archived, sort_order, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_workspaces_last_opened
  ON workspaces(last_opened_at)
  WHERE deleted_at IS NULL;
```

删除工作区时默认软删除 `workspaces.deleted_at`，并级联软删除该工作区下的 `workspace_apps`、`native_windows`、`canvas_nodes`、`canvas_edges`、`canvas_scenes`、`activity_entries`。这里的“级联”建议由 Service 层事务完成，而不是完全依赖 SQLite `ON DELETE CASCADE`，因为软删除需要写入时间戳，并且不能误删全局 `installed_apps` 或真实资源文件。

## 4. installed_apps

`installed_apps` 是全局软件库，来源包括 Windows 开始菜单快捷方式、注册表、常见安装目录、用户手动添加的 exe/快捷方式/文件夹/URL/命令。它描述“可启动对象”，不描述它在某个工作区里的用途。

建议字段：

```sql
CREATE TABLE installed_apps (
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
```

`app_type` 建议限定为 `native_app`、`shortcut`、`folder`、`url`、`command`。`platform` 第一版主要是 `windows`，后续可以加入 `macos`。`source` 建议记录 `start_menu`、`registry`、`common_path`、`manual`、`imported`。`launch_target` 是平台适配层可消费的统一启动目标；`executable_path`、`url`、`command_template` 是按类型拆开的辅助字段，避免前端或业务层解析一个含义混杂的字符串。

推荐索引：

```sql
CREATE INDEX idx_installed_apps_name
  ON installed_apps(normalized_name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_installed_apps_type_available
  ON installed_apps(app_type, is_available)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_installed_apps_fingerprint
  ON installed_apps(platform, scan_fingerprint)
  WHERE scan_fingerprint IS NOT NULL AND deleted_at IS NULL;
```

软件扫描刷新时不应该简单清空重建。平台适配层返回扫描结果后，Repository 按 `scan_fingerprint` 或稳定路径合并：已存在的软件更新名称、图标、版本和可用状态；扫描不到的软件只标记 `is_available = 0`，不要立刻删除，因为工作区关联仍可能需要显示“软件可能已卸载或路径不可用”。

## 5. workspace_apps

`workspace_apps` 是工作区内的软件条目。它连接 `workspaces` 和 `installed_apps`，并承载工作区局部信息，例如别名、用途、备注、排序、最近启动时间、最近聚焦窗口和启动策略。

建议字段：

```sql
CREATE TABLE workspace_apps (
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
  FOREIGN KEY(installed_app_id) REFERENCES installed_apps(id),
  FOREIGN KEY(last_window_id) REFERENCES native_windows(id)
);
```

推荐索引：

```sql
CREATE UNIQUE INDEX idx_workspace_apps_unique_active
  ON workspace_apps(workspace_id, installed_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_workspace_apps_workspace_order
  ON workspace_apps(workspace_id, pinned, sort_order, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_workspace_apps_app
  ON workspace_apps(installed_app_id)
  WHERE deleted_at IS NULL;
```

`status` 是产品状态，不是平台真相，可以取 `unknown`、`launching`、`running`、`window_closed`、`launch_failed`、`unavailable`。真实窗口是否存在仍以平台适配层枚举结果为准。用户从工作区移除软件时，只软删除 `workspace_apps`，同时软删除或失效它下面的窗口绑定；不要删除 `installed_apps`，不要关闭真实系统进程。

## 6. native_windows

`native_windows` 记录某个工作区软件条目曾经绑定过的外部原生窗口。第一版可以简化为一个工作区软件优先绑定一个最近窗口，但表结构需要允许后续多窗口管理。

建议字段：

```sql
CREATE TABLE native_windows (
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
```

推荐索引：

```sql
CREATE INDEX idx_native_windows_workspace_app_seen
  ON native_windows(workspace_app_id, last_seen_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_native_windows_external
  ON native_windows(platform, external_window_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_native_windows_status
  ON native_windows(workspace_id, status)
  WHERE deleted_at IS NULL;
```

`external_window_id` 在 Windows 上可以保存 HWND 的字符串化值，但前端和业务 DTO 不应暴露 `HWND` 这个概念，只返回 `nativeWindowId` 或 `windowStatus`。窗口句柄可能失效或被系统复用，所以聚焦窗口前必须由平台适配层重新验证进程、标题或其他上下文，不能只相信数据库旧记录。

## 7. canvas_nodes 与 canvas_edges

白板持久化模型不能直接保存 React Flow 的完整渲染对象。数据库只保存产品语义和布局必需字段，前端渲染状态如选中、高亮、hover、临时拖拽状态不入库。

建议字段：

```sql
CREATE TABLE canvas_nodes (
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

CREATE TABLE canvas_edges (
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
```

`node_type` 建议限定为 `markdown`、`text`、`sticky`、`todo`、`image`、`screenshot`、`app_note`。图片和截图节点通过 `asset_id` 引用资源文件。`metadata_json` 只保存节点类型的扩展语义，例如 todo 勾选状态、截图来源窗口、应用备注关联，不保存 React 组件内部状态。

推荐索引：

```sql
CREATE INDEX idx_canvas_nodes_workspace_updated
  ON canvas_nodes(workspace_id, updated_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_canvas_nodes_workspace_type
  ON canvas_nodes(workspace_id, node_type)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_canvas_edges_workspace_source
  ON canvas_edges(workspace_id, source_node_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_canvas_edges_unique_active
  ON canvas_edges(workspace_id, source_node_id, target_node_id, edge_type)
  WHERE deleted_at IS NULL;
```

删除节点时软删除节点，同时软删除以它为 source 或 target 的边。若节点引用资源，不立即删除资源文件；资源清理任务需要确认没有任何未删除节点或操作记录引用该 `asset_id`。

Markdown 卡片的整卡字号放在该节点 `metadata_json`，例如 `{"fontSize":16}`，不新增列。

手绘与形状不进 `canvas_nodes`。每个工作区另有一份画图 scene，P2 的 AI 也读写这份 JSON。规格见 `docs/product/whiteboard-drawing-and-ai.md`。

```sql
CREATE TABLE canvas_scenes (
  workspace_id TEXT PRIMARY KEY,
  scene_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
```

`scene_json` 只存产品元素（`path` / `arrow` / `rect` / `ellipse` / `text` 和世界坐标），不存选中、hover、工具状态。删除工作区时软删除对应 scene。本表由 `003_canvas_scenes.sql` 落地。

## 8. activity_entries

`activity_entries` 是工作区操作记录时间线，默认由用户手动创建，或由产品在用户明确操作时记录轻量事件，例如“通过本产品启动了 VS Code”。它不能被设计成自动监听外部软件内部行为的审计日志。

建议字段：

```sql
CREATE TABLE activity_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  workspace_app_id TEXT,
  entry_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT,
  occurred_at TEXT NOT NULL,
  asset_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY(workspace_app_id) REFERENCES workspace_apps(id),
  FOREIGN KEY(asset_id) REFERENCES assets(id)
);
```

推荐索引：

```sql
CREATE INDEX idx_activity_workspace_time
  ON activity_entries(workspace_id, occurred_at)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_activity_workspace_app
  ON activity_entries(workspace_app_id, occurred_at)
  WHERE deleted_at IS NULL;
```

`entry_type` 建议包括 `manual_note`、`app_launched`、`window_focused`、`screenshot_added`、`canvas_updated`。其中自动产生的条目必须克制，第一版不记录键盘输入、不读取外部软件文档内容、不记录浏览器页面内容。用户可编辑或删除时间线条目。

## 9. assets

`assets` 保存图标、截图、粘贴图片、导入文件引用等资源元数据。资源文件本体放在 app data 的 `assets/` 目录，数据库只保存相对路径和校验信息。

建议字段：

```sql
CREATE TABLE assets (
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
```

推荐索引：

```sql
CREATE INDEX idx_assets_sha256
  ON assets(sha256)
  WHERE sha256 IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_assets_type
  ON assets(asset_type)
  WHERE deleted_at IS NULL;
```

`asset_type` 建议包括 `app_icon`、`screenshot`、`canvas_image`、`attachment`。`source` 建议包括 `scanned_icon`、`clipboard`、`drag_drop`、`screenshot_tool`、`manual_import`。导入图片默认复制到 app data，而不是只保存原始文件路径；这样用户移动原文件后白板仍能恢复。对于软件图标可以按哈希复用，避免每次扫描生成重复文件。

## 10. settings 与 migrations

设置分为全局设置和工作区设置。少量键值型配置可以使用 `settings` 表；结构复杂、需要经常查询的业务对象不要塞进设置表。

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  workspace_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);
```

建议保存的设置包括最近打开工作区、软件扫描时间、自动保存间隔、备份保留数量、是否启动时打开上次工作区、窗口状态偏好、快速切换快捷键等。快捷键设置需要记录用户配置值、平台注册状态和最近一次注册失败原因；`Ctrl+O` 可以作为默认候选值，但不能作为唯一固定值。工作区名称、软件关联、白板节点这种核心数据不进入 `settings`。

迁移记录可以交给 refinery 的内部表，也可以维护显式 `schema_migrations`：

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum TEXT
);
```

迁移文件必须只做可重复审查的 schema/data 变更，不在迁移中调用平台扫描、启动软件或访问外部窗口。版本升级时先备份数据库，再执行迁移；迁移失败必须保留原数据库，不能留下半升级状态。

## 11. 自动保存策略

白板和工作区配置使用自动保存，但前端状态不直接等于持久化完成。建议前端在用户编辑节点内容、移动节点、创建边、修改软件备注时先更新本地 Zustand 状态，再通过防抖调用 Tauri command，Rust Service 在一个事务里写入 SQLite，成功后返回 `updatedAt` 和保存版本。

推荐策略：

```text
文本输入：停止输入 800-1200ms 后保存。
节点拖拽：拖拽结束时保存最终坐标，不在每一帧写库。
批量操作：创建节点、连线、删除节点可以合并成一个事务。
截图/图片：先落盘资产文件，再在同一事务中创建 assets 和 canvas_nodes 引用。
工作区切换/应用退出：强制 flush 当前 pending 保存队列。
```

界面顶部的“已保存 / 保存中 / 保存失败 / 最近保存时间”应以 Rust 后端确认结果为准。保存失败时不要丢弃前端未保存状态；需要保留 dirty 标记，并允许用户重试。自动保存不应该高频触发全库 vacuum、全量备份或软件扫描。

为避免并发覆盖，写入接口建议带上 `updated_at` 或 `revision`。MVP 可以先使用 `updated_at` 做乐观并发检查；后续如果白板编辑更复杂，再为 `workspaces` 或 canvas 快照增加 `revision INTEGER`。

## 12. 删除、归档与清理策略

归档工作区只设置 `workspaces.is_archived = 1`，数据仍完整保留，默认不出现在活跃列表。删除工作区是软删除，不卸载软件、不关闭外部窗口、不删除全局软件库。用户从工作区移除软件只软删除 `workspace_apps`，并让相关 `native_windows` 失效；如果用户之后重新添加同一软件，可以选择恢复旧备注和排序，也可以创建新的关联记录，这个交互由产品层决定。

资源文件清理必须延迟执行。只有当 `assets.deleted_at IS NOT NULL`，并且没有任何未删除的 `installed_apps.icon_asset_id`、`canvas_nodes.asset_id`、`activity_entries.asset_id` 引用时，维护任务才允许物理删除对应文件。物理删除前建议确认资源已被至少一次数据库备份覆盖，避免用户刚误删白板图片就无法恢复。

`installed_apps` 的删除更保守：系统扫描不到时先标记 `is_available = 0`，用户手动添加的软件只有在用户明确删除时才软删除。即使某个 `installed_app` 被软删除，已有 `workspace_apps` 也应能显示历史名称和“不可用”状态，而不是让工作区卡片消失得无从解释。

## 13. 备份与恢复边界

备份必须同时覆盖 SQLite 数据库和 `assets/` 目录，否则白板截图和图标会丢失。推荐备份格式为一个 zip 包，包含：

```text
manifest.json
workspace-hub.sqlite3
assets/
```

`manifest.json` 记录应用版本、schema 版本、创建时间、平台、资源数量和数据库哈希。备份过程中需要先 checkpoint WAL，或使用 SQLite backup API 得到一致快照，不能直接复制正在写入的 sqlite 文件。自动备份建议在应用启动后、迁移前、用户手动导出时触发；不要在每次白板自动保存后触发全量备份。

恢复策略分两类。完整恢复会替换当前数据库和资源目录，执行前必须先备份当前数据。导入式恢复则把备份中的工作区、节点和资源作为新 ID 导入当前库，适合后续共享或迁移场景。MVP 可以先支持完整备份和完整恢复，导入式恢复留到后续版本。

跨平台迁移边界需要清楚：`workspaces`、`workspace_apps` 的业务备注、`canvas_nodes`、`canvas_edges`、`activity_entries`、`assets` 可以跨平台复用；`installed_apps.launch_target`、Windows exe 路径、快捷方式路径、`native_windows.external_window_id` 不能保证在 macOS 可用。迁移到 macOS 后，应保留历史记录和白板内容，但需要重新扫描系统软件并重新绑定工作区软件。

## 14. Repository 与事务边界

Rust 侧建议按业务聚合拆 Repository，而不是让 Tauri command 直接拼 SQL：

```text
WorkspaceRepository
InstalledAppRepository
WorkspaceAppRepository
NativeWindowRepository
CanvasRepository
ActivityRepository
AssetRepository
SettingsRepository
```

跨表写入由 Service 层开启事务。例如“添加软件到工作区”应在一个事务里完成：确认 `installed_apps` 存在或创建手动软件，创建或恢复 `workspace_apps`，写入 `activity_entries`，更新 `workspaces.updated_at`。 “粘贴截图为白板节点”应先把图片写入临时文件，事务内创建 `assets` 和 `canvas_nodes`，事务成功后再把临时文件原子移动到正式资源路径；如果事务失败，清理临时文件。

数据库错误需要转成业务错误返回前端，例如 `WorkspaceNotFound`、`InstalledAppUnavailable`、`DuplicateWorkspaceApp`、`CanvasNodeNotFound`、`AssetWriteFailed`、`MigrationFailed`。前端不应该看到原始 SQLite 错误字符串，也不应该根据 SQLite constraint 名称判断产品状态。

## 15. MVP 建表顺序

第一版迁移建议按依赖顺序创建：

```text
001_init_core.sql
  settings
  schema_migrations 或迁移工具内部表
  assets
  workspaces
  installed_apps
  workspace_apps
  native_windows
  canvas_nodes
  canvas_edges
  activity_entries

002_indexes.sql
  所有查询索引和唯一约束

003_canvas_scenes.sql
  canvas_scenes
```

也可以把 MVP schema 放在一个初始迁移文件里，但后续变更必须追加迁移，不直接修改已经发布过的 migration。只要应用进入真实使用，数据库就是用户数据的一部分，不能像普通开发缓存一样随意删库重建。
