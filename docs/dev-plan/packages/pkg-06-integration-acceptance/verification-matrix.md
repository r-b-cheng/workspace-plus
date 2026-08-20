# 已自动 / 仍需人工对照表

制定与 pkg-06 同期。**禁止用前端 mock 冒充 Windows 置前已通过。**

| 验收项 | 怎么验 | 分类 | 证据 |
|---|---|---|---|
| 空状态创建工作区 | Playwright mock + Vitest | 自动，非 Windows 证据 | `tests/e2e/empty-create-workspace.spec.ts`、`src/test/empty-workspace.test.tsx` |
| 添加软件后出现卡片 | Playwright mock | 自动，非 Windows 证据 | `tests/e2e/add-app-and-dedupe.spec.ts` |
| 重复添加显示已在工作区、不长第二张卡 | Playwright mock + cargo 去重 | 自动，非 Windows 证据 | 同上；`src-tauri/tests/storage_and_commands.rs` |
| 白板 Markdown / 图片 UI 与 mock 落盘 | Playwright mock + Vitest persist | 自动，非 Windows 证据 | `tests/e2e/whiteboard-markdown-image.spec.ts`、`src/test/canvas-*.ts` |
| 工作区 A/B 软件与白板隔离 | Playwright mock + Vitest + cargo | 自动，非 Windows 证据 | `tests/e2e/workspace-isolation.spec.ts`、canvas-store / storage 测试 |
| mock `focus` → `WindowClosed` 出现关闭提示和重开 | Playwright mock + Vitest | 自动，非 Windows 证据 | `tests/e2e/window-closed-reopen.spec.ts`、`src/test/window-closed-reopen.test.tsx` |
| mock `save_canvas` 失败 → `save-failed` 且可重试 | Playwright mock + Vitest | 自动，非 Windows 证据 | `tests/e2e/save-canvas-failed.spec.ts`、`src/test/save-status.test.tsx` |
| 删除工作区 / 移出软件文案 | Vitest | 自动，非 Windows 证据 | `src/test/delete-workspace-copy.test.tsx` |
| SQLite 存储、去重、删除保留软件库、画布恢复 | 默认 `cargo test` | 自动，非桌面证据 | `src-tauri/tests/storage_and_commands.rs` |
| **真实开始菜单 / 注册表扫描** | Windows 人工 | **仍需人工** | `windows-manual-acceptance.md` |
| **真实启动记事本或 Edge** | Windows 人工 | **仍需人工** | 同上 |
| **最小化恢复** | Windows 人工 | **仍需人工** | 同上 |
| **被遮挡窗口置前** | Windows 人工 | **仍需人工** | 同上 |
| **关掉真窗口后再重开** | Windows 人工 | **仍需人工** | 同上 |
| **手动坏路径（真文件系统）** | Windows 人工 | **仍需人工** | 同上 |
| **删工作区后真实软件仍在** | 数据层 cargo 已覆盖；真进程 / 开始菜单 | **仍需人工** | cargo 只证明库表；进程与卸载看人工清单 |
| 重启后最近工作区与画布仍在 | 数据层 cargo + 前端恢复逻辑；真重启 | 自动覆盖数据规则；**真重启仍需人工** | 人工清单「白板 / 新建与切换」 |
| Windows 原生扫描/启动/聚焦自动化 | `WINDOWS_NATIVE_TESTS=1` 的 ignored/开关集 | 不进默认 `cargo test` | `src-tauri/tests/windows_native.rs` |

## 命令（自动层）

```bash
npm test
npm run test:e2e
npm run build
cd src-tauri && cargo test
```

`npm run test:e2e` 使用 `VITE_E2E=1` + `window.__E2E_MOCK_INVOKE__`，不启动 Tauri，不操作真实窗口。
