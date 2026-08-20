# 开源项目与可复用组件调研

调研日期：2026-06-07

## 1. 调研结论

当前没有发现一个可以直接复用为完整产品底座的开源项目。原因是你的产品同时包含四类能力：工作区管理、系统软件扫描与启动、外部窗口切换、白板记录。现有项目通常只覆盖其中一到两类能力，例如 launcher 项目擅长软件搜索和启动，window switcher 项目擅长窗口枚举和聚焦，whiteboard 项目擅长画布，但很少把它们组织成“每个工作区只显示当前工作区软件，并配套白板记录”的产品结构。

更现实的方案是复用组件和参考实现，而不是 fork 一个项目改。推荐的技术方向是：用 Tauri 2 + React + Rust 做桌面壳和平台适配层；Windows 第一版用 Rust 调 Win32 API 完成软件扫描、启动和窗口切换；白板优先选 Excalidraw 或 React Flow/xyflow，暂时不建议把 tldraw 作为首选生产依赖，因为它已经从传统 MIT 开源组件转向带生产授权要求的 SDK。

## 2. 桌面框架

Tauri 是最适合当前目标的第一候选。它支持 Windows、macOS 和 Linux，用 Rust 做后端、Web 前端做界面，官方说明其渲染层使用系统 WebView：Windows 上是 WebView2，macOS 上是 WKWebView。这个结构符合你的迁移目标：产品业务层、白板 UI 和工作区状态可以跨平台复用，软件扫描、窗口枚举、窗口激活这些系统能力放进平台适配层。资料来源是 Tauri 官方仓库和文档，价值较高，置信度高。

Electron 也能做，但不建议作为第一选择。Electron 的优势是生态成熟、Node 包丰富，窗口/进程相关 npm 包更容易直接接入；问题是体积和资源占用更高，而且你的产品需要长期驻留、快速启动、管理系统窗口，Tauri 的轻量特性更贴合这个产品。Electron 可以作为备选，尤其是如果后续强依赖 Node 生态中的窗口管理包。

Wails 也是可选项，用 Go 后端加 Web 前端，支持 Windows 和 macOS。它比 Electron 轻，但你这个产品很可能会频繁调用 Windows/macOS 原生 API，Rust/Tauri 生态里已有很多桌面系统调用和跨平台项目参考，综合看 Tauri 更合适。

参考来源：

| 项目 | 地址 | 价值判断 |
| --- | --- | --- |
| Tauri | https://github.com/tauri-apps/tauri | 高价值。跨平台桌面壳、Rust 后端、系统 WebView，适合做平台适配层。 |
| Tauri 官方说明 | https://tauri.app | 高价值。用于确认 WebView、插件、安全边界。 |
| Wails | https://wails.io/docs/next/introduction | 中等价值。可作为 Go 技术栈备选，但不是当前最优。 |

## 3. Launcher 与软件扫描参考

Flow Launcher 是 Windows 侧最值得参考的开源 launcher。它是 Windows 专用，MIT license，核心能力是搜索应用、文件、书签、系统设置，并支持 Windows Search Index 和 Everything。它的价值不在于直接复用代码，因为它主要是 C#/.NET；价值在于学习 Windows 软件搜索、插件模型、启动器体验、配置存储和用户预期。

Kunkun 是跨平台 Raycast/Alfred 风格 launcher，使用 Tauri、Rust、Svelte/TypeScript，支持 Windows、macOS、Linux。它和你的技术方向更接近，适合研究跨平台 launcher 的工程结构、扩展权限管理和前后端分层。但它自称仍处于早期阶段，不能直接当稳定底座。

Vicinae 是一个活跃度很高的开源 launcher，包含 app search、window switcher、clipboard、browser tabs 等能力，GitHub 约 8k stars，GPL-3.0。它很有参考价值，但 GPL-3.0 对商业闭源产品不友好，如果你的项目未来不打算 GPL 开源，只能读思路，不能直接复制代码。

Volt 是 Tauri 2 + React + Rust 的跨平台 launcher，README 中声称支持 Windows/macOS/Linux，Apache-2.0 license。但它当前 GitHub stars 很少，生态成熟度不足。可以作为 Tauri launcher 结构参考，不能作为强依赖。

参考来源：

| 项目 | 地址 | 价值判断 |
| --- | --- | --- |
| Flow Launcher | https://github.com/Flow-Launcher/Flow.Launcher | 高价值。Windows app/file launcher 成熟参考，MIT，但技术栈是 C#。 |
| Kunkun | https://github.com/kunkunsh/kunkun | 中高价值。Tauri 跨平台 launcher 参考，但仍是早期项目。 |
| Vicinae | https://github.com/vicinaehq/vicinae | 高价值参考，低直接复用价值。GPL-3.0 需要谨慎。 |
| Volt | https://github.com/VoltLaunchr/Volt | 中等价值。技术栈接近，但项目成熟度低。 |

## 4. 窗口枚举与窗口切换参考

Windows 侧窗口切换可以直接基于 Win32 API 实现。关键 API 包括 EnumWindows、GetWindowThreadProcessId、ShowWindow、SetForegroundWindow、ShellExecute 或 CreateProcess。这里不建议把窗口切换完全交给第三方库，因为你的产品需要把“软件属于哪个工作区”和“窗口句柄属于哪个软件实例”绑定起来，自己封装平台适配层更可控。

需要注意的是，Windows 的 SetForegroundWindow 不是无条件成功。系统会限制后台程序抢焦点，所以产品应该把“用户点击左侧图标”作为触发点，在这个交互时机调用窗口激活逻辑。对于最小化窗口，需要先恢复，再尝试置前。对于管理员权限窗口，如果你的应用不是管理员权限，窗口聚焦和热键可能受 UIPI 限制。

AppSwitcher 是 Windows 侧值得参考的窗口切换项目。它用 C#/.NET 做静态热键到应用窗口的切换，支持启动未运行应用、同应用多窗口循环、现代 Windows packaged apps，并明确提到管理员窗口限制。它不是直接可复用底座，但对“点击/快捷键切到某个软件窗口”的行为模型很有参考价值。

macOS 侧可以参考 AltTab、OptionTab、Rectangle、get-windows。AltTab 和 OptionTab 都说明 macOS 上窗口切换需要 Accessibility 权限；get-windows 是 npm 包，可以获取 active/open windows 元数据，支持 macOS、Windows、Linux，但它主要做枚举，不负责完整激活链路。macOS 后续适配时，核心会落在 NSWorkspace、CGWindowListCopyWindowInfo 和 AXUIElement/Accessibility API 上。

参考来源：

| 项目或文档 | 地址 | 价值判断 |
| --- | --- | --- |
| Microsoft SetForegroundWindow | https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow | 高价值。Windows 聚焦窗口必须参考官方限制。 |
| AppSwitcher | https://github.com/ipatalas/app-switcher | 中高价值。Windows 应用切换模型接近，但项目规模小。 |
| get-windows | https://github.com/sindresorhus/get-windows | 中高价值。跨平台窗口元数据 npm 包，适合 Electron/Node 方案参考。 |
| node-window-manager | https://github.com/sentialx/node-window-manager | 中等价值。支持窗口管理，但最后 release 较旧，不能盲目信任。 |
| AltTab | https://alt-tab.app | 高价值参考。macOS 窗口级切换成熟项目，但 GPL/开源商业变化需要继续确认。 |
| OptionTab | https://github.com/andrealufino/optiontab | 中高价值。MIT、Swift、无第三方依赖，适合学习 macOS Accessibility 窗口切换。 |
| Apple NSWorkspace | https://developer.apple.com/documentation/appkit/nsworkspace | 高价值。macOS 打开应用/文件的官方入口。 |
| Apple CGWindowListCopyWindowInfo | https://developer.apple.com/documentation/coregraphics/cgwindowlistcopywindowinfo%28_%3A_%3A%29 | 高价值。macOS 获取窗口列表的官方入口之一。 |

## 5. 白板与 Canvas 组件

Excalidraw 是白板能力的第一候选。它是 MIT license，GitHub 约 124k stars，提供 npm package，可作为 React 组件嵌入。它支持画图、图片、导出 JSON/PNG/SVG，成熟度和社区都很强。它的问题是风格偏手绘白板，不是 Obsidian Canvas 那种卡片式知识组织。如果第一版想快速实现“截图 + 自由拖动 + 记录”，Excalidraw 最稳。

React Flow/xyflow 更适合做“卡片、节点、连线、Markdown 卡片”的结构化白板。它是 MIT license，适合做类似 Obsidian Canvas 的节点画布，但默认不是完整白板，需要自己实现卡片编辑、截图卡片、Markdown 渲染、画布持久化和工具栏。它的优势是产品形态更贴合“工作区操作记录”，缺点是开发量比 Excalidraw 大。

tldraw 功能很强，体验也更接近现代无限画布 SDK，GitHub star 很高；但它当前 README 明确写着 SDK 开发可免费使用，生产使用需要 license key。这个授权边界对个人商业产品或闭源产品有风险，所以不建议第一版把它作为核心依赖，除非你明确接受它的生产授权成本。

JSON Canvas 是 Obsidian Canvas 背后的开放格式，适合作为白板数据格式参考。它不是现成 UI 组件，但可以帮助我们设计白板数据结构，使未来导入/导出 Obsidian Canvas 或兼容类似工具更容易。

参考来源：

| 组件/标准 | 地址 | 价值判断 |
| --- | --- | --- |
| Excalidraw | https://github.com/excalidraw/excalidraw | 高价值。MIT、成熟、可嵌入，适合第一版快速落地。 |
| React Flow / xyflow | https://github.com/xyflow/xyflow | 高价值。MIT，适合卡片/节点式 Canvas，但需要自建编辑体验。 |
| tldraw | https://github.com/tldraw/tldraw | 技术高价值，授权需谨慎。生产使用可能需要 license key。 |
| JSON Canvas | https://obsidian.md/blog/json-canvas/ | 高价值数据格式参考，不是 UI 组件。 |

## 6. 推荐复用路线

第一版建议采用 Tauri 2 + React + Rust。前端负责工作区列表、左侧软件栏、软件搜索、白板 UI；Rust 后端负责 Windows 软件扫描、启动软件、枚举窗口、绑定窗口句柄、激活窗口。这样做的好处是 Windows 第一版可以直接落地，macOS 迁移时主要替换 platform adapter，而不是重写产品逻辑。

软件扫描不要一开始追求完全等同 Windows 开始菜单。第一版可以先扫描开始菜单快捷方式、注册表 uninstall 信息、常见安装目录，并允许用户手动添加 exe、快捷方式、文件夹、网址或命令。Flow Launcher 可以作为 Windows 搜索体验参考，但不建议直接接它的 C# 代码。

窗口切换建议自己实现平台适配层。Windows 先做 `scan_apps()`、`launch_app(app_id)`、`list_windows()`、`focus_window(window_id)`、`bind_process_to_workspace_app()` 这些接口。macOS 后续实现同样接口，内部再使用 NSWorkspace、CGWindowListCopyWindowInfo 和 Accessibility API。

白板第一版有两条可选路线。如果你想最快落地，选 Excalidraw，并在外层保存每个工作区的 Excalidraw JSON；如果你更看重 Obsidian Canvas 式卡片和 Markdown，选 React Flow/xyflow，自建 Markdown 卡片、图片卡片、连线和布局持久化。我更推荐第二条，因为你的需求重点是“记录每个工作区、每个软件的操作内容”，卡片式记录比手绘白板更贴合这个目标。

## 7. 需要避免的误区

不要直接 fork 一个 launcher 项目来改成工作区管理器。Launcher 项目的核心模型通常是“全局搜索并执行命令”，而你的核心模型是“工作区内的软件集合和记录上下文”。直接 fork 会让后续工作区数据、白板数据、窗口绑定关系变得别扭。

不要把窗口内嵌作为 MVP。开源项目里确实有一些窗口管理器和壳应用，但把任意外部软件嵌入自己的窗口，在 Windows 和 macOS 上都容易遇到权限、焦点、渲染、崩溃恢复和跨平台兼容问题。你的需求已经明确为“切换对应窗口”，所以应坚持外部窗口切换。

不要忽略许可证。Vicinae、AltTab 这类项目参考价值很高，但 GPL-3.0 对闭源商业软件有强约束；tldraw 技术上很强，但生产授权需要单独评估。优先选择 MIT、Apache-2.0 或自己写平台适配代码。

## 8. 初步技术选型

建议最终组合是：Tauri 2 + React + Rust 作为应用框架；Windows 平台适配层使用 Rust 调 Win32 API；白板如果追求最快验证用 Excalidraw，如果追求 Obsidian Canvas 式产品形态用 React Flow/xyflow；数据格式使用本地 SQLite 或结构化 JSON，并参考 JSON Canvas 设计白板节点结构。

这个组合的复用边界清晰：Tauri 复用桌面壳，Flow Launcher/Kunkun/Vicinae 参考启动器体验，AppSwitcher/OptionTab/AltTab 参考窗口切换行为，Excalidraw/xyflow/JSON Canvas 解决白板和画布数据。真正需要自己做的是“工作区语义”和“软件-窗口-白板记录”的绑定关系，这正是你的产品差异点。
