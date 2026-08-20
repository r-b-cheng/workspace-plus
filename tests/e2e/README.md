# tests/e2e

Playwright 测 Web UI 主链路。全部用例都是 **mock command**。

每个 `*.spec.ts` 文件头写了：`MOCK ONLY — 不是 Windows 置前证据`。

`quick-switch-panel.spec.ts` 还写了：用 `__E2E_OPEN_QUICK_SWITCH__` 打开面板，**不是系统级全局热键已注册成功的证据**。

这些用例绿了，只说明前端主链路和失败态文案在 mock 下可走通。**不能**当成：

- 真实窗口置前已通过
- 最小化恢复已通过
- 开始菜单真扫描已通过
- 系统级全局热键已注册或真人按键已打开面板

真实桌面步骤见 `docs/dev-plan/packages/pkg-06-integration-acceptance/windows-manual-acceptance.md`。对照表见同目录 `verification-matrix.md`。

系统级热键（注册、冲突、真按键、真切窗）见：

- `docs/dev-plan/packages/pkg-09-p0-acceptance/windows-hotkey-manual-acceptance.md`
- `docs/dev-plan/packages/pkg-09-p0-acceptance/verification-matrix.md`

## 怎么跑

```bash
npx playwright install chromium
npm run test:e2e
```

开发服务器由 Playwright 拉起，端口 `1421`，环境变量 `VITE_E2E=1`。页面通过 `window.__E2E_MOCK_INVOKE__` 接内存后端，不 import 真实 Tauri。
