import { LayoutGrid, MoreHorizontal, Plus, Search, Settings } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/cn';
import type { InstalledApp, Workspace, WorkspaceApp } from '@/lib/types';

const workspaces: Workspace[] = [
  {
    id: 'product-design',
    name: '产品设计工作区',
    appCount: 5,
    updatedAt: '今天 10:30',
    archived: false,
    color: '#6d5dfc',
  },
  {
    id: 'paper-writing',
    name: '论文写作',
    appCount: 4,
    updatedAt: '昨天 16:20',
    archived: false,
    color: '#2f80ed',
  },
  {
    id: 'data-analysis',
    name: '数据分析',
    appCount: 4,
    updatedAt: '昨天 14:08',
    archived: false,
    color: '#ff6b1a',
  },
];

const installedApps: InstalledApp[] = [
  { id: 'browser', name: '浏览器', source: 'startMenu', launchKind: 'shortcut', alreadyInWorkspace: true },
  { id: 'docs', name: '文档', source: 'startMenu', launchKind: 'shortcut', alreadyInWorkspace: true },
  { id: 'terminal', name: '终端', source: 'startMenu', launchKind: 'shortcut', alreadyInWorkspace: true },
  { id: 'design', name: '设计工具', source: 'manualPath', launchKind: 'exe', alreadyInWorkspace: true },
  { id: 'chat', name: '聊天', source: 'startMenu', launchKind: 'shortcut', alreadyInWorkspace: false },
  { id: 'files', name: '文件管理器', source: 'command', launchKind: 'folder', alreadyInWorkspace: false },
];

const workspaceApps: WorkspaceApp[] = [
  {
    id: 'docs-card',
    workspaceId: 'product-design',
    installedAppId: 'docs',
    name: '文档',
    alias: '竞品整理',
    status: 'running',
    windowTitle: '竞品需求总结',
  },
  {
    id: 'design-card',
    workspaceId: 'product-design',
    installedAppId: 'design',
    name: '设计工具',
    alias: '首页原型',
    status: 'running',
    windowTitle: '首页布局与组件',
  },
  {
    id: 'terminal-card',
    workspaceId: 'product-design',
    installedAppId: 'terminal',
    name: '终端',
    alias: '前端开发',
    status: 'running',
    windowTitle: '本地开发服务',
  },
];

export function WorkspaceShell() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(workspaces[0].id);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0],
    [activeWorkspaceId],
  );

  return (
    <main
      className="grid min-h-screen grid-cols-[292px_minmax(520px,1fr)_390px] bg-background text-foreground max-[1180px]:grid-cols-[260px_minmax(0,1fr)] max-[820px]:grid-cols-1"
      data-testid="workspace-shell"
    >
      <aside
        className="flex flex-col border-r border-border bg-card px-4 py-[22px] max-[820px]:hidden"
        data-testid="workspace-sidebar"
      >
        <div className="mb-7 flex items-center gap-3.5 font-bold">
          <div className="grid size-[34px] place-items-center rounded-lg bg-[#1f78ff] text-white">X</div>
          <span>Workspace Hub</span>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3.5">
          <h1 className="m-0 text-lg font-semibold">工作区列表</h1>
          <Button variant="outline" size="icon" className="size-9" aria-label="筛选工作区">
            <MoreHorizontal size={18} />
          </Button>
        </div>

        <Button className="h-auto w-full rounded-lg px-3.5 py-3" data-testid="create-workspace-button">
          <Plus size={18} />
          新建工作区
        </Button>

        <Separator className="my-4" />

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-2.5 pr-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-[10px] border border-[#e7ebf3] bg-card p-3.5 text-left',
                  workspace.id === activeWorkspaceId && 'border-primary bg-[#f3f7ff]',
                )}
                data-testid={`workspace-list-item-${workspace.id}`}
                onClick={() => setActiveWorkspaceId(workspace.id)}
              >
                <span
                  className="grid size-10 place-items-center rounded-[10px] text-white"
                  style={{ backgroundColor: workspace.color }}
                >
                  <LayoutGrid size={18} />
                </span>
                <span className="grid gap-1.5">
                  <strong>{workspace.name}</strong>
                  <small className="text-muted-foreground">
                    {workspace.appCount} 个软件 · {workspace.updatedAt}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <section className="flex flex-col gap-[18px] bg-card p-6">
        <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-border pb-[18px]">
          <div>
            <h2 className="m-0 text-lg font-semibold" data-testid="current-workspace-title">
              {activeWorkspace.name}
            </h2>
            <span className="text-sm text-muted-foreground" data-testid="save-status">
              已保存 · 最近保存 10:30
            </span>
          </div>
          <Label
            htmlFor="workspace-search-input"
            className="flex min-w-[260px] flex-1 items-center gap-2.5 rounded-lg border border-input bg-card px-3.5 py-2.5 font-normal"
          >
            <Search size={18} className="text-muted-foreground" />
            <Input
              id="workspace-search-input"
              data-testid="workspace-search-input"
              placeholder="搜索工作区内内容"
              className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
            />
          </Label>
          <Button
            className="h-auto rounded-lg px-3.5 py-2.5"
            data-testid="add-app-button"
            onClick={() => setAddAppOpen(true)}
          >
            <Plus size={18} />
            添加软件
          </Button>
          <Button variant="secondary" className="h-auto rounded-lg border border-input px-3.5 py-2.5">
            <Settings size={18} />
            工作区设置
          </Button>
        </header>

        <nav className="flex gap-3">
          {workspaceApps.map((app) => (
            <Button
              key={app.id}
              variant="secondary"
              className="h-auto rounded-lg border border-input bg-[#f9fbfe] px-4 py-2.5"
              data-testid={`workspace-app-tab-${app.id}`}
            >
              {app.name}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="icon"
            className="rounded-lg border border-input bg-[#f9fbfe]"
            aria-label="添加标签"
          >
            <Plus size={18} />
          </Button>
        </nav>

        <section className="grid min-h-[260px] grid-cols-[1fr_280px] gap-6 rounded-[10px] border border-border bg-linear-to-br from-[#f8fbff] to-white p-7 max-[820px]:grid-cols-1">
          <div>
            <p className="mb-4 font-bold text-primary">工作区概览</p>
            <h3 className="mb-3 text-[28px] leading-tight font-semibold">产品设计参考与执行状态</h3>
            <p className="m-0 text-muted-foreground">
              这里展示当前工作区的最近截图、软件快捷入口和状态摘要；点击软件后切换到外部真实窗口。
            </p>
          </div>
          <div className="grid place-items-center rounded-lg border border-[#dfe7f5] bg-card text-muted-foreground">
            最近窗口截图占位
          </div>
        </section>

        <section className="grid grid-cols-3 gap-3 max-[820px]:grid-cols-1">
          {workspaceApps.map((app) => (
            <article
              className="flex min-h-[112px] flex-col justify-between rounded-[10px] border border-border bg-card p-4"
              key={app.id}
              data-testid={`workspace-app-card-${app.id}`}
            >
              <div className="grid gap-1">
                <strong>
                  {app.name} - {app.alias}
                </strong>
                <span className="text-sm text-muted-foreground">{app.windowTitle}</span>
              </div>
              <Button variant="ghost" className="h-auto w-fit rounded-lg bg-accent px-2.5 py-2 text-accent-foreground">
                切换窗口
              </Button>
            </article>
          ))}
        </section>
      </section>

      <aside
        className="flex flex-col border-l border-border bg-card p-6 max-[1180px]:hidden"
        data-testid="whiteboard-panel"
      >
        <header className="flex items-center justify-between gap-3.5">
          <h2 className="m-0 text-lg font-semibold">白板 / 操作记录</h2>
          <Button variant="outline" size="icon" className="size-9" aria-label="白板更多操作">
            <MoreHorizontal size={18} />
          </Button>
        </header>

        <section className="mt-6 flex gap-3">
          <article className="grid min-h-[150px] flex-1 gap-2.5 rounded-lg bg-[#ffe9a8] p-[18px] shadow-[0_12px_28px_rgb(23_32_51/0.1)]">
            <strong>工作区：产品设计</strong>
            <span>目标：完成官网首页设计方案</span>
            <span>时间：2026-06-07</span>
          </article>
          <article className="grid min-h-[150px] flex-1 gap-2.5 rounded-lg bg-[#c9ecff] p-[18px] shadow-[0_12px_28px_rgb(23_32_51/0.1)]">
            <strong>待办事项</strong>
            <label className="flex items-center gap-2">
              <input type="checkbox" /> 完善竞品细节
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" /> 与开发确认交互
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" defaultChecked /> 确定设计规范
            </label>
          </article>
        </section>

        <section className="mt-7">
          <h3 className="mb-2 text-base font-semibold">操作记录</h3>
          {['查看竞品页面', '整理需求总结', '绘制首页原型', '运行预览环境'].map((item, index) => (
            <div className="grid grid-cols-[56px_1fr] gap-3 border-l-2 border-[#d8e5ff] py-2.5" key={item}>
              <time className="text-[#526078]">{['10:30', '10:05', '09:40', '09:15'][index]}</time>
              <span>{item}</span>
            </div>
          ))}
        </section>
      </aside>

      <Dialog open={addAppOpen} onOpenChange={setAddAppOpen}>
        <DialogContent
          data-testid="add-app-dialog"
          className="top-20 left-1/2 w-[360px] max-w-[360px] translate-x-[-50%] translate-y-0 gap-0 rounded-[10px] border-[#e0e6f0] p-5"
        >
          <DialogHeader className="mb-3.5 text-left">
            <DialogTitle>添加软件到工作区</DialogTitle>
            <DialogDescription>点击软件即可打开并加入当前工作区</DialogDescription>
          </DialogHeader>
          <Input
            data-testid="add-app-search-input"
            placeholder="搜索软件名称"
            className="mb-3.5 h-11 rounded-lg"
          />
          <ScrollArea className="max-h-72">
            <div className="grid gap-2 pr-2">
              {installedApps.map((app) => (
                <button
                  className="flex justify-between rounded-lg bg-[#f8fbff] p-3 text-left"
                  key={app.id}
                  type="button"
                  data-testid={`installed-app-result-${app.id}`}
                >
                  <span>{app.name}</span>
                  <small className="text-muted-foreground">
                    {app.alreadyInWorkspace ? '已在当前工作区' : '添加并打开'}
                  </small>
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </main>
  );
}
