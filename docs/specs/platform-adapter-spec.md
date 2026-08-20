# 平台适配规格文档

制定日期：2026-06-07

本文档定义工作区管理器的 Rust/Tauri 后端平台能力接口。它只覆盖系统相关能力：扫描已安装应用、启动应用、枚举窗口、聚焦窗口、读取窗口预览、读取应用图标、解析手动添加目标。工作区、白板、软件关联、排序、备注、本地保存属于业务层和存储层，不应该直接依赖 Windows 或 macOS API。

第一版实现目标是 Windows 原生可用，同时为 macOS 后续迁移保留同一组接口。前端只能调用 Tauri command 暴露的业务语义函数，例如 `scanInstalledApps`、`launchApp`、`focusWindow`，不能知道 `HWND`、注册表路径、`SetForegroundWindow`、`AXUIElement` 这些平台细节。

## 1. 模块边界

推荐 Rust 目录边界如下：

```text
src-tauri/src/
  commands/
    platform_commands.rs
  domain/
    app.rs
    window.rs
  platform/
    mod.rs
    windows/
      mod.rs
      app_scan.rs
      app_launch.rs
      window_ops.rs
      icon.rs
      manual_target.rs
    macos/
      mod.rs
  errors.rs
```

`commands` 只负责参数校验、调用 service 或 platform adapter、把错误转成前端可展示的结构。`domain` 保存跨平台 DTO 和业务模型。`platform` 定义 trait、平台实现和平台错误映射。业务层可以保存平台返回的 opaque id，但不能解释它的内部结构。

平台适配层必须满足三个原则。第一，所有平台能力都返回结构化错误，不能只返回字符串。第二，所有平台原生标识都必须包装成跨平台字符串或枚举，例如 Windows 的 `HWND` 只能作为 `NativeWindowId { platform: "windows", value: "..." }` 返回。第三，接口要允许“能力不可用”，因为 macOS 窗口聚焦、窗口截图和部分图标读取会受到辅助功能、屏幕录制或沙盒权限影响。

## 2. 跨平台数据结构

建议 Tauri command 返回字段使用 camelCase，Rust 内部用 snake_case 并通过 serde 重命名。下面是接口契约的稳定字段，不要求第一版一次性填满所有可选字段。

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub app_id: String,
    pub display_name: String,
    pub normalized_name: String,
    pub source: AppSource,
    pub launch_target: LaunchTarget,
    pub icon_ref: Option<IconRef>,
    pub publisher: Option<String>,
    pub version: Option<String>,
    pub install_location: Option<String>,
    pub platform: PlatformKind,
    pub confidence: MatchConfidence,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeWindow {
    pub window_id: NativeWindowId,
    pub process_id: u32,
    pub app_id_hint: Option<String>,
    pub title: String,
    pub executable_path: Option<String>,
    pub bounds: WindowBounds,
    pub state: WindowState,
    pub is_focusable: bool,
    pub last_seen_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchResult {
    pub app_id: Option<String>,
    pub process_id: Option<u32>,
    pub window: Option<NativeWindow>,
    pub launch_observation: LaunchObservation,
}
```

`app_id` 是平台适配层生成的稳定应用标识，不等于工作区内的软件关联 id。Windows 第一版可以用规范化启动目标、快捷方式路径、AUMID 或 exe 路径 hash 生成。`NativeWindowId` 是窗口级 opaque id，Windows 内部可映射到 `HWND`，macOS 内部可映射到 CGWindow id 或 Accessibility element 组合。持久化时可以保存这些 id，但恢复时必须重新校验，因为窗口句柄随进程生命周期变化。

`LaunchTarget` 需要覆盖扫描应用和手动添加目标：

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LaunchTarget {
    Executable { path: String, args: Vec<String>, working_dir: Option<String> },
    Shortcut { path: String },
    Url { url: String },
    Folder { path: String },
    Command { command: String, args: Vec<String>, working_dir: Option<String> },
    PlatformApp { identifier: String },
}
```

Windows 第一版应优先把扫描结果解析成 `Executable` 或 `Shortcut`。`Url` 和 `Folder` 可以由系统默认处理器打开，但仍然必须经过后端校验和明确错误返回。`Command` 只用于用户手动添加的高级目标，前端需要把它标记为高风险目标，后端不应静默执行来自不可信来源的命令。

## 3. 后端接口

平台 trait 建议集中在 `src-tauri/src/platform/mod.rs`：

```rust
pub trait PlatformAdapter: Send + Sync {
    fn scan_installed_apps(&self, request: ScanInstalledAppsRequest) -> Result<ScanInstalledAppsResult, PlatformError>;
    fn launch_app(&self, request: LaunchAppRequest) -> Result<LaunchResult, PlatformError>;
    fn list_windows(&self, request: ListWindowsRequest) -> Result<ListWindowsResult, PlatformError>;
    fn focus_window(&self, request: FocusWindowRequest) -> Result<FocusWindowResult, PlatformError>;
    fn capture_window_preview(&self, request: CaptureWindowPreviewRequest) -> Result<WindowPreview, PlatformError>;
    fn read_app_icon(&self, request: ReadAppIconRequest) -> Result<AppIcon, PlatformError>;
    fn resolve_manual_app_target(&self, request: ResolveManualAppTargetRequest) -> Result<ResolvedManualAppTarget, PlatformError>;
}
```

Tauri command 名称与产品语义保持一致：

```text
scanInstalledApps(request) -> ScanInstalledAppsResult
launchApp(request) -> LaunchResult
listWindows(request) -> ListWindowsResult
focusWindow(request) -> FocusWindowResult
captureWindowPreview(request) -> WindowPreview
readAppIcon(request) -> AppIcon
resolveManualAppTarget(request) -> ResolvedManualAppTarget
```

`scanInstalledApps` 用于生成本机软件库候选项。它可以由首次启动、用户手动刷新、设置页刷新触发，不应该在主界面高频执行。请求参数应包含 `forceRefresh`、`includeManualTargets`、`locale`、`limit` 等字段；结果需要包含 `apps`、`warnings`、`scannedSources`、`startedAt`、`finishedAt`。扫描失败不应导致整个应用不可用，至少要返回可解释的 partial result。

`launchApp` 启动一个 `LaunchTarget`，并尽可能在短时间内识别新进程和主窗口。请求参数应包含 `appId`、`launchTarget`、`workspaceId`、`timeoutMs`、`focusAfterLaunch`。返回的 `LaunchResult` 可以没有窗口，因为部分应用启动慢、启动到托盘、复用已有进程或只打开 URL。业务层不能把“无窗口”直接等同于启动失败。

`listWindows` 枚举当前可聚焦的顶层窗口。请求参数应支持按 `appId`、`processId`、`workspaceAppId` 过滤。结果应排除不可见窗口、工具窗口、空标题系统窗口和本产品自己的窗口，除非调试模式显式要求返回。这个接口用于工作区软件卡片状态刷新、窗口重新绑定和人工排错，不应该用很高频率轮询。

`focusWindow` 负责恢复最小化窗口并尝试置前。它接收 `NativeWindowId`，也可以接收 `processId` 或 `appId` 作为 fallback hint。返回值必须说明是否真正获得焦点、是否只是恢复窗口、是否被系统拒绝置前。前端据此展示“已切换”“窗口被系统阻止置前，请从任务栏打开”等不同状态。

`captureWindowPreview` 生成窗口缩略预览，只用于当前工作区概览、软件卡片或最近窗口截图。第一版不承诺实时视频预览，也不把外部应用嵌入本应用。请求参数应包含 `windowId`、`maxWidth`、`maxHeight`、`format`，返回 `imageBytes` 或本地缓存资源引用。截图失败时应回退到应用图标和名称。

`readAppIcon` 读取应用图标，用于软件库、添加软件面板和工作区软件卡片。接口应优先返回缓存资源引用，避免前端反复请求大图。Windows 第一版支持从 `.exe`、`.lnk`、UWP/开始菜单条目读取图标；失败时返回默认图标和 warning，而不是阻断软件添加。

`resolveManualAppTarget` 校验用户手动添加的 exe、快捷方式、文件夹、URL 或命令。它不启动目标，只做解析、规范化、图标尝试读取和风险标记。返回结果应包含 `resolvedTarget`、`displayNameSuggestion`、`iconRef`、`warnings`、`requiresConfirmation`。这条链路是系统扫描不完整时的兜底能力，必须比自动扫描更重视错误提示。

## 4. Windows 第一版实现路径

Windows 软件扫描分四路合并。第一路扫描当前用户和公共开始菜单目录下的 `.lnk`，解析快捷方式目标、参数、工作目录和图标。第二路读取注册表卸载信息，包括 `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall` 和 `HKLM` 对应路径，提取 `DisplayName`、`DisplayIcon`、`InstallLocation`、`DisplayVersion`、`Publisher`。第三路扫描常见安装目录只作为低优先级补充，例如 `Program Files` 和 `Program Files (x86)` 下明显的主 exe，不能全盘深扫。第四路合并用户手动添加目标。

扫描合并时以启动目标为主键做去重。开始菜单快捷方式通常比注册表更适合启动，所以同名应用优先保留 `.lnk` 的启动目标，同时吸收注册表的 publisher、version、installLocation。对 Electron、JetBrains、Office、浏览器这类可能存在多个入口的软件，不要强行合并成一个条目，应保留不同快捷方式或 profile 入口。

Windows 启动实现应按目标类型分流。`Executable` 使用 `CreateProcessW` 或 Rust 标准进程 API 启动，并保留参数和工作目录；`Shortcut` 通过 Shell 解析或 `ShellExecuteExW` 启动；`Url` 和 `Folder` 使用系统 shell 打开；`Command` 只执行用户确认过的本地命令，并记录它来自手动目标。启动后在 `timeoutMs` 内通过进程 id、exe 路径、窗口创建时间和窗口标题弱匹配主窗口。

Windows 窗口枚举使用 Win32 顶层窗口枚举能力，过滤不可见、无标题、owned/tool window、最小化不可交互和本产品窗口。返回前需要读取窗口标题、进程 id、进程 exe 路径、窗口矩形和最小化/最大化状态。对于 UWP、浏览器多进程、Electron 应用，窗口进程可能不是启动进程，所以匹配逻辑必须允许“启动进程 id 只是线索”，不要把它作为唯一依据。

Windows 聚焦窗口的基本流程是：校验 `HWND` 仍然存在；如果窗口最小化，先恢复；再尝试置前；最后读取当前前台窗口确认结果。系统可能因为前台锁定规则、管理员权限边界、不同桌面、UAC 弹窗或安全策略拒绝置前，接口必须返回 `FocusDenied` 或 `PartiallyFocused`，不能假装成功。

Windows 窗口预览第一版可以先做低风险实现：优先使用系统截图/窗口捕获能力生成静态缩略图；如果窗口最小化、被权限阻止、DWM 不提供内容或捕获到空图，则返回 `PreviewUnavailable`，前端展示图标占位。不要在 MVP 中承诺高频实时预览或后台读取外部软件内容。

Windows 图标读取优先顺序是：快捷方式声明图标、exe 资源图标、注册表 `DisplayIcon`、文件类型默认图标、产品默认图标。图标落地到应用数据目录的缓存文件，数据库只保存 `iconRef`，避免把二进制图标塞进主要业务表。

## 5. 失败场景和错误边界

平台错误建议使用可序列化错误码：

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformErrorCode {
    NotFound,
    InvalidTarget,
    PermissionDenied,
    LaunchFailed,
    WindowClosed,
    FocusDenied,
    PreviewUnavailable,
    IconUnavailable,
    UnsupportedPlatform,
    Timeout,
    PartialResult,
    Internal,
}
```

常见失败场景必须被产品层正确区分。路径不存在、快捷方式损坏、URL 格式非法属于 `InvalidTarget` 或 `NotFound`。目标需要管理员权限、跨权限窗口无法置前、macOS 未授予辅助功能权限属于 `PermissionDenied` 或 `FocusDenied`。启动命令返回成功但没有窗口，属于 `LaunchResult` 的可解释状态，不一定是 `LaunchFailed`。窗口句柄过期、用户手动关闭软件、应用崩溃属于 `WindowClosed`。截图、图标读取失败属于可降级能力，不应该阻断工作区主链路。

前端展示错误时要避免技术细节泄漏给普通用户，但日志里必须保留平台错误来源、原生错误码、目标路径摘要和操作阶段。路径、命令参数和窗口标题可能包含隐私信息，日志默认不应上传，也不应在普通 UI 里完整暴露。

## 6. 权限与隐私边界

第一版不自动读取外部软件内部内容，不监听键盘输入，不记录用户在外部软件里的操作。`listWindows` 只读取窗口标题、进程路径、窗口状态这些窗口管理所需元数据。`captureWindowPreview` 只在用户当前工作区需要显示预览或用户主动触发刷新时调用，不能后台持续截图。

手动命令目标是最高风险入口。后端只能执行用户显式保存并确认过的命令，不能接受远程内容、白板文本或未校验 UI 输入直接拼接成命令。命令参数必须结构化保存，不允许把一整段 shell 字符串当作默认路径处理。

Windows 管理员权限边界必须显式处理。普通权限运行的本产品可能无法聚焦或捕获管理员权限窗口；此时应提示“系统权限不一致，无法完成窗口切换或预览”，不应建议用户默认以管理员运行整个产品。以管理员运行会扩大启动命令和窗口操作风险，只能作为高级排错选项。

macOS 后续需要面对辅助功能权限和屏幕录制权限。窗口枚举、窗口聚焦、窗口预览在没有授权时可能只能部分工作。接口层必须允许返回 `requiresPermission` 和 `permissionKind`，前端才能引导用户去系统设置授权。

## 7. macOS 后续映射方式

macOS 应实现同一组 `PlatformAdapter` 接口，而不是新增一套前端 API。`scanInstalledApps` 映射到 `/Applications`、`~/Applications`、Launch Services 和 `NSWorkspace` 可发现的 `.app` bundle，`app_id` 优先使用 bundle identifier，`LaunchTarget::PlatformApp` 保存 bundle id 或 app bundle path。

`launchApp` 映射到 `NSWorkspace` 打开应用、文件夹或 URL。命令型目标在 macOS 上同样属于手动高级目标，需要用户确认，不应被普通扫描结果生成。启动后窗口识别可以通过 bundle id、process id、CGWindow 信息和 Accessibility 信息组合完成。

`listWindows` 可用 `CGWindowListCopyWindowInfo` 获取窗口列表和基础元数据，但窗口级控制能力通常需要 Accessibility API。`focusWindow` 应通过 `NSRunningApplication` 激活应用，并在授权后通过 `AXUIElement` 尝试聚焦具体窗口。macOS 版本要接受“只能聚焦应用，不能稳定聚焦某个具体窗口”的降级结果。

`captureWindowPreview` 在 macOS 上可能需要屏幕录制权限。没有权限时返回 `PreviewUnavailable` 和 `requiresPermission: screenRecording`。`readAppIcon` 可通过 app bundle 的 `NSWorkspace` 图标读取能力实现，并缓存为统一 `IconRef`。

因此，跨平台契约里必须保留 `capabilityStatus`：

```rust
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub can_scan_installed_apps: CapabilityStatus,
    pub can_launch_app: CapabilityStatus,
    pub can_list_windows: CapabilityStatus,
    pub can_focus_window: CapabilityStatus,
    pub can_capture_window_preview: CapabilityStatus,
    pub can_read_app_icon: CapabilityStatus,
}
```

Windows 第一版大多是 `available` 或 `degraded`；macOS 未授权时应返回 `requiresPermission`。业务层和前端不能假设所有平台能力永远可用。

## 8. 测试与人工验收

自动化测试分三层。第一层是纯 Rust 单元测试，覆盖 `LaunchTarget` 解析、手动目标校验、扫描结果去重、错误码序列化、窗口匹配评分。第二层是平台集成测试，只在真实 Windows 环境运行，覆盖开始菜单扫描、注册表扫描、启动系统自带应用、枚举窗口、读取图标。第三层是前端/Tauri command 契约测试，确保前端拿到的字段、错误码和降级状态稳定。

Windows 人工验收至少覆盖这些场景：扫描后能看到常见应用，例如浏览器、VS Code、终端、文件管理器；点击添加应用后能启动并加入当前工作区；应用已运行时再次点击不会重复添加，而是尝试聚焦；窗口最小化后点击软件卡片能恢复；窗口关闭后点击卡片能提示重新打开；损坏快捷方式、已卸载 exe、权限不足窗口都能返回明确错误；图标读取失败时仍能显示默认图标；窗口预览失败时不影响启动和聚焦主链路。

还需要单独验收隐私边界：应用不会持续截图；不会记录外部软件内部操作；不会监听键盘；不会因为移除工作区软件关联而关闭、卸载或删除真实系统应用；手动命令目标在保存和执行前都有明确确认。

macOS 阶段的验收重点不是复刻 Windows 每一个细节，而是验证同一前端和业务层能接入 macOS adapter。必须覆盖 `.app` 扫描、bundle id 启动、应用级聚焦、无辅助功能权限时的降级提示、授权后的窗口级聚焦尝试、无屏幕录制权限时的预览失败提示。

## 9. MVP 完成标准

平台适配 MVP 完成时，应该能从 Windows 扫描出可启动应用，启动用户选择的应用，把可识别窗口返回给业务层，枚举当前可聚焦窗口，恢复并聚焦一个已绑定窗口，读取应用图标，并允许用户手动添加 exe、快捷方式、文件夹、URL 或命令。所有这些能力都必须通过 `PlatformAdapter` 和 Tauri command 暴露，不能散落在前端或业务服务里。

如果某个能力在 Windows 上只能部分实现，应明确返回 degraded 状态，而不是阻塞 MVP。例如窗口预览可以先做静态缩略图并允许失败回退；多窗口精细绑定可以先选择最近一次由当前工作区启动或用户手动绑定的窗口；管理员权限窗口可以提示权限边界。真正不能妥协的是接口边界和错误结构，因为它们会直接决定后续 macOS 迁移成本。
