import { Button } from '@/components/ui/button';
import { useQuickSwitchStore } from '@/features/quick-switch/store/quick-switch-store';

export function QuickSwitchOpenButton() {
  const openPanel = useQuickSwitchStore((state) => state.openPanel);

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-auto rounded-lg border border-input px-3.5 py-2.5"
      data-testid="quick-switch-open-button"
      onClick={openPanel}
    >
      快速切换
    </Button>
  );
}
