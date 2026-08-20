# 第一版竖切开发计划

制定日期：2026-08-20

本目录是 Workspace Hub 第一版竖切的执行计划。规格文档在 `docs/product/` 和 `docs/specs/`；**具体改哪些文件、交什么、子任务做到哪**以这里为准。

目录怎么拆、一个文件夹里能放什么，见 [folder-structure.md](./folder-structure.md)。

## 文件怎么读

- 总控：[`development-flow.json`](./development-flow.json)  
  整个开发流程在这一个 JSON 里。每个开发包是其中一块。
- 分包：[`packages/<pkg-id>/`](./packages/)  
  每个包自己的文件夹，里面是 `pkg.json` 和 `README.md`，不要把不同包平铺在一起。

改开发包时，先改该包 `pkg.json`，再改该包 `README.md`，最后同步总控 JSON。

## 开发包顺序

| 包 | 名称 | 依赖 |
|---|---|---|
| [pkg-01](./packages/pkg-01-engineering-foundation/) | 工程基础：Tailwind、shadcn、目录规范 | 无 |
| [pkg-02](./packages/pkg-02-storage-and-commands/) | 数据层、业务 command、mock 平台 | 无，可与 01 并行 |
| [pkg-03](./packages/pkg-03-frontend-workspace/) | 前端工作区主界面接通 | 01、02 |
| [pkg-04](./packages/pkg-04-whiteboard-canvas/) | 白板：Markdown / 图片 / 拖拽缩放 / 自动保存 | 01、02、03 |
| [pkg-05](./packages/pkg-05-windows-platform/) | Windows 真实扫描、启动、窗口置前 | 02，可与 03/04 并行 |
| [pkg-06](./packages/pkg-06-integration-acceptance/) | 竖切联调、失败态、验收测试 | 03、04、05 |

单人顺序：`01 → 02 → 03 → 04 → 05 → 06`。

## 这一刀做什么、不做什么

做完的标志：空状态新建工作区 → 搜索或手动添加 exe/快捷方式 → 启动并加入工作区 → 点卡片切窗口 → 窗口关闭有提示并能重开 → 白板 Markdown/图片重启还在 → 删工作区或移出软件只删关联。

不做：快速切换、全局快捷键、安装包、待办卡片、操作时间线、文件夹/URL/命令、窗口截图预览、软件内嵌、费曼 Agent。
