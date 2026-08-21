# 目录规划

制定日期：2026-08-20

一个目录只放一类职责。产品说明、规格、执行计划、前端 feature、Rust 分层不要再平铺在同一个文件夹里。

## 仓库顶层

```text
workspace-hub/
  docs/                 文档，按职责分子目录
  src/                  React 前端
  src-tauri/            Rust / Tauri 后端
  tests/                前端 e2e（Playwright）
  index.html
  package.json
  vite.config.ts
```

顶层不要再新增业务目录。构建产物、数据库、日志进 `.gitignore`，不进仓库。

## 文档 `docs/`

```text
docs/
  README.md             文档入口
  product/              产品要做成什么样
  specs/                怎么实现、字段和接口
  process/              怎么协作、总控原则
  dev-plan/             这一刀怎么施工
```

| 目录 | 放什么 | 不放什么 |
|---|---|---|
| `product/` | PRD、界面方向、预览模式 | schema、command 清单、开发包 |
| `specs/` | 工程规范、数据模型、平台、前端 UI、测试验收 | 执行排期、子任务勾选 |
| `process/` | 总控原则、子智能体分工、开源复用 | 某个开发包的改动范围 |
| `dev-plan/` | 竖切流程 JSON、目录规划、开发包 | 产品愿景正文 |

开发包一人一夹，不要把 6 个包的 JSON/Markdown 平铺在 `packages/` 下：

```text
docs/dev-plan/
  README.md
  folder-structure.md
  development-flow.json          已完成的竖切
  p0-p2-flow.json                当前总控：pkg-19 已完成，当前包 pkg-20 窗口存活；跳过 pkg-13 至 18
  assemble-p0-p2-flow.py
  packages/
    pkg-01-engineering-foundation/
      pkg.json
      README.md
    pkg-07-settings-and-shortcut/
    pkg-08-quick-switch-panel/
    ...
```

改当前包时先改该包 `pkg.json`，再改该包 `README.md`，最后运行 `python docs/dev-plan/assemble-p0-p2-flow.py`。

## 前端 `src/`

按产品能力拆，不按页面区域把所有组件堆进 `app/`。

```text
src/
  app/                  壳：布局和启动编排
  components/ui/        shadcn 等无业务组件
  features/
    api/                Tauri command 封装，按领域拆文件
    workspaces/         工作区列表、创建、删除
    apps/               软件库、添加、标签、卡片
    windows/            窗口状态展示（不写 HWND）
    canvas/             白板
    settings/           pkg-07 起：全局设置与快捷键
    quick-switch/       pkg-08 起：快速切换面板
    activity-log/       pkg-13 起：可选窗口活动
    agent/              pkg-15 起：费曼学习
  lib/                  跨 feature 类型和工具
  styles/               全局样式入口
  test/                 Vitest 辅助
```

| 目录 | 可以写 | 不要写 |
|---|---|---|
| `app/` | `WorkspaceShell`、启动时拉数 | 工作区 CRUD、扫描、画布节点逻辑 |
| `features/workspaces/` | 侧栏、创建/删除弹窗、workspace store | 软件启动、白板保存 |
| `features/apps/` | 添加弹窗、标签、卡片、app store | 平台扫描、画布 |
| `features/windows/` | 窗口状态文案、重开入口 | Win32、HWND |
| `features/canvas/` | 画布、Markdown/图片卡片 | 软件启动、工作区删除 |
| `features/api/` | `invoke` 封装 | UI 组件 |
| `components/ui/` | 按钮、对话框等 | 任何业务 store |
| `lib/` | 类型、`cn`、错误码映射 | 页面 |

文件名 kebab-case，例如 `workspace-list.tsx`。组件 PascalCase。

## 后端 `src-tauri/`

```text
src-tauri/
  src/
    main.rs             进程入口
    lib.rs              装配 command 与模块
    errors.rs           跨模块错误
    commands/           薄 Tauri command，按领域拆
    domain/             业务模型，按对象拆
    services/           command 与存储/平台之间的编排
    storage/            SQLite、repository、开库
    platform/           系统能力
      mod.rs            trait
      mock.rs           假实现
      windows/          真 Windows，pkg-05 再写
      macos/            预留
    migrations/         SQL 迁移
  tests/                Rust 集成测试
```

| 目录 | 可以写 | 不要写 |
|---|---|---|
| `commands/` | 参数校验、调 service、返回 DTO | SQL、Win32、React 细节 |
| `domain/` | Workspace、InstalledApp、CanvasNode | 数据库语句、HWND |
| `services/` | 去重、删除语义、启动后绑窗口 | 直接 `CREATE TABLE`、直接 EnumWindows |
| `storage/` | schema、repository、资源路径 | 窗口置前 |
| `platform/` | 扫描、启动、枚举、聚焦 | 工作区别名、白板保存 |

前端 DTO 用 camelCase。平台原生 id 只以不透明字符串向上传。

## 测试

```text
src/test/               Vitest 辅助
tests/e2e/              Playwright，测 Web UI
src-tauri/tests/        Rust 集成，默认不启真实 GUI
```

Windows 原生测试必须显式开关，例如 `WINDOWS_NATIVE_TESTS=1`。不要和默认 `cargo test` 混在一起。

## 需要时再开、现在不要提前建的目录

对应开发包开始时再创建，避免空壳变成堆放处：

- `src/features/settings/`：pkg-07
- `src/features/quick-switch/`：pkg-08
- `src/features/activity-log/`：pkg-13
- `src/features/agent/`：pkg-15
- `src-tauri/src/plugins/`：pkg-18
- `src-tauri/src/platform/linux/`：仍不做
- 顶层 `ai/`、`scripts/windows-hacks/`：不要建
