# 项目开发总控计划

制定日期：2026-06-07

本文档用于管理 Workspace Hub 的开发推进。当前项目第一版目标不是做完整虚拟桌面，也不是把外部软件嵌入应用内部，而是稳定完成工作区管理、软件扫描与启动、外部窗口切换、白板记录和本地持久化。

2026-08-20 起，已完成竖切的记录仍在 `docs/dev-plan/development-flow.json`。当前执行计划以 `docs/dev-plan/p0-p2-flow.json` 为准：先补剩余 P0（快捷键与快速切换），再做 P2。每个开发包独占 `docs/dev-plan/packages/<pkg-id>/`，内含 `pkg.json` 和 `README.md`。目录归属见 `docs/dev-plan/folder-structure.md`。规格文档在 `docs/product/` 与 `docs/specs/`；改哪些文件、交什么、子任务做到哪，以开发包为准。

## 1. 开发原则

第一版必须先打通主链路：创建工作区，搜索并添加软件，启动软件，将软件加入当前工作区，点击软件卡片切换到真实外部窗口，在右侧白板记录 Markdown 或图片卡片，并在重启后恢复数据。

所有平台相关能力必须收口在 Rust/Tauri 后端的平台适配层。React 前端不能出现 `HWND`、注册表路径、`SetForegroundWindow`、macOS Accessibility 等系统细节。前端只调用业务语义 command，例如 `scanInstalledApps`、`launchWorkspaceApp`、`focusWorkspaceApp`、`saveCanvas`。

所有白板数据必须和工作区绑定。系统软件库和工作区软件条目必须分开建模，因为同一个软件在不同工作区可以有不同别名、用途、排序、窗口绑定和白板记录。

## 2. 当前子智能体分工

当前已启动 4 个第一轮子智能体，用于补齐正式开发前的关键规格文档。

平台适配智能体 Ampere，负责 `docs/specs/platform-adapter-spec.md`。它需要定义 Windows 第一版的扫描、启动、窗口枚举、窗口聚焦、图标读取和未来 macOS 映射方式。

数据与本地存储智能体 Noether，负责 `docs/specs/data-model-and-storage-spec.md`。它需要定义 SQLite schema、迁移策略、工作区软件和系统软件的关系、白板节点和资源存储方式。

前端工作区智能体 Carson，负责 `docs/specs/frontend-workspace-ui-spec.md`。它需要定义 React 组件结构、状态管理、Tauri command 调用边界、三栏布局和前端主流程。

测试与验收智能体 Planck，负责 `docs/specs/test-and-acceptance-plan.md`。它需要定义 Vitest、Playwright、Rust 测试和 Windows 人工验收边界。

## 3. 阶段路线

第一阶段是规格收敛。完成平台、数据、前端、测试四份规格文档后，由总控统一检查术语、接口、字段和验收标准是否一致。这个阶段的完成标准是：可以据此开始创建 Tauri 项目，而不会反复推翻核心模型。

第二阶段是工程脚手架。创建 Tauri 2 + React + TypeScript + Vite + Rust 项目结构，引入 Tailwind、shadcn/ui、lucide-react、Zustand、React Flow、CodeMirror、rusqlite、windows crate 等基础依赖。这个阶段只做最小可运行空壳和基础目录结构。

第三阶段是数据和 command 骨架。先实现 SQLite migration、domain model、repository、Tauri command 类型定义和 mock platform adapter。前端可以基于 mock 数据完成界面，不被真实 Windows API 阻塞。

第四阶段是前端主界面。实现左侧工作区列表、中间当前工作区软件标签/卡片、添加软件弹窗、顶部搜索与保存状态、右侧白板容器。这个阶段先把 UI 主流程跑通，并用 Playwright 验证。

第五阶段是 Windows 平台能力。实现软件扫描、手动添加软件、启动软件、窗口枚举、窗口绑定、窗口恢复和置前。这个阶段需要真实 Windows 环境验收，不能只依赖单元测试。

第六阶段是白板 MVP。实现 Markdown 卡片、图片卡片、拖拽、缩放、选择、删除、自动保存和恢复。操作记录时间线先做手动记录，不做自动监听外部软件行为。

第七阶段是集成和打包。联调前端、后端、平台适配和本地数据库；补齐失败状态；检查许可证；完成 Windows 安装包或可运行构建。

第二版可以在第一版主链路稳定后加入 Agent use case。产品最终形态是：用户和 AI 对着同一块白板对话。AI 读取当前工作区里用户放进去的 Markdown、图片说明、连线、手绘 scene，可以讨论，也可以把新卡片或图形写回白板。费曼式追问是其中一种用法，不是唯一入口。规格见 `docs/product/whiteboard-drawing-and-ai.md`。

这个 Agent 不应该读取外部软件内部内容。开发应分包：先补用户画图层（pkg-21），再做上下文抽取和手动总结（pkg-14）、费曼会话（pkg-15），最后做对话写回（pkg-22）。实时不等于每次输入都请求模型，默认手动发送或防抖；范围可选当前选中、当前视口或整张画布。密钥不进白板。

## 4. MVP 任务清单

`P0` 任务必须进入第一版：项目脚手架、工作区 CRUD、软件扫描、软件搜索、启动软件、加入当前工作区、窗口切换、快速切换面板、快捷键配置、白板 Markdown 卡片、图片卡片、自动保存、本地 SQLite 持久化、Windows 基础验收。

`P1` 任务可以在第一版后半段进入：窗口截图预览、工作区内软件别名、操作记录时间线、手动添加 URL/文件夹/命令、更多快捷键动作、工作区设置、导出白板数据。

`P2` 任务暂不进入 MVP：外部软件内嵌、多窗口精细管理、跨设备同步、多人协作、白板画图层、画布对话式 AI（读上下文、讨论、往白板上画）、AI 自动总结、基于画布内容的费曼学习 Agent、自动监听用户在外部软件内的具体操作、插件市场、完整 macOS 实现。

## 5. 验收门槛

每个阶段合并前必须明确三件事：哪些功能已经自动测试，哪些功能只能在真实 Windows 环境人工验证，哪些风险暂时接受并记录到后续任务。

第一版最终验收至少要覆盖：创建两个工作区并确认数据隔离；从系统扫描结果添加一个软件；重复添加同一软件不会生成重复绑定；启动软件后当前工作区出现软件卡片；点击卡片能恢复并切换到真实窗口；窗口关闭后有明确提示并可重新打开；白板卡片重启后仍存在；删除工作区不会卸载或关闭真实软件。

快速切换也进入第一版验收：用户可以通过配置的快捷键打开快速切换面板，输入当前工作区内的软件名或别名，通过键盘选择结果并切换到对应外部窗口。`Ctrl+O` 可以作为 Windows 默认候选快捷键，但必须能修改，且注册失败时要给出明确反馈。

## 6. 总控工作方式

我作为开发总控负责维护接口一致性、任务优先级和最终验收。子智能体可以独立完成边界清晰的文档、模块或测试，但不能各自改变核心产品边界。涉及跨模块的数据结构、Tauri command 名称、平台 trait、数据库 schema 的改动，必须回到总控统一。

后续进入代码实现时，子智能体的写入范围必须继续保持隔离。例如平台适配智能体只改 `src-tauri/src/platform` 和相关测试，前端工作区智能体只改 `src/features/workspaces`、`src/features/apps` 和相关组件，白板智能体只改 `src/features/canvas`，数据智能体只改 `src-tauri/src/storage`、`src-tauri/migrations` 和 domain model。
