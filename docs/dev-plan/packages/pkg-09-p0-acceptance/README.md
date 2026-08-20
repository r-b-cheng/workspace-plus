# pkg-09 P0 剩余项联调与验收

状态：completed  
依赖：pkg-07、pkg-08

## 目标

把设置、快捷键、快速切换收成 P0 闭环。面板主路径用自动测试；系统级热键必须人工验。

## 改动范围

**可以改**

- 联调胶水、错误文案
- Playwright、Vitest、Rust 测试
- 本目录计划和人工清单

**不能做**

- P1：截图预览、别名编辑、时间线、待办、文件夹/URL/命令
- P2：内嵌、macOS、Agent、同步、协作、插件

## 交付内容

1. Playwright：用 hook 打开面板，覆盖过滤和三种动作。文件头写明不是系统热键证据。
2. Windows 人工清单：`windows-hotkey-manual-acceptance.md`（改快捷键、冲突提示、真按键打开、切到记事本或 Edge）。
3. 自动 / 人工对照表：`verification-matrix.md`，避免用 hook 冒充全局热键已通过。

## 子任务

| ID | 子任务 | 完成标准 | 本包怎么收 |
|---|---|---|---|
| s09-01 | 联调主路径 | 改快捷键 → 打开面板 → 执行动作 | e2e mock 补 `get_app_settings` / `update_app_settings`；设置改 `Alt+KeyK` 后再 hook 打开面板。联调时修了创建工作区后立刻添加会被在途 `loadWorkspaceApps` 冲掉的胶水 |
| s09-02 | Playwright | hook 用例标明不是热键证据 | `tests/e2e/quick-switch-panel.spec.ts` |
| s09-03 | 人工清单 | 真按键和冲突可勾选 | 本目录两份清单 / 对照表 |
| s09-04 | 标记 P0 完成 | 总控进入 P2 | 07/08/09 为 completed；下一轮从 pkg-10 开始，10–18 仍 pending |

## 验收

- P0 剩余项能演示（设置读写 + hook 面板；真热键走人工清单）
- 自动和人工分得清
- 没有做下一轮功能
