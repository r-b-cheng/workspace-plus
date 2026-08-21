# migrations

只放 SQLite 迁移 SQL。按版本号排序，例如 `001_init_core.sql`。

- `001_init_core.sql`：核心表（含 `app_settings`），语句可重复执行
- `002_indexes.sql`：查询索引与有效关联唯一约束
- `003_canvas_scenes.sql`：每工作区一份画图 scene（`canvas_scenes.scene_json`）

业务规则写在 `src/services`，不要把启动软件或窗口置前写进迁移。
