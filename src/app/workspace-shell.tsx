import { Plus, Search, Settings, MoreHorizontal, LayoutGrid } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { InstalledApp, Workspace, WorkspaceApp } from '../lib/types';

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
    <main className="workspace-shell" data-testid="workspace-shell">
      <aside className="workspace-sidebar" data-testid="workspace-sidebar">
        <div className="brand">
          <div className="brand-mark">X</div>
          <span>Workspace Hub</span>
        </div>
        <div className="sidebar-header">
          <h1>工作区列表</h1>
          <button className="icon-button" aria-label="筛选工作区">
            <MoreHorizontal size={18} />
          </button>
        </div>
        <button className="primary-button" data-testid="create-workspace-button">
          <Plus size={18} />
          新建工作区
        </button>
        <div className="workspace-list">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              className={`workspace-item ${workspace.id === activeWorkspaceId ? 'active' : ''}`}
              data-testid={`workspace-list-item-${workspace.id}`}
              onClick={() => setActiveWorkspaceId(workspace.id)}
            >
              <span className="workspace-icon" style={{ backgroundColor: workspace.color }}>
                <LayoutGrid size={18} />
              </span>
              <span className="workspace-copy">
                <strong>{workspace.name}</strong>
                <small>
                  {workspace.appCount} 个软件 · {workspace.updatedAt}
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div>
            <h2 data-testid="current-workspace-title">{activeWorkspace.name}</h2>
            <span className="save-status" data-testid="save-status">
              已保存 · 最近保存 10:30
            </span>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input data-testid="workspace-search-input" placeholder="搜索工作区内内容" />
          </label>
          <button className="primary-button" data-testid="add-app-button" onClick={() => setAddAppOpen(true)}>
            <Plus size={18} />
            添加软件
          </button>
          <button className="secondary-button">
            <Settings size={18} />
            工作区设置
          </button>
        </header>

        <nav className="app-tabs">
          {workspaceApps.map((app) => (
            <button key={app.id} data-testid={`workspace-app-tab-${app.id}`}>
              {app.name}
            </button>
          ))}
          <button aria-label="添加标签">
            <Plus size={18} />
          </button>
        </nav>

        <section className="workspace-overview">
          <div>
            <p className="eyebrow">工作区概览</p>
            <h3>产品设计参考与执行状态</h3>
            <p>这里展示当前工作区的最近截图、软件快捷入口和状态摘要；点击软件后切换到外部真实窗口。</p>
          </div>
          <div className="preview-frame">最近窗口截图占位</div>
        </section>

        <section className="app-card-grid">
          {workspaceApps.map((app) => (
            <article className="app-card" key={app.id} data-testid={`workspace-app-card-${app.id}`}>
              <div>
                <strong>
                  {app.name} - {app.alias}
                </strong>
                <span>{app.windowTitle}</span>
              </div>
              <button className="text-button">切换窗口</button>
            </article>
          ))}
        </section>
      </section>

      <aside className="whiteboard-panel" data-testid="whiteboard-panel">
        <header>
          <h2>白板 / 操作记录</h2>
          <button className="icon-button" aria-label="白板更多操作">
            <MoreHorizontal size={18} />
          </button>
        </header>
        <section className="sticky-board">
          <article className="note-card yellow">
            <strong>工作区：产品设计</strong>
            <span>目标：完成官网首页设计方案</span>
            <span>时间：2026-06-07</span>
          </article>
          <article className="note-card blue">
            <strong>待办事项</strong>
            <label><input type="checkbox" /> 完善竞品细节</label>
            <label><input type="checkbox" /> 与开发确认交互</label>
            <label><input type="checkbox" defaultChecked /> 确定设计规范</label>
          </article>
        </section>
        <section className="timeline">
          <h3>操作记录</h3>
          {['查看竞品页面', '整理需求总结', '绘制首页原型', '运行预览环境'].map((item, index) => (
            <div className="timeline-item" key={item}>
              <time>{['10:30', '10:05', '09:40', '09:15'][index]}</time>
              <span>{item}</span>
            </div>
          ))}
        </section>
      </aside>

      {addAppOpen ? (
        <div className="dialog-backdrop" data-testid="add-app-dialog">
          <section className="add-app-dialog">
            <header>
              <div>
                <h2>添加软件到工作区</h2>
                <p>点击软件即可打开并加入当前工作区</p>
              </div>
              <button className="icon-button" onClick={() => setAddAppOpen(false)} aria-label="关闭添加软件">
                ×
              </button>
            </header>
            <input className="dialog-search" data-testid="add-app-search-input" placeholder="搜索软件名称" />
            <div className="installed-app-list">
              {installedApps.map((app) => (
                <button className="installed-app-result" key={app.id} data-testid={`installed-app-result-${app.id}`}>
                  <span>{app.name}</span>
                  <small>{app.alreadyInWorkspace ? '已在当前工作区' : '添加并打开'}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

