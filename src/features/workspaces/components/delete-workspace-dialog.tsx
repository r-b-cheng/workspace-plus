import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const DELETE_WORKSPACE_CONFIRM_COPY =
  '删除工作区只会删除本产品内的工作区数据，不卸载软件，也不关闭真实窗口。';

type DeleteWorkspaceDialogProps = {
  open: boolean;
  workspaceName?: string;
  submitting?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
};

export function DeleteWorkspaceDialog({
  open,
  workspaceName,
  submitting = false,
  errorMessage,
  onOpenChange,
  onConfirm,
}: DeleteWorkspaceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="delete-workspace-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>删除工作区</DialogTitle>
          <DialogDescription data-testid="delete-workspace-confirm-copy">
            {workspaceName ? `确定删除「${workspaceName}」吗？` : '确定删除这个工作区吗？'}
            {DELETE_WORKSPACE_CONFIRM_COPY}
          </DialogDescription>
        </DialogHeader>
        {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            data-testid="delete-workspace-cancel"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="delete-workspace-confirm"
            disabled={submitting}
            onClick={() => void onConfirm()}
          >
            {submitting ? '删除中…' : '删除工作区'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
