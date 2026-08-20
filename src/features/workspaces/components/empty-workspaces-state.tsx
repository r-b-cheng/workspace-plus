import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';

type EmptyWorkspacesStateProps = {
  onCreate: () => void;
};

export function EmptyWorkspacesState({ onCreate }: EmptyWorkspacesStateProps) {
  return (
    <section
      className="flex min-h-[320px] flex-1 flex-col items-start justify-center gap-4 rounded-[10px] border border-dashed border-border bg-linear-to-br from-[#f8fbff] to-white p-8"
      data-testid="empty-workspaces-state"
    >
      <p className="font-bold text-primary">还没有工作区</p>
      <h2 className="m-0 text-[28px] leading-tight font-semibold">先创建一个工作区</h2>
      <p className="m-0 max-w-xl text-muted-foreground">
        工作区用来分组常用软件和白板记录。创建后即可添加软件、查看概览和窗口预览。
      </p>
      <Button
        className="h-auto rounded-lg px-3.5 py-2.5"
        data-testid="empty-workspaces-create-button"
        onClick={onCreate}
      >
        <Plus size={18} />
        新建工作区
      </Button>
    </section>
  );
}
