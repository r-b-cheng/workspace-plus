# pkg-01 工程基础：Tailwind、shadcn 与目录规范

状态：pending  
依赖：无  
可并行：pkg-02

## 目标

按 `docs/specs/engineering-standards-and-tech-stack.md` 把前端工程骨架落地。做完后，三栏壳仍能打开，但还没有真实业务。

## 改动范围

**可以改**

- `package.json`、Vite、TS 配置
- Tailwind 4、shadcn/ui、`src/lib/cn.ts`
- `src/app/workspace-shell.tsx` 的样式迁徙
- `src/features/**`、`src/components/ui/**` 空目录和基础组件
- 主流程 `data-testid` 保留

**不能改**

- `src-tauri/src/**` 业务与平台实现
- 任何 `invoke`、Zustand 业务 store、白板逻辑
- 产品规格正文（PRD / 数据模型 / 平台规格）

## 交付内容

1. Tailwind 4 通过 Vite 生效，三栏布局用 utility class。
2. shadcn 至少有 button、dialog、input、label、scroll-area、separator。
3. 目录符合规范：`features/workspaces|apps|windows|canvas` 和 `features/api`。
4. `npm run build` 通过，开发态仍能看到左侧工作区、中间主区、右侧白板占位。

## 子任务

| ID | 子任务 | 完成标准 |
|---|---|---|
| s01-01 | 安装 Tailwind 4 及相关依赖 | 页面 class 能出样式 |
| s01-02 | 初始化 shadcn 并加基础组件 | 壳里能引用 Button/Dialog/Input |
| s01-03 | 新增 `src/lib/cn.ts` | 组件统一用 `cn()` |
| s01-04 | 创建 features / api 空目录 | 已完成：各 feature 目录和归属 README 已建好 |
| s01-05 | 手写 CSS 迁到 Tailwind | 视觉仍接近 `ui-direction-notes` |
| s01-06 | 保留 testid，构建通过 | `npm run build` 成功 |

## 验收

- 能打开三栏界面
- 本包 diff 里没有 Rust 业务和 Tauri invoke
- 文件名为 kebab-case，组件名为 PascalCase

## 施工注意

现有 `workspace-shell.tsx` 是静态假数据，本包可以继续用假数据撑布局。不要在这个包里改成“看起来接了后端”。右侧仍是占位，不要上 React Flow。
