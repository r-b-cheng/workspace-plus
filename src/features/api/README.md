# features/api

只封装 Tauri command。按领域拆文件：`tauri-client.ts`、`workspace-api.ts`、`app-api.ts`、`canvas-api.ts`。

组件和 store 只能调这里，不能自己 `invoke`。这里不要放 React 组件。
