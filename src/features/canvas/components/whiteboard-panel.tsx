import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  getNodesBounds,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
} from '@xyflow/react';
import { ArrowUpRight, Circle, FilePlus2, Minus, MoreHorizontal, MousePointer2, Pencil, Square, Type } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { Button } from '@/components/ui/button';
import { DrawingLayer, type DrawingLayerHandle } from '@/features/canvas/components/drawing-layer';
import { ImageCardNode } from '@/features/canvas/components/image-card-node';
import { MarkdownCardNode } from '@/features/canvas/components/markdown-card-node';
import { installCanvasE2eHooks } from '@/features/canvas/e2e-hooks';
import { filesFromClipboardApi, filesFromClipboardData, isTypingTarget } from '@/features/canvas/clipboard-images';
import {
  canvasEdgeArrowMarker,
  DEFAULT_CANVAS_EDGE_TYPE,
  fromPersistedCanvasEdge,
  fromPersistedCanvasNode,
  isValidCanvasConnection,
  type CanvasFlowData,
} from '@/features/canvas/persist';
import { boundingBox, unionBoundingBoxes } from '@/features/canvas/scene-transform';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import { cn } from '@/lib/cn';
import type { CanvasDrawingTool } from '@/lib/types';

const DRAWING_TOOLS: { tool: CanvasDrawingTool; testId: string; label: string; icon: typeof Pencil }[] = [
  { tool: 'select', testId: 'canvas-tool-select', label: '选择', icon: MousePointer2 },
  { tool: 'pen', testId: 'canvas-tool-pen', label: '画笔', icon: Pencil },
  { tool: 'arrow', testId: 'canvas-tool-arrow', label: '箭头', icon: ArrowUpRight },
  { tool: 'line', testId: 'canvas-tool-line', label: '直线', icon: Minus },
  { tool: 'rect', testId: 'canvas-tool-rect', label: '矩形', icon: Square },
  { tool: 'ellipse', testId: 'canvas-tool-ellipse', label: '椭圆', icon: Circle },
  { tool: 'text', testId: 'canvas-tool-text', label: '字', icon: Type },
];

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
  const drawingTool = useCanvasStore((state) => state.drawingTool);
  const setDrawingTool = useCanvasStore((state) => state.setDrawingTool);
  const canvasReady = Boolean(workspaceId) && !canvasLoading;
  const canvasRef = useRef<WorkspaceCanvasHandle>(null);

  useEffect(() => installCanvasE2eHooks(), []);

  return (
    <aside
      className="flex h-full min-h-screen w-full min-w-0 flex-col border-l border-border bg-card"
      data-testid="whiteboard-panel"
      data-canvas-drawing-tool={drawingTool}
    >
      <header className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-lg font-semibold">白板</h2>
          <div className="flex min-w-0 items-center gap-1.5">
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
            <WhiteboardMoreMenu
              disabled={!canvasReady}
              onFitView={() => canvasRef.current?.fitContent()}
              onAddImages={(files) => canvasRef.current?.addImageFiles(files)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="canvas-drawing-tools">
          {DRAWING_TOOLS.map(({ tool, testId, label, icon: Icon }) => (
            <Button
              key={tool}
              type="button"
              variant={drawingTool === tool ? 'default' : 'outline'}
              size="icon"
              className={cn('size-9', drawingTool === tool && 'ring-2 ring-ring/40')}
              aria-label={label}
              aria-pressed={drawingTool === tool}
              data-testid={testId}
              disabled={!canvasReady}
              onClick={() => setDrawingTool(tool)}
            >
              <Icon size={16} />
            </Button>
          ))}
        </div>
      </header>

      {canvasError ? (
        <p className="shrink-0 bg-destructive/10 px-3 py-2 text-sm text-destructive">{canvasError.message}</p>
      ) : null}

      {workspaceId ? (
        <ReactFlowProvider key={workspaceId}>
          <WorkspaceCanvas ref={canvasRef} workspaceId={workspaceId} />
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

type WhiteboardMoreMenuProps = {
  disabled: boolean;
  onFitView: () => void;
  onAddImages: (files: File[]) => void;
};

function WhiteboardMoreMenu({ disabled, onFitView, onAddImages }: WhiteboardMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        aria-label="白板更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="whiteboard-more-button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="whiteboard-add-image-input"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])].filter((file) => file.type.startsWith('image/'));
          event.currentTarget.value = '';
          if (files.length > 0) {
            onAddImages(files);
          }
        }}
      />
      {open ? (
        <div
          className="absolute top-10 right-0 z-20 grid min-w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
          role="menu"
        >
          <button
            type="button"
            className="px-3 py-2 text-left text-sm hover:bg-accent"
            role="menuitem"
            data-testid="whiteboard-fit-view"
            onClick={() => {
              setOpen(false);
              onFitView();
            }}
          >
            适应画布
          </button>
          <button
            type="button"
            className="px-3 py-2 text-left text-sm hover:bg-accent"
            role="menuitem"
            data-testid="whiteboard-add-image"
            onClick={() => {
              setOpen(false);
              fileInputRef.current?.click();
            }}
          >
            添加图片
          </button>
        </div>
      ) : null}
    </div>
  );
}

type WorkspaceCanvasHandle = {
  fitContent: () => void;
  addImageFiles: (files: File[]) => void;
};

const WorkspaceCanvas = forwardRef<WorkspaceCanvasHandle, { workspaceId: string }>(
  function WorkspaceCanvas({ workspaceId }, ref) {
  const storeWorkspaceId = useCanvasStore((state) => state.workspaceId);
  const productNodes = useCanvasStore((state) => state.nodes);
  const productEdges = useCanvasStore((state) => state.edges);
  const assetUrls = useCanvasStore((state) => state.assetUrls);
  const missingAssets = useCanvasStore((state) => state.missingAssets);
  const canvasLoading = useCanvasStore((state) => state.canvasLoading);
  const applyFlowSnapshot = useCanvasStore((state) => state.applyFlowSnapshot);
  const applyFlowEdges = useCanvasStore((state) => state.applyFlowEdges);
  const addImageFromFile = useCanvasStore((state) => state.addImageFromFile);
  const scene = useCanvasStore((state) => state.scene);
  const drawingTool = useCanvasStore((state) => state.drawingTool);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useCanvasStore((state) => state.setSelectedElementIds);
  const { screenToFlowPosition, getNodes, fitBounds, setViewport } = useReactFlow();
  const paneRef = useRef<HTMLDivElement>(null);
  const drawingLayerRef = useRef<DrawingLayerHandle>(null);
  const drawing = drawingTool !== 'select';
  const blockCardDelete = drawing || selectedElementIds.length > 0;

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

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => isValidCanvasConnection(connection, edges),
    [edges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        if (!isValidCanvasConnection(connection, current)) {
          return current;
        }
        const next = addEdge(
          {
            ...connection,
            type: DEFAULT_CANVAS_EDGE_TYPE,
            markerEnd: canvasEdgeArrowMarker(),
          },
          current,
        );
        applyFlowEdges(next);
        return next;
      });
    },
    [applyFlowEdges],
  );

  const addImages = useCallback(
    (files: File[], position?: { x: number; y: number }, source: 'clipboard' | 'drag_drop' | 'manual_import' = 'drag_drop') => {
      files.forEach((file, index) => {
        const nextPosition = position
          ? { x: position.x + index * 24, y: position.y + index * 24 }
          : undefined;
        void addImageFromFile(file, source, nextPosition);
      });
    },
    [addImageFromFile],
  );

  const addImageFiles = useCallback(
    (files: File[]) => {
      const rect = paneRef.current?.getBoundingClientRect();
      const position = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 96, y: 96 };
      addImages(files, position, 'manual_import');
    },
    [addImages, screenToFlowPosition],
  );

  const fitContent = useCallback(() => {
    const nodeBoxes =
      getNodes().length > 0
        ? [getNodesBounds(getNodes())]
        : [];
    const drawingBoxes = useCanvasStore.getState().scene.elements.map(boundingBox);
    const bounds = unionBoundingBoxes([...nodeBoxes, ...drawingBoxes]);
    if (!bounds) {
      void setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 180 });
      return;
    }
    void fitBounds(bounds, { padding: 0.18, duration: 180 });
  }, [fitBounds, getNodes, setViewport]);

  useImperativeHandle(ref, () => ({ fitContent, addImageFiles }), [addImageFiles, fitContent]);

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
    const placeClipboardImages = (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      const rect = paneRef.current?.getBoundingClientRect();
      const position = rect
        ? screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : { x: 96, y: 96 };
      addImages(files, position, 'clipboard');
    };

    const onPaste = (event: ClipboardEvent) => {
      if (useCanvasStore.getState().canvasLoading || !useCanvasStore.getState().workspaceId) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      const files = filesFromClipboardData(event.clipboardData);
      if (files.length > 0) {
        event.preventDefault();
        placeClipboardImages(files);
        return;
      }
      void filesFromClipboardApi().then((fallback) => {
        if (useCanvasStore.getState().canvasLoading || !useCanvasStore.getState().workspaceId) {
          return;
        }
        placeClipboardImages(fallback);
      });
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addImages, screenToFlowPosition]);

  const onSelectDrawingElements = useCallback(
    (ids: string[]) => {
      setSelectedElementIds(ids);
      setNodes((current) => current.map((node) => (node.selected ? { ...node, selected: false } : node)));
    },
    [setSelectedElementIds],
  );

  const onPaneClick = useCallback(() => {
    if (useCanvasStore.getState().selectedElementIds.length > 0) {
      setSelectedElementIds([]);
    }
  }, [setSelectedElementIds]);

  const onPaneDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (useCanvasStore.getState().drawingTool !== 'select') {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.react-flow__node') || target.closest('.react-flow__edge')) {
        return;
      }
      if (!target.closest('.react-flow__pane')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      drawingLayerRef.current?.openTextDraft(point.x, point.y);
    },
    [screenToFlowPosition],
  );

  return (
    <div
      ref={paneRef}
      className="workspace-canvas relative min-h-0 flex-1"
      data-testid="workspace-canvas"
      data-canvas-drawing-tool={drawingTool}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        onSelectionChange={({ nodes: selectedNodes }) => {
          if (selectedNodes.length > 0 && useCanvasStore.getState().selectedElementIds.length > 0) {
            setSelectedElementIds([]);
          }
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodesDraggable={!canvasLoading && !drawing}
        nodesConnectable={!canvasLoading && !drawing}
        elementsSelectable={!drawing}
        panOnDrag={drawing ? [1, 2] : true}
        edgesReconnectable={false}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{
          type: DEFAULT_CANVAS_EDGE_TYPE,
          markerEnd: canvasEdgeArrowMarker(),
        }}
        deleteKeyCode={blockCardDelete ? null : ['Backspace', 'Delete']}
        zoomOnDoubleClick={false}
        minZoom={0.35}
        maxZoom={2}
        fitView={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <DrawingLayer ref={drawingLayerRef} onSelectElements={onSelectDrawingElements} />
        <Controls />
      </ReactFlow>
      {!canvasLoading && nodes.length === 0 && scene.elements.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-[10px] border border-dashed border-border bg-card/90 p-4 text-sm text-muted-foreground">
          空画布。新建 Markdown 卡片，或从右上角添加图片，也可以粘贴、拖入。内容会按当前工作区自动保存。可从卡片边缘拉箭头连到另一张卡片。可用顶栏画笔、箭头和形状。
        </div>
      ) : null}
    </div>
  );
});
