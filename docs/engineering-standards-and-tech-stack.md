# 工程规范与技术栈选型

制定日期：2026-06-07

## 1. 总体结论

本项目建议采用 `Tauri 2 + React + TypeScript + Rust`。这个组合适合当前产品，因为产品需要一个轻量桌面壳、一个复杂但可维护的前端界面，以及一层能直接调用 Windows/macOS 原生能力的系统适配层。Electron 也能实现，但它会引入更大的运行时体积；Wails 也可行，但当前需求的系统窗口管理、Windows API 调用和后续 macOS 适配，Rust/Tauri 的整体匹配度更高。

第一版按 Windows 开发，但代码结构必须从第一天就区分业务层和平台层。工作区、软件、窗口、白板、搜索、保存这些概念属于业务层；扫描已安装软件、打开程序、枚举窗口、切换窗口、读取图标、获取窗口截图属于平台层。未来迁移 macOS 时，应该替换平台层实现，而不是重写前端和业务数据结构。

需要明确一点：Google docstring 主要是 Python 代码规范，不适合直接套到 Rust 和 TypeScript 上。项目中如果有 Python 脚本，例如构建脚本、数据转换脚本、测试辅助脚本，统一使用 Google 风格 docstring；Rust 使用 rustdoc；TypeScript 使用 JSDoc/TSDoc 风格注释。这样既满足你的文档风格偏好，也不会把语言生态搞混。

## 2. 技术栈

桌面框架使用 Tauri 2。Tauri 官方文档说明它可以用任意编译到 HTML/CSS/JavaScript 的前端框架做 UI，同时通过 Rust、Swift、Kotlin 等语言承载后端逻辑；它还强调使用系统 WebView，因此包体更小。这个判断来自 Tauri 官方文档，价值高，置信度高。

前端使用 React 19、TypeScript、Vite。React 用来构建复杂工作区界面，TypeScript 用来保证工作区、软件、窗口、白板节点这些对象的数据结构可维护，Vite 用于快速开发和构建。React 19 已经稳定发布，Tailwind 官方也提供了与 Vite 结合的安装路径，因此这个组合属于主流稳定路线。

样式和组件使用 Tailwind CSS 4、shadcn/ui、lucide-react。Tailwind 负责布局和视觉样式；shadcn/ui 提供可复制、可修改的组件源码，适合这个项目后续定制成自己的桌面工具设计系统；lucide-react 用于图标。这里不建议选 Ant Design 或 MUI 作为主组件库，因为截图方向是轻量桌面工具，不是传统后台系统，shadcn/ui 的可定制性更合适。

白板主方案使用 React Flow / xyflow，而不是 Excalidraw。原因是你的目标更像 Obsidian Canvas：卡片、Markdown、截图、待办、时间线、软件记录之间的组织关系。React Flow 官方定位就是 node-based UI，并提供节点、边、拖拽、缩放、保存恢复、白板特性等能力，适合做卡片式画布。Excalidraw 可以作为后续“手绘白板/草图模式”的可选模块，但不作为第一版主白板。

Markdown 卡片使用 CodeMirror 6 做编辑器，使用 react-markdown + remark-gfm 做预览。第一版如果要降低复杂度，也可以先用 textarea 编辑 Markdown，再逐步换成 CodeMirror。图片和截图卡片先按文件引用和本地资源路径处理，不做复杂图片编辑器。

前端状态管理使用 Zustand。它适合管理当前工作区、软件面板、画布选中状态、弹窗状态、拖拽状态和本地 UI 状态。持久化数据不直接依赖 Zustand 存储，而是通过 Tauri command 调 Rust 后端，由后端写入 SQLite。这样可以避免前端状态和真实数据源混在一起。

本地数据库使用 SQLite，Rust 侧优先使用 rusqlite。Tauri 官方有 SQL 插件，但这个产品的数据结构会和业务规则强绑定，例如工作区删除、软件关联、窗口绑定、白板节点保存、迁移版本管理。把数据库访问放在 Rust 后端更可控，不建议直接让前端到处操作数据库。数据库迁移可以使用 refinery 或自己维护 SQL migration 文件。

Windows 平台适配使用 Microsoft 的 `windows` crate 调 Win32 API，配合 `winreg` 读取注册表。核心能力包括扫描开始菜单快捷方式、读取注册表应用信息、启动 exe/快捷方式、枚举窗口、绑定进程和窗口、恢复最小化窗口、置前窗口。Microsoft 官方文档说明 Rust for Windows 可以通过 `windows` crate 直接使用 Windows API，这个来源价值高，置信度高。

macOS 后续适配预留 `objc2-app-kit`、NSWorkspace、CGWindowListCopyWindowInfo、AXUIElement/Accessibility API。macOS 的窗口级切换大概率需要用户授予辅助功能权限，所以第一版 Windows 代码不要假设所有平台都能无权限切换窗口。

## 3. 推荐库清单

前端核心库建议使用：`react`、`react-dom`、`typescript`、`vite`、`@tauri-apps/api`、`zustand`、`@xyflow/react`、`react-markdown`、`remark-gfm`、`@codemirror/view`、`@codemirror/state`、`@codemirror/lang-markdown`、`lucide-react`、`clsx`、`tailwind-merge`。

UI 与样式建议使用：`tailwindcss`、`@tailwindcss/vite`、`shadcn/ui` 生成的组件、Radix UI primitives。组件优先从 shadcn/ui 引入后本地修改，不把 UI 组件当黑盒依赖。

Tauri 插件建议使用：`tauri-plugin-dialog`、`tauri-plugin-opener`、`tauri-plugin-global-shortcut`、`tauri-plugin-window-state`、`tauri-plugin-single-instance`、`tauri-plugin-clipboard-manager`。其中 opener 适合打开文件和 URL，不适合作为任意软件启动的唯一方案；任意 exe/快捷方式启动应由 Rust 平台适配层封装。

快速切换面板需要使用 `tauri-plugin-global-shortcut` 或等价平台能力注册快捷键。`Ctrl+O` 可以作为 Windows 第一版默认候选值，但不能硬编码为唯一快捷键，因为它和大量软件的“打开文件”冲突。快捷键配置需要保存到本地设置中，前端只处理面板展示和搜索结果，快捷键注册、冲突失败和平台差异由 Rust/Tauri 后端处理。

Rust 核心库建议使用：`serde`、`serde_json`、`thiserror`、`anyhow`、`tracing`、`tracing-subscriber`、`uuid`、`chrono`、`rusqlite`、`refinery`、`windows`、`winreg`、`dirs` 或 `directories`。

测试工具建议使用：前端单元测试用 Vitest，端到端 UI 测试用 Playwright。Tauri 官方也提供 WebDriver 测试路径，但官方文档明确桌面 WebDriver 目前只支持 Windows 和 Linux，macOS 由于没有 WKWebView driver tool 不支持，所以第一版可以用 Playwright 测 Web 前端，用 Tauri WebDriver 或人工脚本补 Windows 桌面集成测试。

## 4. 代码目录规范

推荐目录结构如下：

```text
workspace-hub/
  docs/
  src/
    app/
    components/
    features/
      workspaces/
      apps/
      windows/
      canvas/
      activity-log/
    lib/
    styles/
    test/
  src-tauri/
    src/
      commands/
      domain/
      platform/
        mod.rs
        windows/
        macos/
      storage/
      errors.rs
      lib.rs
    migrations/
  tests/
    e2e/
```

`src/features` 按产品能力拆分，不按页面随意堆组件。`src-tauri/src/domain` 放工作区、软件、窗口、白板这些业务模型；`src-tauri/src/platform` 放系统适配接口和各平台实现；`src-tauri/src/commands` 只做 Tauri command 参数校验、调用业务服务、返回序列化结果，不把复杂逻辑写在 command 函数里。

## 5. 注释与文档规范

Python 辅助脚本使用 Google 风格 docstring。公共函数、复杂函数、脚本入口函数必须写 docstring；简单私有函数如果逻辑明显，可以不写。docstring 描述调用语义，不描述每一行实现。Google Python Style Guide 明确要求 docstring 应提供足够信息，让调用者不读函数实现也能知道如何调用。

Python 示例：

```python
def collect_shortcuts(start_menu_dirs: list[str]) -> list[ShortcutInfo]:
    """Collects application shortcuts from Windows Start Menu folders.

    Args:
        start_menu_dirs: Absolute directory paths that may contain `.lnk` files.

    Returns:
        Shortcut metadata parsed from valid shortcut files.

    Raises:
        FileNotFoundError: If a configured Start Menu directory does not exist.
    """
```

Rust 使用 rustdoc。公共 struct、trait、enum、跨模块函数必须写 `///` 注释。平台适配 trait 必须写清楚平台差异、权限前提和失败场景。内部短函数不强制写注释，但遇到 Windows API、macOS Accessibility、窗口句柄绑定、权限绕不开的地方，要写短注释解释本地意图。

Rust 示例：

```rust
/// Activates a native application window that belongs to a workspace app entry.
///
/// Implementations must handle minimized windows and return a typed error when
/// the window no longer exists or the OS refuses focus transfer.
pub trait WindowActivator {
    fn focus_window(&self, window_id: NativeWindowId) -> Result<(), PlatformError>;
}
```

TypeScript 使用 JSDoc/TSDoc。导出的类型、复杂 hook、跨 feature 的工具函数必须写注释。React 组件如果只是普通 UI 组合，不需要每个组件都写注释；但涉及画布坐标转换、节点持久化、Tauri command 调用、乐观更新和错误恢复时必须写。

TypeScript 示例：

```ts
/**
 * Converts a React Flow node into the persisted canvas-node shape.
 *
 * The persisted shape intentionally keeps renderer-only fields out of storage
 * so future macOS and web previews can read the same workspace data.
 */
export function toPersistedCanvasNode(node: CanvasNode): PersistedCanvasNode {
  // ...
}
```

## 6. 命名与代码风格

TypeScript 文件使用 kebab-case，例如 `workspace-list.tsx`、`app-picker-popover.tsx`。React 组件名使用 PascalCase，hook 使用 `useXxx`，store 使用 `useXxxStore`。领域模型类型使用清晰名称，例如 `Workspace`, `WorkspaceApp`, `NativeWindow`, `CanvasNode`, `ActivityEntry`。

Rust 模块和文件使用 snake_case。错误类型集中在 `errors.rs` 或各模块局部错误枚举中。跨前后端传输的数据结构必须派生 `Serialize` 和 `Deserialize`，字段名使用 camelCase 序列化，避免前端再做额外转换。

禁止把平台相关逻辑写进前端。前端不应该知道 `HWND`、`SetForegroundWindow`、`AXUIElement` 这种概念；前端只调用 `launchApp`, `focusWindow`, `scanInstalledApps`, `saveCanvas` 这类业务语义命令。

## 7. 测试规范

前端组件和纯函数用 Vitest 测。需要覆盖工作区切换、软件搜索过滤、白板节点增删改、Markdown 卡片状态、操作记录排序、错误提示状态。画布拖拽和缩放可以用少量集成测试覆盖，不追求所有像素级行为都单测。

Web UI 端到端测试用 Playwright。需要覆盖新建工作区、打开添加软件面板、搜索软件、添加软件后出现卡片、创建 Markdown 卡片、粘贴/上传图片卡片、切换工作区后数据隔离。由于这些是前端主链路，我可以自己启动前端服务并跑 Playwright。

Rust 后端测试分两类。业务逻辑和数据库迁移可以自动化测试；Windows 原生能力需要单独集成测试。窗口切换、扫描真实开始菜单、启动真实 exe 这类测试会依赖真实 Windows 环境和权限，不应该伪装成普通单元测试。

## 8. 版本与依赖策略

脚手架创建时使用最新稳定版本，但必须锁定 `package-lock.json` 或 `pnpm-lock.yaml`，Rust 使用 `Cargo.lock`。依赖升级不跟风，只有安全修复、明确 bug 修复或项目需要新能力时才升级。

许可证优先级是 MIT、Apache-2.0、BSD。GPL-3.0 项目只做参考，不直接复制代码。带生产授权要求的 SDK，例如 tldraw，需要单独确认商业使用条件后才能进入核心依赖。

来源判断：本文件优先采用官方文档和官方仓库信息，包括 Tauri、React Flow、Tailwind、shadcn/ui、Google Python Style Guide、Microsoft Rust for Windows、Playwright、Vitest、rusqlite、Apple Developer 文档。第三方文章和 Reddit 仅用于观察生态，不作为最终选型依据。

## 9. 当前确定方案

最终建议是：桌面壳用 Tauri 2；前端用 React 19 + TypeScript + Vite；样式用 Tailwind CSS 4 + shadcn/ui + lucide-react；白板主方案用 React Flow / xyflow；Markdown 编辑用 CodeMirror 6，预览用 react-markdown；状态管理用 Zustand；本地数据用 SQLite + rusqlite；Windows 原生能力用 `windows` crate + `winreg`；测试用 Vitest + Playwright，桌面集成测试再补 Tauri WebDriver 或真实 Windows 验收。

这个方案不会把产品绑定死在 Windows。真正需要重写的是 `src-tauri/src/platform/windows` 到 `src-tauri/src/platform/macos` 的适配实现；前端界面、工作区业务模型、白板数据结构和数据库主体都可以继续复用。
