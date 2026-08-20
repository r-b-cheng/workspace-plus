import { Plus, Search, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDisplayTime } from '@/lib/datetime';
import type { CanvasSaveStatus, Workspace } from '@/lib/types';

type CurrentWorkspaceHeaderProps = {
  workspace: Workspace;
  contentQuery: string;
  onContentQueryChange: (query: string) => void;
  onAddApp: () => void;
  onSettings: () => void;
  saveStatus?: CanvasSaveStatus;
  lastSavedAt?: string | null;
  onRetrySave?: () => void;
};

function saveStatusLabel(status: CanvasSaveStatus, lastSavedAt?: string | null) {
  switch (status) {
    case 'saving':
      return '保存中…';
    case 'saved':
      return lastSavedAt ? `已保存 · ${formatDisplayTime(lastSavedAt)}` : '已保存';
    case 'save-failed':
      return '保存失败';
    default:
      return '白板就绪';
  }
}

export function CurrentWorkspaceHeader({
  workspace,
  contentQuery,
  onContentQueryChange,
  onAddApp,
  onSettings,
  saveStatus = 'idle',
  lastSavedAt,
  onRetrySave,
}: CurrentWorkspaceHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3.5 border-b border-border pb-[18px]">
      <div>
        <h2 className="m-0 text-lg font-semibold" data-testid="current-workspace-title">
          {workspace.name}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground" data-testid="save-status" data-save-state={saveStatus}>
            {saveStatusLabel(saveStatus, lastSavedAt)}
          </span>
          {saveStatus === 'save-failed' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              data-testid="retry-save-button"
              onClick={onRetrySave}
            >
              重试
            </Button>
          ) : null}
        </div>
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
          value={contentQuery}
          onChange={(event) => onContentQueryChange(event.target.value)}
          className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
        />
      </Label>
      <Button className="h-auto rounded-lg px-3.5 py-2.5" data-testid="add-app-button" onClick={onAddApp}>
        <Plus size={18} />
        添加软件
      </Button>
      <Button
        variant="secondary"
        className="h-auto rounded-lg border border-input px-3.5 py-2.5"
        data-testid="workspace-settings-button"
        onClick={onSettings}
      >
        <Settings size={18} />
        工作区设置
      </Button>
    </header>
  );
}
