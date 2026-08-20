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
import type { AppSettings, ShortcutRegistrationStatus } from '@/lib/types';

const STATUS_COPY: Record<ShortcutRegistrationStatus, string> = {
  registered: '已注册',
  conflict: '快捷键冲突',
  denied: '系统拒绝注册',
  unregistered: '未注册',
};

type SettingsDialogProps = {
  open: boolean;
  settings?: AppSettings | null;
  submitting?: boolean;
  errorMessage?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (quickSwitchShortcut: string) => Promise<void> | void;
};

function statusLabel(status?: string | null) {
  if (status && status in STATUS_COPY) {
    return STATUS_COPY[status as ShortcutRegistrationStatus];
  }
  return STATUS_COPY.unregistered;
}

export function SettingsDialog({
  open,
  settings,
  submitting = false,
  errorMessage,
  onOpenChange,
  onSubmit,
}: SettingsDialogProps) {
  const [shortcut, setShortcut] = useState(settings?.quickSwitchShortcut ?? 'Control+KeyO');

  useEffect(() => {
    if (open) {
      setShortcut(settings?.quickSwitchShortcut ?? 'Control+KeyO');
    }
  }, [open, settings?.quickSwitchShortcut]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) {
      return;
    }
    await onSubmit(shortcut.trim());
  }

  const lastError = errorMessage?.trim() || settings?.lastError?.trim() || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="settings-dialog" className="sm:max-w-md">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>全局设置</DialogTitle>
            <DialogDescription>配置快速切换快捷键。默认候选是 Ctrl+O，可以改成其他组合。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="settings-shortcut-input">快速切换快捷键</Label>
            <Input
              id="settings-shortcut-input"
              data-testid="settings-shortcut-input"
              value={shortcut}
              placeholder="Control+KeyO"
              onChange={(event) => setShortcut(event.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground" data-testid="settings-registration-status">
            注册状态：{statusLabel(settings?.registrationStatus)}
          </p>
          <p className="text-sm text-muted-foreground" data-testid="settings-macos-accessibility-hint">
            在 macOS 上，把窗口切到前面需要辅助功能权限。到系统设置 → 隐私与安全性 → 辅助功能里勾选本应用。没勾选时不会假装切换成功。
          </p>
          {lastError ? (
            <p className="text-sm text-destructive" data-testid="settings-last-error">
              {lastError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" data-testid="settings-save-button" disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
