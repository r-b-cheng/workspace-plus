# src-tauri/tests

Rust 集成测试：临时数据库、业务规则、mock 平台。

默认 `cargo test` 使用临时 SQLite 和 `MockPlatformAdapter`，不启动真实 GUI，也不碰开始菜单或真实窗口。

依赖真实开始菜单或真实窗口的用例必须加显式开关，不能进默认 `cargo test`。

设置 `WINDOWS_NATIVE_TESTS=1` 才会跑 `windows_native.rs` 里的真扫描 / 真启动 / 真聚焦。

设置 `MACOS_NATIVE_TESTS=1` 才会跑 `macos_native.rs` 里的真扫描 / 真启动 / 真聚焦。默认 `cargo test` 在 Windows 和 macOS 都不会碰真实桌面。
