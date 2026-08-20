# 开发计划

制定日期：2026-08-20

规格文档在 `docs/product/` 和 `docs/specs/`。**具体改哪些文件、交什么、子任务做到哪**以当前总控 JSON 为准。

目录怎么拆，见 [folder-structure.md](./folder-structure.md)。

## 文件怎么读

- 已完成竖切：[`development-flow.json`](./development-flow.json)  
  pkg-01 到 pkg-06，状态 `completed`。
- 当前总控：[`p0-p2-flow.json`](./p0-p2-flow.json)  
  P0 剩余项（pkg-07 / 08 / 09）已完成。下一轮从 [pkg-10](./packages/pkg-10-multi-window/) 进入 P2。pkg-10 至 pkg-18 仍是 pending，不要标成 completed。本轮按用户决定跳过 P1。
- 分包：[`packages/<pkg-id>/`](./packages/)  
  每个包自己的文件夹，里面是 `pkg.json` 和 `README.md`。

改开发包时，先改该包 `pkg.json`，再改该包 `README.md`，最后运行 `python docs/dev-plan/assemble-p0-p2-flow.py` 同步当前总控。

## 当前顺序

| 包 | 名称 | 阶段 | 依赖 |
|---|---|---|---|
| [pkg-07](./packages/pkg-07-settings-and-shortcut/) | 全局设置与可配置快捷键 | P0 | 竖切完成 |
| [pkg-08](./packages/pkg-08-quick-switch-panel/) | 快速切换面板 | P0 | 07 |
| [pkg-09](./packages/pkg-09-p0-acceptance/) | P0 剩余项联调验收 | P0 | 07、08 |
| [pkg-10](./packages/pkg-10-multi-window/) | 同一软件多窗口 | P2 | 09 |
| [pkg-11](./packages/pkg-11-macos-platform/) | macOS 真实平台 | P2 | 09，可与 10 并行 |
| [pkg-12](./packages/pkg-12-window-embed/) | 可选窗口内嵌（实验） | P2 | 10 |
| [pkg-13](./packages/pkg-13-activity-observe/) | 可选窗口活动观察 | P2 | 10 |
| [pkg-14](./packages/pkg-14-ai-canvas-summary/) | 画布手动 AI 总结 | P2 | 09 |
| [pkg-15](./packages/pkg-15-feynman-agent/) | 费曼学习 Agent | P2 | 14 |
| [pkg-16](./packages/pkg-16-device-sync/) | 工作区导出导入 | P2 | 09 |
| [pkg-17](./packages/pkg-17-collaboration/) | 只读分享与评论 | P2 | 16 |
| [pkg-18](./packages/pkg-18-plugin-marketplace/) | 本机插件加载 | P2 | 09 |

P0 剩余项（07 / 08 / 09）已完成。单人下一包是 `pkg-10`，然后按 P2 依赖往下。一次只做一个包。不要开始写 pkg-10 代码，除非明确接到下一包。

## 这一轮做什么、不做什么

剩余 P0 已收口：可配置快捷键、快速切换面板、热键人工验收（自动层用 hook；系统级热键仍走 pkg-09 人工清单）。

下一轮做 P2，但每包都是第一刀，不是把愿景一次做完：

- 内嵌默认关，失败回退到真实窗口
- 活动观察默认关，只记窗口标题，不钩键盘
- Agent 只看画布，默认手动触发
- 同步先做导出导入，协作先做只读分享，插件先做本机加载

本轮不做 P1：窗口截图预览、别名编辑页、待办卡片、文件夹/URL/命令、Windows 安装包。
