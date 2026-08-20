# pkg-03 前端工作区主界面接通

状态：pending  
依赖：pkg-01、pkg-02  
可并行：pkg-05

## 目标

用户能在空应用里建工作区，从软件库或手动 exe/快捷方式添加软件，看到卡片，点击后走聚焦/重开，并能移出软件或删除工作区。右侧白板本包只留入口。

## 改动范围

**可以改**

- `src/features/workspaces`、`apps`、`windows`、`api`
- `src/app/workspace-shell.tsx`
- Zustand store、`src/lib`
- 为选文件引入 `tauri-plugin-dialog`
- Vitest

**不能改**

- 完整 React Flow 白板
- Windows 平台实现
- 快速切换、全局快捷键
- 用 Zustand persist 当数据库

## 交付内容

1. `tauri-client` + `workspaceApi` / `appApi`。组件禁止直接 `invoke`。
2. 无工作区时的空状态，创建弹窗只要名称；颜色可用默认色板。
3. 删除工作区确认文案必须写明：只删本产品数据，不卸载软件，不关闭真实窗口。
4. 添加软件弹窗：搜索、刷新、已在当前工作区、添加并打开、手动选 `.exe` / `.lnk`。
5. 标签和卡片状态：`notStarted` / `launching` / `running` / `closed` / `launchFailed` / `focusFailed`。
6. 移出工作区只调 `remove_workspace_app`，文案用“移出工作区”。

## 子任务

| ID | 子任务 | 完成标准 |
|---|---|---|
| s03-01 | API 封装 | store/组件不直接 invoke |
| s03-02 | 工作区 store 与侧栏 | 空态、创建、切换、重命名、删除 |
| s03-03 | 添加软件与手动路径 | 搜索/刷新/exe/lnk |
| s03-04 | 标签、卡片、重开、移出 | 关闭态可重开 |
| s03-05 | 主壳编排 | 右侧仍是占位 |
| s03-06 | Vitest | 空态、过滤、已加入、删除文案 |

## 界面约束

中间区域是概览和软件卡片，不是外部软件容器。不要写“嵌入运行”“内置浏览器”。点击卡片的意义是请求后端启动或聚焦外部窗口。

本包可以在 mock 后端上开发。不要等 pkg-05 才开始。

## 验收

- 首次打开能建工作区
- 添加后出现一张卡片，再点同一软件不会变成两张
- 删除确认文案正确
- 前端无平台 API 细节
