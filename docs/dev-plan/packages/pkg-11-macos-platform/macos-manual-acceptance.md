# pkg-11 macOS 人工清单

在真实 Mac 上验证扫描、启动和窗口置前。`cargo test` / `npm test` 只用纯函数和 mock，不能代替这一步。

默认 `cargo test` 不要开真实桌面。只有显式设置 `MACOS_NATIVE_TESTS=1` 才跑原生用例。

## 环境

| 项 | 填写 |
|---|---|
| 日期 | |
| 验收人 | |
| 构建 | 例如 `npm run tauri dev` |
| 系统版本 | |
| 辅助功能 | 已勾选 / 未勾选： |

## 清单

- [ ] 刷新软件库能扫到 `/Applications` 或 `/System/Applications` 里的常见 `.app`（Safari、TextEdit、预览 等）
- [ ] 把其中一个加入当前工作区并启动，软件能打开；坏路径（乱写的 `.app` 或不存在的文件）有明确失败，不会装成功
- [ ] **未授权**辅助功能时，点卡片或窗口列表切换：失败原因是 `FocusDenied`，文案提到「系统设置」或「辅助功能」，界面没有 `AXUIElement` / `CGWindow`
- [ ] 打开「系统设置 → 隐私与安全性 → 辅助功能」，勾选 Workspace Hub 后，再切一次：目标窗口能置前
- [ ] 关掉该软件后再切：提示窗口已关闭（`WindowClosed`），不要假装还在
