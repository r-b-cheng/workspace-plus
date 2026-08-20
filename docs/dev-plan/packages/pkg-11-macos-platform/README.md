# pkg-11 macOS 扫描、启动与窗口聚焦

状态：pending  
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

## 验收

- 同一套 command 在 macOS 可用
- 没权限时聚焦失败原因清楚
- Windows 实现不被这包改坏
