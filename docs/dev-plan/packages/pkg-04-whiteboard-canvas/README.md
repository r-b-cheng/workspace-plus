# pkg-04 白板：Markdown、图片、拖拽缩放、自动保存

状态：completed  
依赖：pkg-01、pkg-02、pkg-03

## 目标

右侧白板成为当前工作区的记录空间。用户能放 Markdown 卡片和图片卡片，拖拽缩放，自动保存，重启后按工作区恢复。

## 改动范围

**可以改**

- `src/features/canvas/**`
- `src/features/api/canvas-api.ts`
- 主壳里接入白板面板
- 若 command 不够，只补 canvas / asset 后端

**不能改**

- 添加软件主流程（除非为了保存状态位）
- Windows 平台层
- 待办卡片、操作时间线、复杂连线编辑
- 把 React Flow 节点原样入库

## 交付内容

1. 右侧用 `@xyflow/react` 画布，绑定 `selectedWorkspaceId`。
2. Markdown 卡片：CodeMirror 编辑，`react-markdown` + remark-gfm 预览。
3. 图片：剪贴板粘贴或拖入文件 → `save_canvas_asset` → 节点只存 `assetId`。
4. 支持拖拽、缩放、选择、删除。
5. 防抖自动保存；顶栏 `saving` / `saved` / `save-failed`。
6. `toPersistedCanvasNode` 去掉 selected、dragging、measured 等渲染字段。

## 子任务

| ID | 子任务 | 状态 | 完成标准 |
|---|---|---|---|
| s04-01 | store 与持久化转换 | completed | 渲染字段不入库 |
| s04-02 | React Flow 接入右侧 | completed | 空画布可新建 |
| s04-03 | Markdown 卡片 | completed | 编辑/预览/保存 |
| s04-04 | 图片粘贴与拖入 | completed | 文件落 assets，库中只引用 |
| s04-05 | 防抖保存与状态 | completed | 失败可重试 |
| s04-06 | 切换工作区与重启 | completed | 数据不串，内容仍在 |

## 实现说明

- `WhiteboardPanel`（`data-testid="whiteboard-panel"`）替换右侧占位，绑定当前 `selectedWorkspaceId`。
- `toPersistedCanvasNode` / `fromPersistedCanvasNode` 只保留产品字段；`save_canvas` 写入 SQLite。
- 图片经 `save_canvas_asset` 落盘，节点只存 `assetId`。新增 `read_canvas_asset` 返回 data URL，缺失资源显示降级。
- 顶栏 `data-testid="save-status"` 由 canvas store 驱动，失败可点重试。
- 切工作区立刻清空并重新 `get_canvas`；进行中的旧请求不会覆盖新画布。

## 不做

- 待办卡片
- 操作记录时间线
- 完整撤销重做
- 自动记录用户在外部软件里做了什么

## 验收

- 工作区 A 的卡片不会出现在 B
- 重启后 Markdown 和图片还在
- 图片不进 SQLite BLOB
