import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

type WorkspaceOverviewProps = {
  loading?: boolean;
  onAddApp: () => void;
};

export function WorkspaceOverview({ loading = false, onAddApp }: WorkspaceOverviewProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[10px] border border-border bg-card p-7" data-testid="workspace-overview">
      {loading ? (
        <p className="m-0 text-muted-foreground">正在加载软件列表</p>
      ) : (
        <>
          <h3 className="mb-3 text-[28px] leading-tight font-semibold">还没有软件</h3>
          <p className="mb-4 text-muted-foreground">添加软件后，这里会显示快捷入口。</p>
          <Button className="h-auto rounded-lg px-3.5 py-2.5" data-testid="empty-workspace-add-app-button" onClick={onAddApp}>
            <Plus size={18} />
            添加软件
          </Button>
        </>
      )}
    </section>
  );
}
