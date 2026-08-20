import { useCallback, type PointerEvent } from 'react';

import { cn } from '@/lib/cn';

type PanelResizeHandleProps = {
  side: 'left' | 'right';
  label: string;
  testId: string;
  hiddenClassName?: string;
  onBegin: (clientX: number) => void;
  onMove: (clientX: number) => void;
  onEnd: () => void;
};

export function PanelResizeHandle({
  side,
  label,
  testId,
  hiddenClassName,
  onBegin,
  onMove,
  onEnd,
}: PanelResizeHandleProps) {
  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onBegin(event.clientX);
    },
    [onBegin],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.buttons === 0) {
        return;
      }
      onMove(event.clientX);
    },
    [onMove],
  );

  const handlePointerUp = useCallback(() => {
    onEnd();
  }, [onEnd]);

  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      data-side={side}
      className={cn(
        'relative z-10 w-1.5 shrink-0 cursor-col-resize border-0 bg-transparent p-0',
        'hover:bg-primary/25 focus-visible:bg-primary/30',
        'after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[""]',
        hiddenClassName,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
