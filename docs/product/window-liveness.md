# 窗口存活检测

记录日期：2026-08-21

本文只解决一件事：用户关掉外部窗口后，工作区里的「运行中」和窗口列表要尽快变成「已关闭」。不把软件移出工作区。不读软件内部。前端仍然看不到 HWND。

Chromium / Electron 的交互式预览不在本文范围，见第 6 节。

开发包：`docs/dev-plan/packages/pkg-20-window-liveness/`。

## 1. 现状

窗口是否还在，只在这些时刻核对桌面：

- 展开卡片上的「窗口列表」
- 聚焦某个窗口失败
- 启动后绑窗口

关掉窗口本身不会通知产品。所以标签会一直显示「运行中」，列表里那一行也还在，直到用户再点一次。

`list_workspace_app_windows` 里其实已经有对账：枚举桌面，没再出现的绑定标 `closed`。缺的是**谁在窗口消失时触发这次对账，以及如何把结果推到界面**。

## 2. 产品规则

- 关掉窗口 ≠ 移出工作区。软件条目留下，状态改为 `window_closed`，可重新打开。
- 展开中的窗口列表：关掉的那一行立刻标「已关闭」，不要假装还开着。
- 应用栏标签：最后一个窗口关掉后，从「运行中」变成「窗口已关闭」。
- 正在预览的窗口被关掉：释放预览，回到调度台，不要留空宿主。
- 不要为了追窗口去钩键盘、读网页、常驻截屏。

## 3. 算法：事件为主，轮询托底，进程退出打批量

只跟踪**已经绑进当前工作区的窗口**，不要监听全桌面每一个控件。

```text
绑定窗口时
  └─ 记下 opaque id 和 pid

窗口销毁（仅 EVENT_OBJECT_DESTROY）
  └─ opaque id 必须在 running 绑定集合里（预览里已是子窗口也算）
  └─ 对不上直接丢，不要进 SQLite
  └─ 150ms 合并后标 closed，必要时改软件状态，emit 前端

该 pid 进程退出
  └─ 这个软件下所有 running 窗口标 closed，emit 前端

2 秒看门狗（当前工作区 running 与 window_closed 的软件，桌面只枚举一次）
  └─ 复用 sync_workspace_app_windows
  └─ 正在预览、已被 SetParent 的窗口：枚举看不到不算失踪
  └─ 但对当前预览 hwnd 做 window_is_open；死了就释放预览
  └─ 状态有变才 emit
```

### 3.1 为什么不是纯轮询

只靠 2 秒枚举也能最终一致，但关掉窗口后标签会假「运行中」两秒，而且展开的列表不会动。事件让关闭在一次消息循环内反映到 UI。

### 3.2 为什么不是全局高频 EnumWindows

全桌面 10Hz 扫描会拖慢机器，也扫到大量无关窗口。看门狗每 2 秒对当前工作区枚举**一次**桌面，再对 running / window_closed 的软件对账。不要每个软件扫一遍。

### 3.3 Windows 事件过滤

`SetWinEventHook` 用 `WINEVENT_OUTOFCONTEXT`，独立线程带消息循环。只把 **`EVENT_OBJECT_DESTROY`** 当成关闭。

不要把 `EVENT_OBJECT_HIDE` / `EVENT_OBJECT_CLOAKED` 当成关闭：最小化、虚拟桌面、Chromium cloak 窗口都还在。最小化窗口仍应算运行中（`IsIconic` 的窗口本来就会出现在枚举里）。

其余过滤：

- `idObject == OBJID_WINDOW`
- opaque id 必须已在 running 绑定集合里，否则回调里丢掉，不要进 debounce，也不打数据库
- **不要**再用「必须是顶层 / `GetAncestor == self`」挡住绑定窗口：预览里它已经是子窗口；`OUTOFCONTEXT` 下已销毁的顶层 hwnd 的 `GetAncestor` 也可能是 0

钩子失败时退化成看门狗，不能让产品起不来。

### 3.3.1 预览中的窗口

`SetParent` 之后窗口不再是顶层，`EnumWindows` 看不到它。对账不得因为「枚举里没了」就标 closed 或释放预览。

用户关掉正在预览的那一扇时必须退出预览：

- DESTROY 的 hwnd 只要还在 running 绑定集合里就要处理，哪怕它已经是子窗口（`GetAncestor != self`）。子控件销毁的是别的 hwnd，集合对不上，仍会丢掉。
- 看门狗每拍用 `window_is_open` / `IsWindow` 问**当前预览那一扇**还在不在。活着的子窗口会返回还在；关掉了就按 gone 释放预览。不要靠整桌面枚举来发现这件事。

钩子失败（没权限、初始化失败）时算法退化成看门狗，不能让产品起不来。

### 3.4 进程退出

绑窗口时如果有 pid，登记一次等待（进程句柄 + 回调）。进程没了，不必等 WinEvent。一个软件退出会关掉它的多扇窗口。

### 3.5 前端

后端 emit 语义事件 `workspace-windows-changed`，载荷：`workspaceId`，可选 `workspaceAppId`，可选 `previewReleased`。不要 HWND，不要 WinEvent 常量。

当前工作区匹配则**原地**刷新软件列表和已展开的窗口列表，不要走「切换工作区」那条会清空中间栏的路径。进行中的刷新在用户已经切走或已开始新预览之后必须丢弃；过期的 `previewReleased` 不得释放新宿主。

`previewReleased: true` 时退出预览，但必须对准**被释放的那一次预览**：带上该会话的 `previewSeq`，以及被关窗口所属的 `workspaceAppId`。用户在 DESTROY 去抖或刷新等待期间已经预览了另一个软件（或同一软件的下一扇）时，不得再 `releaseEmbeddedWindow`。不要只看软件是不是还 running。

### 3.6 macOS

本包 Windows 先做真钩子。macOS 可以只接看门狗（已有 `list_windows`）。不要在本包写 Accessibility 观察。

## 4. 不做

- 默认打开 pkg-13 那种活动时间线
- 为「及时」把 EnumWindows 提到 10Hz
- 关掉窗口就从工作区删掉软件
- 把 Chromium 强行 SetParent 进来

## 5. 验收

自动：mock 掉一个 opaque id 后，对账把该行标 closed，软件在无剩余窗口时变成 window_closed；事件载荷无 hwnd。

人工：开两个记事本窗口，关掉一个，未再点「窗口列表」时，列表或标签已反映关闭；两个都关则标签为「窗口已关闭」。Chrome 同理（只测列表，不测预览内嵌）。

## 6. Chromium / Electron 预览

「浏览器或 Electron 窗口无法在本窗口预览」不是误报。Chromium 用独立 GPU 合成、多层子窗口和沙箱，`SetParent` 进我们的客户区会出现黑屏、点不到、DPI 错乱。业界没有可维护的「把已打开的 Chrome 嵌进来操作」方案。

可选的后续（不是本包）：

| 做法 | 能看 | 能操作 | 结论 |
|---|---|---|---|
| 继续 SetParent | 不可靠 | 不可靠 | 维持拒绝 |
| DWM 缩略图 / Graphics Capture | 能 | 不能 | 以后可做「看见」不能当预览模式 |
| 用 WebView2 自己开网页 | 能 | 能，但是另一个浏览器 | 不是用户那扇 Edge |

本包预览失败仍回退聚焦系统窗口。
