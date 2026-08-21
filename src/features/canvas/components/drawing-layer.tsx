import { useReactFlow, useViewport } from '@xyflow/react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { cryptoRandomId } from '@/features/canvas/persist';
import {
  DEFAULT_SCENE_COLOR,
  DEFAULT_SCENE_FONT_SIZE,
  DEFAULT_SCENE_INK_COLOR,
  DEFAULT_SCENE_STROKE_WIDTH,
  defaultElementColor,
  inkColor,
} from '@/features/canvas/scene';
import {
  arrowNudge,
  boundingBox,
  cursorForHandle,
  handlePosition,
  handleWorldSize,
  handlesFor,
  lockAxis,
  MIN_SHAPE_SIZE,
  moveElement,
  moveLineEndpoint,
  MOVE_DRAG_THRESHOLD_PX,
  NUDGE_STEP,
  NUDGE_STEP_SHIFT,
  resizeElement,
  type TransformHandle,
} from '@/features/canvas/scene-transform';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import type { CanvasSceneElement, CanvasSceneTextElement } from '@/lib/types';

const PATH_POINT_GAP = 2;
const CANVAS_MIN_ZOOM = 0.35;
const CANVAS_MAX_ZOOM = 2;
const TEXT_BLUR_GUARD_MS = 300;

function clampCanvasZoom(zoom: number): number {
  return Math.min(CANVAS_MAX_ZOOM, Math.max(CANVAS_MIN_ZOOM, zoom));
}

type PathDraft = { type: 'path'; points: [number, number][] };
type SegmentDraft = { type: 'arrow' | 'line'; x1: number; y1: number; x2: number; y2: number };
type BoxDraft = { type: 'rect' | 'ellipse'; x1: number; y1: number; x2: number; y2: number };
type Draft = PathDraft | SegmentDraft | BoxDraft;
type TextDraft = {
  x: number;
  y: number;
  id?: string;
  text?: string;
  fontSize?: number;
  color?: string;
};

type TransformSession = {
  pointerId: number;
  elementId: string;
  kind: 'move' | 'resize' | 'endpoint';
  handle?: TransformHandle;
  originFlow: [number, number];
  originClient: [number, number];
  snapshot: CanvasSceneElement;
  moved: boolean;
};

type DrawingLayerProps = {
  onSelectElements: (ids: string[]) => void;
};

export type DrawingLayerHandle = {
  openTextDraft: (x: number, y: number, existing?: CanvasSceneTextElement) => void;
};

function distance(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function boxFromCorners(x1: number, y1: number, x2: number, y2: number) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .cm-editor, .cm-content'));
}

function pathD(points: [number, number][]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ');
}

export const DrawingLayer = forwardRef<DrawingLayerHandle, DrawingLayerProps>(function DrawingLayer(
  { onSelectElements },
  ref,
) {
  const scene = useCanvasStore((state) => state.scene);
  const drawingTool = useCanvasStore((state) => state.drawingTool);
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const setDrawingTool = useCanvasStore((state) => state.setDrawingTool);
  const upsertSceneElements = useCanvasStore((state) => state.upsertSceneElements);
  const removeSceneElements = useCanvasStore((state) => state.removeSceneElements);
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow();
  const viewport = useViewport();
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const transformRef = useRef<TransformSession | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [transformKind, setTransformKind] = useState<'move' | 'resize' | null>(null);
  const [transformActive, setTransformActive] = useState(false);
  const textInputRef = useRef<HTMLInputElement>(null);
  const ignoreBlurUntilRef = useRef(0);
  const drawing = drawingTool !== 'select';

  const flowPoint = useCallback(
    (event: { clientX: number; clientY: number }): [number, number] => {
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      return [point.x, point.y];
    },
    [screenToFlowPosition],
  );

  const openTextDraft = useCallback((x: number, y: number, existing?: CanvasSceneTextElement) => {
    ignoreBlurUntilRef.current = Date.now() + TEXT_BLUR_GUARD_MS;
    setTextDraft(
      existing
        ? { x: existing.x, y: existing.y, id: existing.id, text: existing.text, fontSize: existing.fontSize, color: existing.color }
        : { x, y },
    );
  }, []);

  useImperativeHandle(ref, () => ({ openTextDraft }), [openTextDraft]);

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setTextDraft(null);
  }, []);

  const clearTransform = useCallback(() => {
    transformRef.current = null;
    setTransformKind(null);
    setTransformActive(false);
  }, []);

  useEffect(() => {
    if (drawingTool !== 'text' && drawingTool !== 'select') {
      setTextDraft(null);
    }
    if (drawingTool === 'select') {
      setDraft(null);
    }
  }, [drawingTool]);

  useEffect(() => {
    if (!textDraft) {
      return;
    }
    ignoreBlurUntilRef.current = Date.now() + TEXT_BLUR_GUARD_MS;
    const frame = requestAnimationFrame(() => {
      textInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [textDraft]);

  const commitText = useCallback(() => {
    const pending = textDraft;
    const text = textInputRef.current?.value.trim() ?? '';
    if (!pending || !text) {
      setTextDraft(null);
      return;
    }
    setTextDraft(null);
    upsertSceneElements([
      {
        id: pending.id ?? cryptoRandomId(),
        type: 'text',
        x: pending.x,
        y: pending.y,
        text,
        fontSize: pending.fontSize ?? DEFAULT_SCENE_FONT_SIZE,
        color: pending.color ?? DEFAULT_SCENE_INK_COLOR,
      },
    ]);
    setDrawingTool('select');
  }, [setDrawingTool, textDraft, upsertSceneElements]);

  const onTextBlur = useCallback(() => {
    if (Date.now() < ignoreBlurUntilRef.current) {
      requestAnimationFrame(() => textInputRef.current?.focus());
      return;
    }
    commitText();
  }, [commitText]);

  const applyTransform = useCallback(
    (event: PointerEvent) => {
      const session = transformRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const [x, y] = flowPoint(event);
      if (session.kind === 'move') {
        if (!session.moved) {
          const screenDist = Math.hypot(event.clientX - session.originClient[0], event.clientY - session.originClient[1]);
          if (screenDist < MOVE_DRAG_THRESHOLD_PX) {
            return;
          }
          session.moved = true;
          setTransformKind('move');
        }
        upsertSceneElements([moveElement(session.snapshot, x - session.originFlow[0], y - session.originFlow[1])]);
        return;
      }
      if (session.kind === 'endpoint' && (session.handle === 'start' || session.handle === 'end')) {
        upsertSceneElements([
          moveLineEndpoint(session.snapshot, session.handle, { x, y }, { lockAxis: event.shiftKey }),
        ]);
        return;
      }
      if (session.kind === 'resize' && session.handle && session.handle !== 'start' && session.handle !== 'end') {
        upsertSceneElements([
          resizeElement(session.snapshot, session.handle, { x, y }, { keepAspect: event.shiftKey, zoom: viewport.zoom }),
        ]);
      }
    },
    [flowPoint, upsertSceneElements, viewport.zoom],
  );

  useEffect(() => {
    if (!transformActive) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      applyTransform(event);
    };
    const onUp = (event: PointerEvent) => {
      const session = transformRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const svg = svgRef.current;
      if (svg?.hasPointerCapture(event.pointerId)) {
        svg.releasePointerCapture(event.pointerId);
      }
      clearTransform();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [applyTransform, clearTransform, transformActive]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !drawing) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const current = getViewport();
      const rect = svg.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const factor = event.deltaMode === 1 ? 0.05 : 0.002;
      const nextZoom = clampCanvasZoom(current.zoom * Math.exp(-event.deltaY * factor));
      if (nextZoom === current.zoom) {
        return;
      }
      const ratio = nextZoom / current.zoom;
      setViewport({
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
        zoom: nextZoom,
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [drawing, getViewport, setViewport]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearTransform();
        cancelDraft();
        setDrawingTool('select');
        return;
      }
      const nudge = arrowNudge(event.key);
      if (nudge) {
        if (isTypingTarget(event.target)) {
          return;
        }
        const state = useCanvasStore.getState();
        if (state.drawingTool !== 'select' || state.selectedElementIds.length === 0) {
          return;
        }
        event.preventDefault();
        const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
        const selected = new Set(state.selectedElementIds);
        const next = state.scene.elements
          .filter((element) => selected.has(element.id))
          .map((element) => moveElement(element, nudge.x * step, nudge.y * step));
        if (next.length > 0) {
          upsertSceneElements(next);
        }
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      const ids = useCanvasStore.getState().selectedElementIds;
      if (ids.length === 0) {
        return;
      }
      event.preventDefault();
      removeSceneElements(ids);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelDraft, clearTransform, removeSceneElements, setDrawingTool, upsertSceneElements]);

  const beginTransform = useCallback(
    (event: ReactPointerEvent, session: Omit<TransformSession, 'pointerId' | 'originFlow' | 'originClient'>) => {
      event.stopPropagation();
      event.preventDefault();
      const [x, y] = flowPoint(event);
      transformRef.current = {
        ...session,
        pointerId: event.pointerId,
        originFlow: [x, y],
        originClient: [event.clientX, event.clientY],
      };
      svgRef.current?.setPointerCapture(event.pointerId);
      setTransformActive(true);
      if (session.kind !== 'move') {
        setTransformKind('resize');
      }
    },
    [flowPoint],
  );

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drawing) {
      return;
    }
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { lastX: event.clientX, lastY: event.clientY };
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (drawingTool === 'text') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = flowPoint(event);
    if (drawingTool === 'pen') {
      setDraft({ type: 'path', points: [[x, y]] });
      return;
    }
    if (drawingTool === 'arrow' || drawingTool === 'line') {
      setDraft({ type: drawingTool, x1: x, y1: y, x2: x, y2: y });
      return;
    }
    if (drawingTool === 'rect' || drawingTool === 'ellipse') {
      setDraft({ type: drawingTool, x1: x, y1: y, x2: x, y2: y });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (transformRef.current) {
      applyTransform(event.nativeEvent);
      return;
    }
    if (panRef.current) {
      const current = getViewport();
      const dx = event.clientX - panRef.current.lastX;
      const dy = event.clientY - panRef.current.lastY;
      panRef.current = { lastX: event.clientX, lastY: event.clientY };
      setViewport({ x: current.x + dx, y: current.y + dy, zoom: current.zoom });
      return;
    }
    if (!draft) {
      return;
    }
    const [x, y] = flowPoint(event);
    if (draft.type === 'path') {
      const last = draft.points[draft.points.length - 1];
      if (!last || distance(last, [x, y]) < PATH_POINT_GAP) {
        return;
      }
      setDraft({ type: 'path', points: [...draft.points, [x, y]] });
      return;
    }
    if (draft.type === 'line' && event.shiftKey) {
      const locked = lockAxis(draft.x1, draft.y1, x, y);
      setDraft({ ...draft, ...locked });
      return;
    }
    setDraft({ ...draft, x2: x, y2: y });
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (transformRef.current && transformRef.current.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      clearTransform();
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (drawingTool === 'text' && event.button === 0) {
      event.preventDefault();
      event.stopPropagation();
      const [x, y] = flowPoint(event);
      openTextDraft(x, y);
      return;
    }
    if (!draft) {
      return;
    }
    const nextDraft =
      draft.type === 'line' && event.shiftKey
        ? { ...draft, ...lockAxis(draft.x1, draft.y1, draft.x2, draft.y2) }
        : draft;
    const created = elementFromDraft(nextDraft);
    setDraft(null);
    if (created) {
      upsertSceneElements([created]);
    }
  };

  const onElementPointerDown = (event: ReactPointerEvent, id: string) => {
    if (drawing) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const element = useCanvasStore.getState().scene.elements.find((item) => item.id === id);
    if (!element) {
      return;
    }
    onSelectElements([id]);
    beginTransform(event, {
      elementId: id,
      kind: 'move',
      snapshot: element,
      moved: false,
    });
  };

  const onHandlePointerDown = (event: ReactPointerEvent, element: CanvasSceneElement, handle: TransformHandle) => {
    if (drawing) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    onSelectElements([element.id]);
    if (handle === 'start' || handle === 'end') {
      beginTransform(event, {
        elementId: element.id,
        kind: 'endpoint',
        handle,
        snapshot: element,
        moved: true,
      });
      return;
    }
    beginTransform(event, {
      elementId: element.id,
      kind: 'resize',
      handle,
      snapshot: element,
      moved: true,
    });
  };

  const onElementDoubleClick = (event: ReactMouseEvent, element: CanvasSceneElement) => {
    if (element.type !== 'text') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openTextDraft(element.x, element.y, element);
  };

  const preview = draft ? elementFromDraft(draft, 'draft-preview') : null;
  const canvasHost = svgRef.current?.closest('[data-testid="workspace-canvas"]');
  const selectedId = selectedElementIds[0];
  const selectedElement = selectedId ? scene.elements.find((element) => element.id === selectedId) : undefined;

  return (
    <>
      <svg
        ref={svgRef}
        className="canvas-drawing-layer"
        data-testid="canvas-drawing-layer"
        data-drawing={drawing ? 'true' : 'false'}
        data-transform={transformKind ?? undefined}
        pointerEvents={drawing ? 'auto' : 'none'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(event) => {
          if (drawingTool === 'text' || textDraft) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onContextMenu={drawing ? (event) => event.preventDefault() : undefined}
      >
        <defs>
          {scene.elements.map((element) =>
            element.type === 'arrow' ? <ArrowMarker key={element.id} id={element.id} color={inkColor(element)} /> : null,
          )}
          {preview?.type === 'arrow' ? <ArrowMarker id={preview.id} color={inkColor(preview)} /> : null}
        </defs>
        <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.zoom})`}>
          {scene.elements.map((element) => (
            <SceneElementShape
              key={element.id}
              element={element}
              selected={selectedElementIds.includes(element.id)}
              drawing={drawing}
              grabbing={transformKind === 'move' && transformRef.current?.elementId === element.id}
              onPointerDown={onElementPointerDown}
              onDoubleClick={onElementDoubleClick}
            />
          ))}
          {preview ? (
            <SceneElementShape
              element={preview}
              selected={false}
              drawing
              grabbing={false}
              onPointerDown={() => undefined}
              onDoubleClick={() => undefined}
            />
          ) : draft?.type === 'path' && draft.points[0] ? (
            <circle cx={draft.points[0][0]} cy={draft.points[0][1]} r={2} fill={DEFAULT_SCENE_COLOR} pointerEvents="none" />
          ) : null}
          {selectedElement && !drawing ? (
            <SelectionChrome
              element={selectedElement}
              zoom={viewport.zoom}
              onHandlePointerDown={onHandlePointerDown}
            />
          ) : null}
        </g>
      </svg>
      {textDraft && canvasHost instanceof HTMLElement
        ? createPortal(
            <input
              ref={textInputRef}
              key={textDraft.id ?? `${textDraft.x}:${textDraft.y}`}
              data-testid="canvas-drawing-text-input"
              className="canvas-drawing-text-input"
              style={{
                left: textDraft.x * viewport.zoom + viewport.x,
                top: textDraft.y * viewport.zoom + viewport.y,
              }}
              defaultValue={textDraft.text ?? ''}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onBlur={onTextBlur}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitText();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelDraft();
                  setDrawingTool('select');
                }
              }}
            />,
            canvasHost,
          )
        : null}
    </>
  );
});

function ArrowMarker({ id, color }: { id: string; color: string }) {
  return (
    <marker
      id={`canvas-drawing-arrow-${id}`}
      markerWidth="8"
      markerHeight="8"
      refX="6.5"
      refY="4"
      orient="auto"
      markerUnits="strokeWidth"
    >
      <path d="M0,0 L8,4 L0,8 Z" fill={color} />
    </marker>
  );
}

function elementFromDraft(draft: Draft, id = cryptoRandomId()): CanvasSceneElement | null {
  if (draft.type === 'path') {
    if (draft.points.length < 2) {
      return null;
    }
    return {
      id,
      type: 'path',
      points: draft.points,
      color: defaultElementColor('path'),
      strokeWidth: DEFAULT_SCENE_STROKE_WIDTH,
    };
  }
  if (draft.type === 'arrow' || draft.type === 'line') {
    if (distance([draft.x1, draft.y1], [draft.x2, draft.y2]) < MIN_SHAPE_SIZE) {
      return null;
    }
    return {
      id,
      type: draft.type,
      x1: draft.x1,
      y1: draft.y1,
      x2: draft.x2,
      y2: draft.y2,
      color: defaultElementColor(draft.type),
      strokeWidth: DEFAULT_SCENE_STROKE_WIDTH,
    };
  }
  const box = boxFromCorners(draft.x1, draft.y1, draft.x2, draft.y2);
  if (box.width < MIN_SHAPE_SIZE || box.height < MIN_SHAPE_SIZE) {
    return null;
  }
  return {
    id,
    type: draft.type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: defaultElementColor(draft.type),
    strokeWidth: DEFAULT_SCENE_STROKE_WIDTH,
    fill: null,
  };
}

function SceneElementShape({
  element,
  selected,
  drawing,
  grabbing,
  onPointerDown,
  onDoubleClick,
}: {
  element: CanvasSceneElement;
  selected: boolean;
  drawing: boolean;
  grabbing: boolean;
  onPointerDown: (event: ReactPointerEvent, id: string) => void;
  onDoubleClick: (event: ReactMouseEvent, element: CanvasSceneElement) => void;
}) {
  const color = inkColor(element);
  const strokeWidth = element.type === 'text' ? undefined : (element.strokeWidth ?? DEFAULT_SCENE_STROKE_WIDTH);
  const hitEvents =
    drawing ? 'none' : element.type === 'path' || element.type === 'arrow' || element.type === 'line' ? 'stroke' : 'auto';
  const testProps = {
    'data-testid': `canvas-drawing-element-${element.id}`,
    'data-selected': selected ? 'true' : 'false',
    className: `canvas-drawing-element${selected ? ' is-selected' : ''}`,
    pointerEvents: hitEvents as 'none' | 'stroke' | 'auto',
    style: drawing ? undefined : { cursor: grabbing ? 'grabbing' : 'grab' },
    onPointerDown: (event: ReactPointerEvent) => onPointerDown(event, element.id),
    onDoubleClick: (event: ReactMouseEvent) => onDoubleClick(event, element),
  };

  if (element.type === 'path') {
    return (
      <g>
        <path
          d={pathD(element.points)}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(12, (strokeWidth ?? 2) + 8)}
          {...testProps}
        />
        <path
          d={pathD(element.points)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
        />
      </g>
    );
  }
  if (element.type === 'arrow' || element.type === 'line') {
    return (
      <g>
        <line
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
          stroke="transparent"
          strokeWidth={Math.max(12, (strokeWidth ?? 2) + 8)}
          {...testProps}
        />
        <line
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          {...(element.type === 'arrow' ? { markerEnd: `url(#canvas-drawing-arrow-${element.id})` } : {})}
          pointerEvents="none"
        />
      </g>
    );
  }
  if (element.type === 'rect') {
    return (
      <rect
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        fill={element.fill ?? 'transparent'}
        stroke={color}
        strokeWidth={strokeWidth}
        {...testProps}
      />
    );
  }
  if (element.type === 'ellipse') {
    return (
      <ellipse
        cx={element.x + element.width / 2}
        cy={element.y + element.height / 2}
        rx={Math.abs(element.width / 2)}
        ry={Math.abs(element.height / 2)}
        fill={element.fill ?? 'transparent'}
        stroke={color}
        strokeWidth={strokeWidth}
        {...testProps}
      />
    );
  }
  return (
    <text
      x={element.x}
      y={element.y}
      fill={color}
      fontSize={element.fontSize ?? DEFAULT_SCENE_FONT_SIZE}
      dominantBaseline="hanging"
      {...testProps}
    >
      {element.text}
    </text>
  );
}

function SelectionChrome({
  element,
  zoom,
  onHandlePointerDown,
}: {
  element: CanvasSceneElement;
  zoom: number;
  onHandlePointerDown: (event: ReactPointerEvent, element: CanvasSceneElement, handle: TransformHandle) => void;
}) {
  const box = boundingBox(element);
  const size = handleWorldSize(zoom);
  const half = size / 2;
  const stroke = 1 / zoom;
  const width = Math.max(box.width, stroke);
  const height = Math.max(box.height, stroke);

  return (
    <g className="canvas-drawing-selection" pointerEvents="none">
      <rect
        x={box.x}
        y={box.y}
        width={width}
        height={height}
        fill="none"
        stroke="#176bff"
        strokeWidth={stroke}
        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
        pointerEvents="none"
      />
      {handlesFor(element).map((handle) => {
        const pos = handlePosition(element, handle);
        return (
          <rect
            key={handle}
            data-testid={`canvas-drawing-handle-${element.id}-${handle}`}
            x={pos.x - half}
            y={pos.y - half}
            width={size}
            height={size}
            fill="#fff"
            stroke="#176bff"
            strokeWidth={stroke}
            pointerEvents="auto"
            style={{ cursor: cursorForHandle(handle) }}
            onPointerDown={(event) => onHandlePointerDown(event, element, handle)}
          />
        );
      })}
    </g>
  );
}
