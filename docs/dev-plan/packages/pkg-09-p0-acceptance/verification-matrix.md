# 已自动 / 仍需人工对照表（P0 快捷键与快速切换）

制定与 pkg-09 同期。**禁止用 hook 或 mock 冒充系统级全局热键已通过。**

竖切主链路（工作区、添加软件、白板、真窗口置前）仍看 pkg-06：

- `docs/dev-plan/packages/pkg-06-integration-acceptance/verification-matrix.md`
- `docs/dev-plan/packages/pkg-06-integration-acceptance/windows-manual-acceptance.md`

| 验收项 | 怎么验 | 分类 | 证据路径 |
|---|---|---|---|
| 名称 / 别名 / 备注 / 标题过滤 | Vitest 纯函数与组件 | 自动，非热键 | `src/test/quick-switch-results.test.ts`、`src/test/quick-switch-panel.test.tsx` |
| 三种动作分发（聚焦 / 重开 / 添加并打开） | Vitest | 自动，非热键 | 同上；`execute-result.ts` |
| 无工作区 / 无匹配空状态 | Vitest + Playwright hook | 自动，**非系统热键证据** | `src/test/quick-switch-panel.test.tsx`；`tests/e2e/quick-switch-panel.spec.ts` |
| hook 打开面板后过滤 | Playwright：`__E2E_OPEN_QUICK_SWITCH__` | 自动，**非系统热键证据** | `tests/e2e/quick-switch-panel.spec.ts` |
| hook 后 Enter 走 mock focus | Playwright mock `focus_workspace_app` | 自动，非置前、**非系统热键证据** | 同上 |
| hook 后关闭项重开、未加入项添加并打开 | Playwright mock launch | 自动，非真启动、**非系统热键证据** | 同上 |
| 设置读写 mock（改成 `Alt+KeyK` 再打开仍在） | Playwright mock `get_app_settings` / `update_app_settings` | 自动，非热键 | 同上「设置读写」用例 |
| 设置非法组合 / 冲突文案 | Vitest + Rust | 自动，非热键 | `src/test/settings-dialog.test.tsx`；`src-tauri` 设置 / shortcut 测试 |
| **启动后默认快捷键是否真正注册到系统** | Windows 人工 | **仍需人工** | `windows-hotkey-manual-acceptance.md` |
| **设置里改绑后系统级热键是否换成新组合** | Windows 人工 | **仍需人工** | 同上 |
| **重启后仍是上次保存的系统热键** | Windows 人工 | **仍需人工** | 同上 |
| **冲突或系统拒绝时界面有原因** | 数据层/设置 UI 已有自动；真冲突 | **仍需人工** | 自动只证明文案；真冲突看人工清单 |
| **真人按下已注册组合打开面板** | Windows 人工 | **仍需人工** | 不能用 hook / 顶栏按钮代替 |
| **面板 Enter 后切到真实外部窗口** | Windows 人工 | **仍需人工** | 同上 |
| **真窗口已关闭后重开 / 未加入项真启动** | Windows 人工 | **仍需人工** | 同上 |

## 命令（自动层）

```bash
npm test
npx playwright test tests/e2e/quick-switch-panel.spec.ts
npm run test:e2e
```

`npm run test:e2e` 使用 `VITE_E2E=1` + `window.__E2E_MOCK_INVOKE__`，并用 `__E2E_OPEN_QUICK_SWITCH__` 打开面板。不启动 Tauri，不注册系统热键，不操作真实窗口。
