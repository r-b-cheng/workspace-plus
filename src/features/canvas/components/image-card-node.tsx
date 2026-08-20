import { ImageOff } from 'lucide-react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';

import type { CanvasFlowData } from '@/features/canvas/persist';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { cn } from '@/lib/cn';

export function ImageCardNode({ id, data, selected }: NodeProps<Node<CanvasFlowData>>) {
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const missing = data.imageMissing || !data.imageUrl;

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-[10px] border border-border bg-card shadow-sm',
        selected && 'ring-2 ring-ring',
      )}
      data-testid={`canvas-image-node-${id}`}
    >
      <NodeResizer minWidth={120} minHeight={90} isVisible={selected} />
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
        <span className="truncate text-xs font-medium text-muted-foreground">{data.title ?? '图片'}</span>
        {selected ? (
          <button
            type="button"
            className="nodrag rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
            data-testid={`delete-canvas-node-${id}`}
            onClick={() => deleteNodes([id])}
          >
            删除
          </button>
        ) : null}
      </div>
      <div className="grid h-[calc(100%-34px)] place-items-center overflow-hidden bg-[#f8fbff]">
        {missing ? (
          <div
            className="flex flex-col items-center gap-1 px-3 text-center text-xs text-muted-foreground"
            data-testid={`image-missing-${id}`}
          >
            <ImageOff size={18} />
            图片缺失或无法加载
          </div>
        ) : (
          <img src={data.imageUrl} alt={data.title ?? '白板图片'} className="pointer-events-none max-h-full max-w-full object-contain" />
        )}
      </div>
    </div>
  );
}
