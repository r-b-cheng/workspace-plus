# 前端工作区界面实现规格

制定日期：2026-06-07

本文档面向“前端工作区智能体”，用于把 PRD、界面方向和工程技术栈落到 React + TypeScript 实现上。它只定义前端主界面、状态、组件边界、Tauri command 调用封装和可测试主流程，不定义 Windows 平台扫描、启动、窗口聚焦和 SQLite 存储的内部实现。

需要先固定一个边界：默认的中间主区域（调度台）不是外部软件内嵌容器。调度台只展示当前工作区概览、软件快捷入口、状态提示、软件卡片和白板入口；用户点击软件标签或卡片后，前端通过 Tauri command 请求后端启动或聚焦外部真实窗口。

预览模式是显式例外，规格见 `docs/product/workspace-preview-mode.md`。只有用户点运行中标签上的「预览」后，中间栏在应用栏以下才放一个真实窗口。点标签名称不得进入预览。前端仍然不能出现 HWND 等平台细节。

## 1. 页面结构

主界面采用三栏结构：左侧是工作区列表，中间是当前工作区主操作区，右侧是白板和操作记录入口。这个结构以 `docs/product/ui-direction-notes.md` 为准，修正了早期 PRD 中“左侧只展示当前工作区软件”的表达。当前工作区的软件不放在最左侧，而是放在中间顶部标签、添加软件弹窗和中间底部软件卡片中。

第一屏不做营销页，也不做大空状态说明页。用户打开应用后，应该直接看到最近使用的工作区；如果没有工作区，则在左侧和中间主区域提供创建工作区入口。所有可点击主流程都要能被 Playwright 通过稳定的 `data-testid` 定位。

推荐顶层组件：

```text
src/
  app/
    workspace-shell.tsx
  features/
    workspaces/
      components/workspace-sidebar.tsx
      components/workspace-list.tsx
      components/workspace-list-item.tsx
      components/create-workspace-dialog.tsx
      store/workspace-store.ts
    apps/
      components/current-workspace-header.tsx
      components/workspace-app-tabs.tsx
      components/workspace-app-card-grid.tsx
      components/workspace-app-card.tsx
      components/add-app-dialog.tsx
      components/app-search-results.tsx
      store/workspace-app-store.ts
    canvas/
      components/whiteboard-panel.tsx
      components/whiteboard-entry-card.tsx
      components/activity-timeline.tsx
      store/canvas-store.ts
    api/
      tauri-client.ts
      workspace-api.ts
      app-api.ts
      canvas-api.ts
  lib/
    types.ts
    errors.ts
    cn.ts
```

`WorkspaceShell` 只负责组织三栏布局和初始化数据，不直接写工作区 CRUD、软件启动、白板保存等业务逻辑。业务逻辑放在 feature store 和 API 封装中，组件只消费状态和触发 action。

## 2. 三栏布局

左侧栏固定为工作区导航，建议宽度 260-300px，包含产品名、新建工作区按钮、工作区列表、归档入口或设置入口。工作区列表项展示图标、名称、状态信息、最近更新时间和更多菜单。当前工作区用蓝色边框、浅蓝背景或左侧指示条强调。删除工作区必须通过确认弹窗完成，并明确说明只删除本产品内的工作区数据，不卸载软件，也不关闭真实外部窗口。

中间栏是当前工作区主区域，使用自适应宽度。顶部显示当前工作区名称、保存状态、最近保存时间、当前工作区搜索框、添加软件按钮、工作区设置按钮和更多菜单。其下是当前工作区软件标签（应用栏）。调度台主体是概览和软件卡片；预览模式主体换成铺满剩余高度的宿主表面，隐藏概览和卡片。顶栏、应用栏、左侧工作区列表、右侧白板在两种模式下都保留。

右侧栏建议宽度 340-420px，用于白板入口、便签卡片预览和操作记录时间线。MVP 阶段右侧不需要承载完整 React Flow 无限画布，可以先作为“白板入口 + 最近卡片 + 时间线”的工作区记录面板；完整白板可以在同一栏展开，也可以进入专门的 canvas view。右侧区域是产品区别于普通启动器的关键，不应被隐藏到低频菜单里。

## 3. 工作区列表

工作区列表的数据来自 `listWorkspaces`。前端需要维护 `selectedWorkspaceId`，应用启动时先请求 `getLastActiveWorkspace` 或由 `listWorkspaces` 返回最近使用排序，再选中第一个可用工作区。切换工作区时需要并行刷新当前工作区的软件关联、白板摘要和操作记录，避免显示上一个工作区的残留数据。

工作区列表项字段建议：

```ts
export type Workspace = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  appCount: number;
  updatedAt: string;
  lastOpenedAt?: string;
  archived: boolean;
};
```

工作区空状态只做一件事：引导创建工作区。创建弹窗第一版只要求名称，颜色、图标、描述可以作为可选字段。创建成功后立即选中新工作区，并加载空的软件列表和白板摘要。

## 4. 当前工作区主区域

当前工作区主区域承担三件事：展示当前工作区状态，管理当前工作区内的软件，提供进入白板的入口。顶部搜索框默认搜索当前工作区内的软件、软件备注、白板卡片标题和操作记录；不要在 MVP 阶段默认做全局搜索，避免搜索结果跨工作区混淆。

主区域的概览状态需要覆盖：

```text
loading: 正在加载工作区、软件列表或白板摘要
empty-workspace: 当前工作区还没有添加软件，显示添加软件按钮和白板入口
ready: 展示软件标签、软件卡片和最近白板内容
app-launching: 某个软件正在启动，卡片和弹窗中显示处理中状态
app-focus-failed: 窗口已关闭或系统拒绝聚焦，显示重新打开入口
app-launch-failed: 路径不存在、权限不足、命令无效等启动失败原因
saving: 白板或工作区元数据正在保存
saved: 展示最近保存时间
save-failed: 保存失败，可重试
```

快速切换面板是当前工作区的高频入口。用户通过配置的快捷键打开面板后，前端展示一个轻量搜索浮层，默认搜索当前工作区内的软件标签、软件卡片、别名、用途备注和最近窗口标题。结果项需要明确显示动作类型：切换窗口、重新打开、添加并打开。`Ctrl+O` 可以作为 Windows 第一版默认候选快捷键，但设置页必须允许修改，避免与常见软件的“打开文件”冲突。

调度台上的概览可以保留“窗口预览”一类占位文案，但那不是真实窗口。真实可操作窗口只出现在预览模式。进入动作的文案是「预览」，退出是「退出预览」，不要写“嵌入运行”“内置浏览器”“在此操作外部软件”。点击应用标签名称或软件卡片仍调用聚焦/启动，不进入预览。

## 5. 软件标签和软件卡片

软件标签位于当前工作区标题下方，用于放置当前工作区内常用或最近使用的软件入口。标签可以展示系统软件图标、工作区内别名和运行状态。点击标签**名称/状态**时，如果窗口存在，调用 `focusWorkspaceApp`；如果窗口不存在，显示“窗口已关闭”状态并提供 `重新打开` 按钮；如果后端返回软件尚未启动，则调用 `launchWorkspaceApp` 或提示用户确认启动。这条路径不得进入预览。

`status === running` 的标签另有「预览」命中区（`data-testid=workspace-app-tab-preview-{id}`）。点它才进入预览模式，调用 `embedWorkspaceAppWindow`。正在预览的标签呈选中态，该动作变为退出。对另一个运行中软件点「预览」则切换预览目标（一次一个）。未运行软件不显示「预览」，也不为预览自动启动。

软件卡片位于中间主区域底部或概览区内，表达“这个软件在当前工作区中的用途”。卡片字段不应只依赖系统软件名称，因为同一个 Chrome 在不同工作区里可能分别叫“竞品分析”和“文献检索”。建议前端模型如下：

```ts
export type WorkspaceApp = {
  id: string;
  workspaceId: string;
  installedAppId: string;
  name: string;
  alias?: string;
  note?: string;
  iconUrl?: string;
  category?: string;
  status: 'notStarted' | 'launching' | 'running' | 'closed' | 'focusFailed' | 'launchFailed';
  lastFocusedAt?: string;
  windowTitle?: string;
  previewImageUrl?: string;
  errorMessage?: string;
};
```

卡片主操作是聚焦窗口，次操作包括重命名用途、移除关联、重新打开。移除关联只删除当前工作区和软件之间的关系，不关闭窗口，不卸载软件。卡片右上角可以提供关闭或移除入口，但文案要使用“移出工作区”，避免用户误解为关闭真实软件。

## 6. 添加软件弹窗

添加软件入口位于中间顶部右侧。点击后打开 `AddAppDialog`，标题使用“添加软件到工作区”，说明文字强调“点击软件即可启动并加入当前工作区”。弹窗不是应用商店，第一版应做成快速启动器：搜索框在顶部，结果即时过滤，分类只是辅助浏览。

弹窗数据来自 `listInstalledApps` 或 `searchInstalledApps`。每个结果项展示图标、软件名称、类型、路径或来源摘要、当前工作区状态和操作按钮。已加入当前工作区的软件显示“已在当前工作区”，点击后直接聚焦窗口；未加入的软件显示“添加并打开”；启动中的软件禁用重复点击。

建议结果模型：

```ts
export type InstalledApp = {
  id: string;
  name: string;
  iconUrl?: string;
  source: 'startMenu' | 'registry' | 'manualPath' | 'url' | 'command';
  launchKind: 'exe' | 'shortcut' | 'folder' | 'url' | 'command';
  category?: string;
  displayPath?: string;
  alreadyInWorkspace: boolean;
};
```

弹窗底部提供“刷新软件列表”和“手动添加”入口。刷新软件列表调用后端扫描命令，前端只展示进度和错误，不自己扫描文件系统。手动添加的路径选择、URL 和命令校验也应通过 Tauri command 完成，前端只收集参数。

## 7. 右侧白板入口

右侧面板第一版包含三块：白板入口卡片、最近白板卡片摘要、操作记录时间线。白板入口卡片显示当前工作区白板保存状态、卡片数量、最近更新时间和“打开白板”按钮。点击后可以在右侧栏展开完整白板，也可以切换到主区域的 canvas view，但仍然属于本产品内部记录空间，与外部软件窗口无关。

白板摘要模型建议：

```ts
export type WhiteboardSummary = {
  workspaceId: string;
  cardCount: number;
  imageCount: number;
  todoCount: number;
  updatedAt?: string;
  recentCards: Array<{
    id: string;
    type: 'markdown' | 'text' | 'image' | 'todo';
    title?: string;
    previewText?: string;
    thumbnailUrl?: string;
    updatedAt: string;
  }>;
};
```

操作记录不是自动监听外部软件内部行为。第一版可以在用户切换或启动软件后提供“添加记录”的快捷入口，但记录内容由用户主动填写。前端文案需要避免暗示产品会自动读取外部软件内容、监听键盘输入或捕获用户操作细节。

## 8. 状态管理

前端使用 Zustand。持久化数据的真实来源是 Rust 后端和 SQLite，Zustand 只保存当前会话 UI 状态、加载状态、乐观更新状态和最近一次后端返回的数据快照。不要使用 Zustand persist 作为工作区、软件关联或白板内容的长期存储。

建议拆分三个 store：

```text
useWorkspaceStore:
  workspaces
  selectedWorkspaceId
  workspaceLoading
  createWorkspace()
  selectWorkspace()
  renameWorkspace()
  deleteWorkspace()

useWorkspaceAppStore:
  installedApps
  workspaceAppsByWorkspaceId
  appDialogOpen
  quickSwitchOpen
  appSearchQuery
  quickSwitchQuery
  launchingAppIds
  loadWorkspaceApps()
  openAddAppDialog()
  openQuickSwitch()
  closeQuickSwitch()
  searchInstalledApps()
  searchQuickSwitchTargets()
  addAndLaunchApp()
  focusWorkspaceApp()
  removeWorkspaceApp()

useCanvasStore:
  whiteboardSummaryByWorkspaceId
  activityEntriesByWorkspaceId
  canvasSaveStatus
  loadWhiteboardSummary()
  openWhiteboard()
  createMarkdownCard()
  addActivityEntry()
```

跨 store 的调用要保持克制。切换工作区时由 `WorkspaceShell` 或一个 `useWorkspaceBootstrap` hook 触发并行加载，不要让 `workspace-store` 直接 import 所有其他 store。这样能避免状态循环和测试困难。

错误状态应保留后端返回的结构化错误码和用户可读消息。前端可以把错误码映射成更清楚的界面文案，但不要吞掉原始失败原因。窗口已关闭、权限不足、路径不存在、扫描为空、重复添加这些状态都要可区分。

## 9. Tauri command 调用封装

前端禁止直接散落调用 `invoke`。所有 Tauri command 通过 `src/features/api/tauri-client.ts` 和按领域拆分的 API 文件封装。组件和 store 只能调用 `workspaceApi.createWorkspace()`、`appApi.launchWorkspaceApp()` 这类业务语义函数。

底层封装示例：

```ts
import { invoke } from '@tauri-apps/api/core';

export type ApiResult<T> = {
  data: T;
};

export class AppApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function callCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const normalized = normalizeTauriError(error);
    throw new AppApiError(normalized.code, normalized.message, normalized.details);
  }
}
```

前端需要的 command 名称建议如下，最终以 Rust command 实现为准，但语义不要退化成平台 API：

```text
list_workspaces
create_workspace
rename_workspace
delete_workspace
set_active_workspace
list_workspace_apps
list_installed_apps
search_installed_apps
refresh_installed_apps
add_manual_app
launch_workspace_app
focus_workspace_app
remove_workspace_app
get_whiteboard_summary
list_activity_entries
create_activity_entry
save_canvas_snapshot
get_shortcut_settings
update_shortcut_settings
```

命名映射可以在 API 层处理，React 代码里使用 camelCase 方法名，Rust command 保持 snake_case。前端类型字段使用 camelCase，因为 Rust DTO 应通过 serde 序列化为 camelCase，避免组件层做额外转换。

## 10. 组件拆分

组件拆分按产品能力，不按视觉区域随意堆文件。`WorkspaceSidebar` 管左侧工作区导航；`CurrentWorkspaceHeader` 管当前工作区标题、搜索、保存状态和顶部操作；`WorkspaceAppTabs` 管软件标签；`AddAppDialog` 管添加软件弹窗；`WorkspaceAppCardGrid` 和 `WorkspaceAppCard` 管中间软件卡片；`WhiteboardPanel` 管右侧白板入口和操作记录摘要。

组件职责边界如下：

```text
WorkspaceShell:
  初始化当前工作区，组合三栏布局，处理切换工作区后的数据刷新。

WorkspaceSidebar:
  展示工作区列表和新建入口，不知道软件和白板内部状态。

CurrentWorkspaceHeader:
  展示当前工作区名称、保存状态、搜索框、添加软件和设置入口。

WorkspaceAppTabs:
  展示当前工作区软件快捷入口，触发聚焦或重新打开。

AddAppDialog:
  展示系统软件库搜索结果，触发添加并启动，不直接处理平台扫描。

WorkspaceAppCard:
  展示工作区内软件用途、运行状态、窗口标题、预览图和移出入口。

WhiteboardPanel:
  展示白板摘要、打开白板入口和操作记录时间线。

QuickSwitchPalette:
  展示快捷键唤起的当前工作区软件搜索结果，支持键盘上下选择、Enter 执行动作、Esc 关闭。
```

导出的类型放在 `src/lib/types.ts` 或 feature 局部 `types.ts`。跨 feature 共享类型必须稳定，不要让 React Flow 节点类型、Radix 弹窗内部状态、CSS 类名进入后端 DTO。

## 11. Playwright 可测主流程

前端主流程必须能在 Web UI 环境下用 mock Tauri command 测试。Playwright 不应依赖真实 Windows 开始菜单、真实 exe 启动或真实窗口聚焦；这些属于平台适配和 Windows 集成验收。前端测试只验证用户操作、状态变化、调用参数和错误展示。

建议为测试环境提供 `window.__TAURI_INVOKE_MOCK__` 或等价 mock 层，让 `callCommand` 在 Web 测试中走模拟数据。测试必须覆盖：

```text
1. 首次无工作区：
   打开应用 -> 看到创建工作区入口 -> 输入名称 -> 创建成功 -> 新工作区被选中。

2. 切换工作区：
   左侧点击另一个工作区 -> 中间软件卡片和右侧白板摘要刷新 -> 不显示上一个工作区的软件。

3. 添加软件：
   点击添加软件 -> 弹窗打开 -> 搜索 Chrome/VS Code 等 mock 软件 -> 点击添加并打开 -> 弹窗项进入启动中 -> 成功后软件出现在标签和卡片中。

4. 重复添加：
   已加入软件在弹窗中显示已在当前工作区 -> 点击后调用聚焦命令，不重复新增卡片。

5. 聚焦窗口：
   点击软件标签或软件卡片 -> 调用 focusWorkspaceApp -> 成功后更新 lastFocusedAt。

6. 窗口已关闭：
   mock focusWorkspaceApp 返回 window_closed -> 卡片显示窗口已关闭 -> 点击重新打开 -> 调用 launchWorkspaceApp。

7. 启动失败：
   mock launchWorkspaceApp 返回 path_not_found 或 permission_denied -> 弹窗和卡片展示明确错误，不无限 loading。

8. 白板入口：
   右侧显示白板摘要 -> 点击打开白板 -> 进入白板视图或展开白板区域 -> 创建 Markdown 卡片 -> 显示保存中和已保存状态。

9. 数据隔离：
   在工作区 A 添加软件和白板卡片 -> 切换到工作区 B -> 工作区 B 不显示 A 的软件和白板摘要。

10. 快速切换：
   触发快捷键或测试按钮 -> 快速切换面板打开 -> 输入软件名或别名 -> 选择结果 -> 已运行软件调用 focusWorkspaceApp，窗口已关闭结果展示重新打开，未加入软件调用 addAndLaunchApp。
```

关键元素需要稳定测试 ID：

```text
workspace-shell
workspace-sidebar
create-workspace-button
workspace-list-item-{workspaceId}
current-workspace-title
workspace-search-input
add-app-button
add-app-dialog
add-app-search-input
installed-app-result-{appId}
workspace-app-tab-{workspaceAppId}
workspace-app-card-{workspaceAppId}
workspace-app-reopen-button-{workspaceAppId}
whiteboard-panel
open-whiteboard-button
create-markdown-card-button
save-status
quick-switch-palette
quick-switch-input
quick-switch-result-{targetId}
```

## 12. MVP 验收边界

前端工作区智能体完成后，应该能在不接入真实 Windows 平台能力的情况下，通过 mock command 演示完整 UI 主链路：创建工作区、切换工作区、打开添加软件弹窗、搜索软件、添加软件、软件出现在当前工作区标签和卡片、点击软件触发聚焦命令、窗口关闭时显示重新打开入口、右侧白板入口可创建 Markdown 卡片。

真实软件扫描、真实启动 exe、真实窗口置前和真实图标读取不是前端智能体的验收范围，但前端必须为这些后端结果预留清楚状态和错误展示。只要 command 返回结构化结果，前端不能因为平台失败而无反馈。

最终实现中需要持续遵守三条边界：前端不直接调用 Windows API；调度台中间区域不是外部软件内嵌，真实窗口只出现在用户显式进入的预览模式；当前工作区内的软件关联和系统软件库是两个概念。同一个系统软件可以被多个工作区关联，并在每个工作区里拥有不同别名、备注、排序和窗口绑定状态。
