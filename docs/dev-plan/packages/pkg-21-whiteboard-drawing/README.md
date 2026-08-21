# pkg-21 白板画图层

状态：completed  

依赖：pkg-09  
规格：`docs/product/whiteboard-drawing-and-ai.md`

## 目标

现有 xyflow 卡片继续放笔记和图片。旁边加一层可画的 scene：笔迹、自由箭头、矩形、椭圆、短字。坐标和卡片同一套世界坐标。存自己的 JSON，不换 Excalidraw / tldraw。

这是 P2「AI 能画」的前提。本包不接模型。

## 改动范围

**可以改**

- `canvas_scenes` 或 `save_canvas` 附带 `sceneJson`
- 白板工具栏和画图层
- 与 React Flow viewport 同步

**不能做**

- 替换主白板
- AI 对话、总结、费曼
- 读外部软件

## 交付内容

1. 每工作区一份 `{"version":1,"elements":[...]}`。
2. 选择 / 画笔 / 箭头 / 矩形 / 椭圆 / 字。
3. 画图时不拖走卡片；选择时能删图形。

## 验收

- 画完重启还在
- 工作区不串图
- 卡片连线仍然可用
