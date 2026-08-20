import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { DEFAULT_WORKSPACE_COLOR, WORKSPACE_COLOR_PALETTE } from '@/lib/workspace-colors';

export type CreateWorkspaceValues = {
  name: string;
  color: string;
};

type CreateWorkspaceDialogProps = {
  open: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateWorkspaceValues) => Promise<void> | void;
};

export function CreateWorkspaceDialog({
  open,
  submitting = false,
  errorMessage,
  onOpenChange,
  onSubmit,
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_WORKSPACE_COLOR);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setColor(DEFAULT_WORKSPACE_COLOR);
      setNameError(null);
    }
  }, [open]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmedName) {
      setNameError('请输入工作区名称');
      return;
    }
    setNameError(null);
    await onSubmit({ name: trimmedName, color });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="create-workspace-dialog" className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>新建工作区</DialogTitle>
            <DialogDescription>先填写名称即可创建。颜色可选，用来在侧栏区分工作区。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="create-workspace-name-input">工作区名称</Label>
            <Input
              id="create-workspace-name-input"
              data-testid="create-workspace-name-input"
              value={name}
              maxLength={120}
              placeholder="例如：论文写作"
              onChange={(event) => {
                setName(event.target.value);
                if (nameError && event.target.value.trim()) {
                  setNameError(null);
                }
              }}
            />
            {nameError ? (
              <p className="text-sm text-destructive" data-testid="create-workspace-name-error">
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>颜色</Label>
            <div className="flex flex-wrap gap-2">
              {WORKSPACE_COLOR_PALETTE.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`选择颜色 ${item}`}
                  data-testid={`create-workspace-color-${item}`}
                  className={cn(
                    'size-8 rounded-full border-2 border-transparent',
                    color === item && 'border-foreground',
                  )}
                  style={{ backgroundColor: item }}
                  onClick={() => setColor(item)}
                />
              ))}
            </div>
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" data-testid="create-workspace-submit" disabled={!canSubmit}>
              {submitting ? '创建中…' : '创建工作区'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
