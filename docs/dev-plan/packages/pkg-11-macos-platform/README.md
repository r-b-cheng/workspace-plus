# pkg-11 macOS 扫描、启动与窗口聚焦

状态：completed  
依赖：pkg-09  
可并行：pkg-10

## 目标

产品层继续只说“扫描、启动、聚焦”。macOS 换自己的 adapter。窗口切换依赖辅助功能权限，没授权不能装成功。

## 改动范围

**可以改**

- `src-tauri/src/platform/macos/**`
- adapter 装配
- 权限说明文案

**不能做**

- 重写工作区 / 白板 / 设置
- Linux
- 软件内嵌
- 把 Accessibility 对象传到前端

## 交付内容

1. 扫描 Applications / 启动器里的常见应用。
2. 启动 .app，枚举窗口，尝试置前。
3. 未授权时给出系统设置指引。
4. 默认测试不启动真实 GUI。

## 子任务

| ID | 子任务 | 完成标准 |
|---|---|---|
| s11-01 | adapter 骨架并装配 | macOS 默认走真实 adapter；测试仍可注入 mock |
| s11-02 | 扫描与启动 | 能扫到常见 .app；能启动；坏路径结构化失败 |
| s11-03 | 窗口枚举与聚焦 | 有权限可置前；无权限 FocusDenied；窗口没了 WindowClosed |
| s11-04 | 隔离原生测试 | 默认 cargo test 不碰真实桌面；有人工清单 |

## 验收

- 同一套 command 在 macOS 可用
- 没权限时聚焦失败原因清楚
- Windows 实现不被这包改坏

真桌面请勾 `macos-manual-acceptance.md`。默认 `cargo test` 只跑纯函数，不要当成已经在 Mac 上切过真实窗口。
