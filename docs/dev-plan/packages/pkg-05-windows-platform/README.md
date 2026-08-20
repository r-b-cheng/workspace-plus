# pkg-05 Windows 真实扫描、启动与窗口置前

状态：pending  
依赖：pkg-02  
可并行：pkg-03、pkg-04

## 目标

用 Windows 实现换掉 mock。前端和 command 名称不变。做完后，添加软件可以打开真程序，点卡片可以切到真窗口。

## 改动范围

**可以改**

- `src-tauri/src/platform/**`
- adapter 装配（`lib.rs`）
- 需要的 `windows` / `winreg` feature
- 带显式开关的 Windows 集成测试

**不能改**

- 前端交互语义和 command 名字
- 把 `HWND`、注册表路径塞进前端 DTO
- 文件夹 / URL / 命令
- 窗口截图预览、全局快捷键、安装包

## 交付内容

1. 扫描当前用户和公共开始菜单 `.lnk`。注册表卸载信息可选，用来补 publisher/version，不要全盘扫 Program Files。
2. 启动 `Executable` 与 `Shortcut`。无窗口不等于失败（托盘、复用进程）。
3. 枚举顶层可聚焦窗口；`NativeWindowId` 不透明。
4. 聚焦前先校验窗口还在；最小化先恢复；置前失败返回 `FocusDenied`，不要报成功。
5. 手动添加只解析 exe 与 `.lnk`。坏路径返回 `NotFound` / `InvalidTarget`。
6. 图标失败用默认图标，不阻断添加。

## 子任务

| ID | 子任务 | 完成标准 |
|---|---|---|
| s05-01 | Windows adapter 装配 | 正式运行走 Windows，测试可注入 mock |
| s05-02 | 开始菜单扫描与去重 | 常见软件可见，不全盘深扫 |
| s05-03 | 启动与短时窗口匹配 | 超时和“成功但无窗口”可区分 |
| s05-04 | 枚举 / 恢复 / 置前 | 关闭、拒绝、成功三种结果分开 |
| s05-05 | 手动 exe/lnk 与图标 | 无效路径结构化失败 |
| s05-06 | 原生测试隔离 | 默认 `cargo test` 不启真实 GUI |

## 隐私与权限

- 不读外部软件内部内容
- 不监听键盘
- 不后台截图
- 不要引导用户默认以管理员运行本产品
- 管理员窗口切不过去时，说明权限不一致

## 验收

- 前端仍只调业务 command
- 手动目标只有 exe 和 shortcut
- 默认测试不启动真实软件
