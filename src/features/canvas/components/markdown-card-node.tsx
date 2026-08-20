import { useState } from 'react';
import { NodeResizer, type Node, type NodeProps } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MarkdownEditor } from '@/features/canvas/components/markdown-editor';
import type { CanvasFlowData } from '@/features/canvas/persist';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { cn } from '@/lib/cn';

export function MarkdownCardNode({ id, data, selected }: NodeProps<Node<CanvasFlowData>>) {
  const [editing, setEditing] = useState(false);
  const updateNodeFields = useCanvasStore((state) => state.updateNodeFields);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-[10px] border border-border bg-[#fffef6] shadow-sm',
        selected && 'ring-2 ring-ring',
      )}
      style={data.color ? { background: data.color } : undefined}
      data-testid={`canvas-markdown-node-${id}`}
    >
      <NodeResizer minWidth={180} minHeight={120} isVisible={selected} />
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
        <span className="truncate text-xs font-medium text-muted-foreground">{data.title ?? 'Markdown'}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="nodrag rounded px-1.5 py-0.5 text-xs text-primary hover:bg-accent"
            data-testid={`markdown-toggle-${id}`}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? '预览' : '编辑'}
          </button>
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
      </div>
      <div className="h-[calc(100%-34px)] overflow-auto p-2">
        {editing ? (
          <MarkdownEditor
            value={data.contentMarkdown ?? ''}
            onChange={(contentMarkdown) => updateNodeFields(id, { contentMarkdown })}
            onEscape={() => setEditing(false)}
          />
        ) : (
          <div
            className="canvas-markdown-preview h-full"
            data-testid={`markdown-preview-${id}`}
            onDoubleClick={() => setEditing(true)}
          >
            {data.contentMarkdown?.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.contentMarkdown}</ReactMarkdown>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">双击编辑 Markdown</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
