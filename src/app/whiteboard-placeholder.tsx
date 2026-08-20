import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';

type WhiteboardPlaceholderProps = {
  workspaceName?: string;
};

export function WhiteboardPlaceholder({ workspaceName }: WhiteboardPlaceholderProps) {
  return (
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

      <section className="mt-6 rounded-[10px] border border-dashed border-border bg-[#f8fbff] p-5">
        <p className="mb-2 font-semibold">白板入口</p>
        <p className="mb-4 text-sm text-muted-foreground">
          {workspaceName
            ? `「${workspaceName}」的白板将在后续包接入。这里只保留入口，不会在中间区域嵌入外部软件。`
            : '创建工作区后，这里会作为白板和操作记录入口。'}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="h-auto rounded-lg px-3.5 py-2.5"
          data-testid="open-whiteboard-button"
          disabled
        >
          打开白板
        </Button>
      </section>
    </aside>
  );
}
