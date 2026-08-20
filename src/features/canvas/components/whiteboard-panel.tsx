import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
} from '@xyflow/react';
import { FilePlus2, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

import { ImageCardNode } from '@/features/canvas/components/image-card-node';
import { MarkdownCardNode } from '@/features/canvas/components/markdown-card-node';
import { fromPersistedCanvasEdge, fromPersistedCanvasNode, type CanvasFlowData } from '@/features/canvas/persist';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { Button } from '@/components/ui/button';

const nodeTypes = {
  markdown: MarkdownCardNode,
  image: ImageCardNode,
};

type WhiteboardPanelProps = {
  workspaceId: string | null;
  workspaceName?: string;
};

export function WhiteboardPanel({ workspaceId, workspaceName }: WhiteboardPanelProps) {
  const createMarkdownCard = useCanvasStore((state) => state.createMarkdownCard);
  const canvasError = useCanvasStore((state) => state.canvasError);
  const canvasLoading = useCanvasStore((state) => state.canvasLoading);
  const canvasReady = Boolean(workspaceId) && !canvasLoading;

  return (
    <aside
      className="sticky top-0 flex h-screen min-h-0 flex-col border-l border-border bg-card max-[1180px]:hidden"
      data-testid="whiteboard-panel"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="m-0 text-lg font-semibold">白板</h2>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            className="h-auto rounded-lg px-3 py-2"
            data-testid="create-markdown-card-button"
            disabled={!canvasReady}
            onClick={() => createMarkdownCard()}
          >
            <FilePlus2 size={16} />
            新建 Markdown
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9"
            aria-label="白板已打开"
            data-testid="open-whiteboard-button"
            disabled={!canvasReady}
          >
            <MoreHorizontal size={18} />
          </Button>
        </div>
      </header>

      {canvasError ? (
        <p className="shrink-0 bg-destructive/10 px-3 py-2 text-sm text-destructive">{canvasError.message}</p>
      ) : null}

      {workspaceId ? (
        <ReactFlowProvider>
          <WorkspaceCanvas key={workspaceId} workspaceId={workspaceId} />
        </ReactFlowProvider>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-2 p-6 text-sm text-muted-foreground">
          <p className="m-0 font-medium text-foreground">还没有工作区</p>
          <p className="m-0">
            {workspaceName
              ? `「${workspaceName}」的白板会显示在这里。`
              : '创建工作区后，这里会作为当前工作区的记录空间。不会在中间区域嵌入外部软件。'}
          </p>
        </div>
      )}
    </aside>
  );
}

function WorkspaceCanvas({ workspaceId }: { workspaceId: string }) {
  const storeWorkspaceId = useCanvasStore((state) => state.workspaceId);
  const productNodes = useCanvasStore((state) => state.nodes);
  const productEdges = useCanvasStore((state) => state.edges);
  const assetUrls = useCanvasStore((state) => state.assetUrls);
  const missingAssets = useCanvasStore((state) => state.missingAssets);
  const canvasLoading = useCanvasStore((state) => state.canvasLoading);
  const applyFlowSnapshot = useCanvasStore((state) => state.applyFlowSnapshot);
  const applyFlowEdges = useCanvasStore((state) => state.applyFlowEdges);
  const addImageFromFile = useCanvasStore((state) => state.addImageFromFile);
  const { screenToFlowPosition } = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);

  const mappedNodes = useMemo(
    () =>
      storeWorkspaceId === workspaceId
        ? productNodes.map((node) => {
            const flow = fromPersistedCanvasNode(node);
            return {
              ...flow,
              data: {
                ...flow.data,
                imageUrl: node.assetId ? assetUrls[node.assetId] : undefined,
                imageMissing: Boolean(node.assetId && missingAssets[node.assetId]),
              },
            };
          })
        : [],
    [assetUrls, missingAssets, productNodes, storeWorkspaceId, workspaceId],
  );
  const mappedEdges = useMemo(
    () => (storeWorkspaceId === workspaceId ? productEdges.map(fromPersistedCanvasEdge) : []),
    [productEdges, storeWorkspaceId, workspaceId],
  );

  const [nodes, setNodes] = useState<FlowNode<CanvasFlowData>[]>(mappedNodes);
  const [edges, setEdges] = useState<Edge[]>(mappedEdges);

  useEffect(() => {
    setNodes(mappedNodes);
  }, [mappedNodes]);

  useEffect(() => {
    setEdges(mappedEdges);
  }, [mappedEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode<CanvasFlowData>>[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current);
        const shouldPersist = changes.some(
          (change) =>
            change.type === 'remove' ||
            (change.type === 'position' && change.dragging === false) ||
            (change.type === 'dimensions' && 'resizing' in change && change.resizing === false),
        );
        if (shouldPersist) {
          applyFlowSnapshot(next);
        }
        return next;
      });
    },
    [applyFlowSnapshot],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current);
        if (changes.some((change) => change.type === 'remove')) {
          applyFlowEdges(next);
        }
        return next;
      });
    },
    [applyFlowEdges],
  );

  const addImages = useCallback(
    (files: File[], position?: { x: number; y: number }) => {
      for (const file of files) {
        void addImageFromFile(file, file.name ? 'drag_drop' : 'clipboard', position);
      }
    },
    [addImageFromFile],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (useCanvasStore.getState().canvasLoading) {
        return;
      }
      const files = [...event.dataTransfer.files].filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) {
        return;
      }
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addImages(files, position);
    },
    [addImages, screenToFlowPosition],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (useCanvasStore.getState().canvasLoading) {
        return;
      }
      const panel = paneRef.current?.closest('[data-testid="whiteboard-panel"]');
      if (!panel || !event.target || !panel.contains(event.target as globalThis.Node)) {
        return;
      }
      const files = clipboardImageFiles(event);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      const rect = paneRef.current?.getBoundingClientRect();
      const position = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + 96 })
        : { x: 96, y: 96 };
      for (const file of files) {
        void addImageFromFile(file, 'clipboard', position);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImageFromFile, screenToFlowPosition]);

  return (
    <div ref={paneRef} className="workspace-canvas relative min-h-0 flex-1" data-testid="workspace-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodesDraggable={!canvasLoading}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.35}
        maxZoom={2}
        fitView={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls />
      </ReactFlow>
      {!canvasLoading && nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-[10px] border border-dashed border-border bg-card/90 p-4 text-sm text-muted-foreground">
          空画布。新建 Markdown 卡片，或粘贴、拖入图片。内容会按当前工作区自动保存。
        </div>
      ) : null}
    </div>
  );
}

function clipboardImageFiles(event: ClipboardEvent): File[] {
  const files: File[] = [];
  const items = event.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
  }
  if (files.length === 0 && event.clipboardData?.files) {
    for (const file of event.clipboardData.files) {
      if (file.type.startsWith('image/')) {
        files.push(file);
      }
    }
  }
  return files;
}
