import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Workspace } from '@/lib/types';

type WorkspaceOverviewProps = {
  workspace: Workspace;
  hasApps: boolean;
  loading?: boolean;
  onAddApp: () => void;
};

export function WorkspaceOverview({ workspace, hasApps, loading = false, onAddApp }: WorkspaceOverviewProps) {
  return (
    <section
      className="grid min-h-[260px] grid-cols-[1fr_280px] gap-6 rounded-[10px] border border-border bg-linear-to-br from-[#f8fbff] to-white p-7 max-[820px]:grid-cols-1"
      data-testid="workspace-overview"
    >
      <div>
        <p className="mb-4 font-bold text-primary">工作区概览</p>
        {loading ? (
          <>
            <h3 className="mb-3 text-[28px] leading-tight font-semibold">正在加载软件列表</h3>
            <p className="m-0 text-muted-foreground">正在读取当前工作区的软件和窗口预览。</p>
          </>
        ) : hasApps ? (
          <>
            <h3 className="mb-3 text-[28px] leading-tight font-semibold">{workspace.name}</h3>
            <p className="m-0 text-muted-foreground">
              这里展示当前工作区的最近截图、软件快捷入口和状态摘要。点击软件后会请求切换到外部真实窗口，而不是在中间区域操作外部软件。
            </p>
          </>
        ) : (
          <>
            <h3 className="mb-3 text-[28px] leading-tight font-semibold">还没有软件</h3>
            <p className="mb-4 text-muted-foreground">
              添加软件后，这里会显示概览和窗口预览。点击软件只会启动或聚焦外部窗口。
            </p>
            <Button className="h-auto rounded-lg px-3.5 py-2.5" data-testid="empty-workspace-add-app-button" onClick={onAddApp}>
              <Plus size={18} />
              添加软件
            </Button>
          </>
        )}
      </div>
      <div
        className="grid place-items-center rounded-lg border border-[#dfe7f5] bg-card text-muted-foreground"
        data-testid="window-preview-placeholder"
      >
        窗口预览
      </div>
    </section>
  );
}
