import { FolderPlus, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AppSearchResults } from '@/features/apps/components/app-search-results';
import type { InstalledApp } from '@/lib/types';

type AddAppDialogProps = {
  open: boolean;
  query: string;
  apps: InstalledApp[];
  loading?: boolean;
  refreshing?: boolean;
  launchingAppIds?: string[];
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (app: InstalledApp) => void;
  onRefresh: () => void;
  onAddManual: () => void;
};

export function AddAppDialog({
  open,
  query,
  apps,
  loading = false,
  refreshing = false,
  launchingAppIds = [],
  errorMessage,
  onOpenChange,
  onQueryChange,
  onSelect,
  onRefresh,
  onAddManual,
}: AddAppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="add-app-dialog"
        className="top-20 left-1/2 w-[360px] max-w-[360px] translate-x-[-50%] translate-y-0 gap-0 rounded-[10px] border-[#e0e6f0] p-5"
      >
        <DialogHeader className="mb-3.5 text-left">
          <DialogTitle>添加软件到工作区</DialogTitle>
          <DialogDescription>点击软件即可启动并加入当前工作区</DialogDescription>
        </DialogHeader>
        <Input
          data-testid="add-app-search-input"
          placeholder="搜索软件名称"
          className="mb-3.5 h-11 rounded-lg"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <ScrollArea className="max-h-72">
          {loading ? (
            <p className="py-6 text-sm text-muted-foreground">正在加载软件列表…</p>
          ) : (
            <AppSearchResults
              apps={apps}
              query={query}
              launchingAppIds={launchingAppIds}
              onSelect={onSelect}
            />
          )}
        </ScrollArea>
        {errorMessage ? <p className="mt-3 text-sm text-destructive">{errorMessage}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto rounded-lg px-3 py-2"
            data-testid="refresh-installed-apps-button"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw size={16} />
            {refreshing ? '刷新中…' : '刷新软件列表'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-auto rounded-lg px-3 py-2"
            data-testid="add-manual-app-button"
            onClick={onAddManual}
          >
            <FolderPlus size={16} />
            手动添加 exe / lnk
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
