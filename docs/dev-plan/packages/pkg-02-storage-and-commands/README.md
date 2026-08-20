# pkg-02 数据层、业务 command 与 mock 平台

状态：completed  
依赖：无  
可并行：pkg-01

## 目标

让前端下一包能打到真实 Tauri command。SQLite 是唯一长期存储。平台层先用 mock，Windows 真实现放到 pkg-05。

## 改动范围

**可以改**

- `src-tauri/src/domain`、`storage`、`commands`、`errors.rs`、`lib.rs`
- `src-tauri/src/platform` 的 trait 与 mock
- `src-tauri/migrations`
- Rust 测试
- 如字段需要对齐，只改 `src/lib/types.ts`

**不能改**

- React 页面与 feature 组件
- Win32 扫描 / 启动 / 枚举 / 置前
- 文件夹、URL、命令启动

## 必须注册的 command

```text
list_workspaces
create_workspace
rename_workspace
delete_workspace
set_active_workspace
list_workspace_apps
list_installed_apps
search_installed_apps
refresh_installed_apps
add_manual_app
launch_workspace_app
focus_workspace_app
remove_workspace_app
get_canvas
save_canvas
upsert_canvas_node
delete_canvas_node
save_canvas_asset
```

command 只做参数校验、调 service、返回 camelCase DTO。复杂规则放 service。

## 交付内容

1. 第一版竖切 schema：workspaces、installed_apps、workspace_apps、native_windows、canvas_nodes、canvas_edges、assets、app_settings。软删除 + WAL + 外键。
2. 系统软件与工作区软件分开。同一工作区同一 `installed_app` 只有一条有效关联。
3. 删除工作区：软删本工作区关联、窗口绑定、画布；不删 `installed_apps`；不调用平台关闭或卸载。
4. Mock adapter：固定软件列表；启动产生假窗口；聚焦可成功或返回 `WindowClosed`；手动添加只接受 exe / lnk。
5. 新库是空的，没有示例工作区。mock 软件库在 `refresh_installed_apps` 后出现。
6. 临时数据库集成测试覆盖隔离、去重、删除语义、画布恢复。

## 子任务

| ID | 子任务 | 状态 | 完成标准 |
|---|---|---|---|
| s02-01 | domain 与错误类型 | completed | camelCase DTO，结构化错误码 |
| s02-02 | migration 与开库 | completed | app data 下 sqlite，迁移可重复执行 |
| s02-03 | repository / service | completed | 事务写入；删工作区保留软件库 |
| s02-04 | trait + mock | completed | 可注入；真 Windows 可替换 |
| s02-05 | 注册 command | completed | 清单齐全，command 很薄 |
| s02-06 | 空库启动 | completed | `list_workspaces` 为空 |
| s02-07 | Rust 集成测试 | completed | 隔离 / 去重 / 删除 / 画布 |

## 数据边界

图片进 `assets/` 文件，数据库只存引用。不要把 React Flow 渲染对象写进表。`NativeWindowId` 对上层是不透明字符串，即使 mock 也不叫 `HWND`。

## 验收

- `cargo test` 绿
- 空库无示例工作区
- 重复添加不双绑
- 删除工作区不碰全局软件库
