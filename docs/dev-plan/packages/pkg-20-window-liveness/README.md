# pkg-20 窗口关闭及时对账

状态：completed  
依赖：pkg-10

产品规格：[`docs/product/window-liveness.md`](../../../product/window-liveness.md)

## 目标

关掉外部窗口后，当前工作区尽快显示已关闭。不要用户再点一次列表才刷新。不要把软件移出工作区。

## 算法

只把绑定集合里的 **DESTROY** 和进程退出当成关闭（不要求顶层）。HIDE/CLOAKED、最小化、预览 SetParent 都不算失踪。看门狗每 2 秒枚举一次桌面，并对当前预览 hwnd 做 `IsWindow`。事件可带 `previewReleased`。

## 不能做

- 键盘钩子、截屏、活动时间线
- HWND 给前端
- Chromium 内嵌
- 关窗就移出软件
