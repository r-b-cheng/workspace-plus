import { DEFAULT_SCENE_FONT_SIZE } from '@/features/canvas/scene';
import type { CanvasSceneElement } from '@/lib/types';

export const MIN_SHAPE_SIZE = 4;
export const MIN_TEXT_FONT_SIZE = 10;
export const HANDLE_SCREEN_PX = 8;
export const MOVE_DRAG_THRESHOLD_PX = 4;
export const NUDGE_STEP = 1;
export const NUDGE_STEP_SHIFT = 10;

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function unionBoundingBoxes(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type EndpointHandle = 'start' | 'end';
export type TransformHandle = BoxHandle | EndpointHandle;

export type Point = { x: number; y: number };

const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CORNER_HANDLES: BoxHandle[] = ['nw', 'ne', 'se', 'sw'];

const TEXT_WIDTH_EM = 0.6;
const TEXT_HEIGHT_EM = 1.2;

function isBoxHandle(handle: string): handle is BoxHandle {
  return (BOX_HANDLES as string[]).includes(handle);
}

function isCornerHandle(handle: BoxHandle): boolean {
  return (CORNER_HANDLES as string[]).includes(handle);
}

export function handleWorldSize(zoom: number): number {
  return HANDLE_SCREEN_PX / Math.max(zoom, 0.001);
}

/** Approximate text box for selection chrome and font-size handles. */
export function estimateTextSize(text: string, fontSize: number): { width: number; height: number } {
  const size = fontSize > 0 ? fontSize : DEFAULT_SCENE_FONT_SIZE;
  return {
    width: Math.max(size, text.length * size * TEXT_WIDTH_EM),
    height: size * TEXT_HEIGHT_EM,
  };
}

export function boundingBox(element: CanvasSceneElement): BoundingBox {
  if (element.type === 'rect' || element.type === 'ellipse') {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
  if (element.type === 'line' || element.type === 'arrow') {
    return {
      x: Math.min(element.x1, element.x2),
      y: Math.min(element.y1, element.y2),
      width: Math.abs(element.x2 - element.x1),
      height: Math.abs(element.y2 - element.y1),
    };
  }
  if (element.type === 'path') {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of element.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    if (!Number.isFinite(minX)) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  const size = estimateTextSize(element.text, element.fontSize ?? DEFAULT_SCENE_FONT_SIZE);
  return { x: element.x, y: element.y, width: size.width, height: size.height };
}

export function moveElement(element: CanvasSceneElement, dx: number, dy: number): CanvasSceneElement {
  if (element.type === 'rect' || element.type === 'ellipse' || element.type === 'text') {
    return { ...element, x: element.x + dx, y: element.y + dy };
  }
  if (element.type === 'line' || element.type === 'arrow') {
    return {
      ...element,
      x1: element.x1 + dx,
      y1: element.y1 + dy,
      x2: element.x2 + dx,
      y2: element.y2 + dy,
    };
  }
  return {
    ...element,
    points: element.points.map(([x, y]) => [x + dx, y + dy] as [number, number]),
  };
}

export function lockAxis(x1: number, y1: number, x2: number, y2: number): { x2: number; y2: number } {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dx >= dy) {
    return { x2, y2: y1 };
  }
  return { x2: x1, y2 };
}

export function moveLineEndpoint(
  element: CanvasSceneElement,
  which: EndpointHandle,
  pointer: Point,
  options?: { lockAxis?: boolean },
): CanvasSceneElement {
  if (element.type !== 'line' && element.type !== 'arrow') {
    return element;
  }
  const fixed = which === 'start' ? { x: element.x2, y: element.y2 } : { x: element.x1, y: element.y1 };
  let { x, y } = pointer;
  if (options?.lockAxis) {
    const locked = lockAxis(fixed.x, fixed.y, x, y);
    x = locked.x2;
    y = locked.y2;
  }
  if (which === 'start') {
    return { ...element, x1: x, y1: y };
  }
  return { ...element, x2: x, y2: y };
}

export function handlesFor(element: CanvasSceneElement): TransformHandle[] {
  if (element.type === 'rect' || element.type === 'ellipse') {
    return [...BOX_HANDLES];
  }
  if (element.type === 'line' || element.type === 'arrow') {
    return ['start', 'end'];
  }
  return [...CORNER_HANDLES];
}

export function boxHandlePosition(box: BoundingBox, handle: BoxHandle): Point {
  const { x, y, width, height } = box;
  switch (handle) {
    case 'nw':
      return { x, y };
    case 'n':
      return { x: x + width / 2, y };
    case 'ne':
      return { x: x + width, y };
    case 'e':
      return { x: x + width, y: y + height / 2 };
    case 'se':
      return { x: x + width, y: y + height };
    case 's':
      return { x: x + width / 2, y: y + height };
    case 'sw':
      return { x, y: y + height };
    case 'w':
      return { x, y: y + height / 2 };
  }
}

/** Opposite corner/edge midpoint of `handle`. Path/text scale around this anchor. */
export function oppositeHandle(handle: BoxHandle): BoxHandle {
  switch (handle) {
    case 'nw':
      return 'se';
    case 'n':
      return 's';
    case 'ne':
      return 'sw';
    case 'e':
      return 'w';
    case 'se':
      return 'nw';
    case 's':
      return 'n';
    case 'sw':
      return 'ne';
    case 'w':
      return 'e';
  }
}

export function handlePosition(element: CanvasSceneElement, handle: TransformHandle): Point {
  if ((element.type === 'line' || element.type === 'arrow') && (handle === 'start' || handle === 'end')) {
    return handle === 'start' ? { x: element.x1, y: element.y1 } : { x: element.x2, y: element.y2 };
  }
  if (!isBoxHandle(handle)) {
    return { x: 0, y: 0 };
  }
  return boxHandlePosition(boundingBox(element), handle);
}

export function cursorForHandle(handle: TransformHandle): string {
  if (handle === 'nw' || handle === 'se') {
    return 'nwse-resize';
  }
  if (handle === 'ne' || handle === 'sw') {
    return 'nesw-resize';
  }
  if (handle === 'n' || handle === 's') {
    return 'ns-resize';
  }
  if (handle === 'e' || handle === 'w') {
    return 'ew-resize';
  }
  return 'pointer';
}

function clampMinSize(size: number): number {
  return Math.max(MIN_SHAPE_SIZE, Math.abs(size));
}

/**
 * Resize an AABB. Opposite edge/corner stays put.
 * Shift (`keepAspect`): corners use cover-scale from the opposite corner
 * (max of |dx|/w and |dy|/h); side handles grow the free axis from the center.
 */
export function resizeBox(
  box: BoundingBox,
  handle: BoxHandle,
  pointer: Point,
  keepAspect: boolean,
): BoundingBox {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const aspect = box.width / Math.max(box.height, 1e-6);

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  switch (handle) {
    case 'e':
      nextRight = pointer.x;
      break;
    case 'w':
      nextLeft = pointer.x;
      break;
    case 's':
      nextBottom = pointer.y;
      break;
    case 'n':
      nextTop = pointer.y;
      break;
    case 'se':
      nextRight = pointer.x;
      nextBottom = pointer.y;
      break;
    case 'sw':
      nextLeft = pointer.x;
      nextBottom = pointer.y;
      break;
    case 'ne':
      nextRight = pointer.x;
      nextTop = pointer.y;
      break;
    case 'nw':
      nextLeft = pointer.x;
      nextTop = pointer.y;
      break;
  }

  if (keepAspect) {
    if (handle === 'e' || handle === 'w') {
      const width = Math.abs(nextRight - nextLeft);
      const height = width / aspect;
      const cy = top + box.height / 2;
      nextTop = cy - height / 2;
      nextBottom = cy + height / 2;
    } else if (handle === 'n' || handle === 's') {
      const height = Math.abs(nextBottom - nextTop);
      const width = height * aspect;
      const cx = left + box.width / 2;
      nextLeft = cx - width / 2;
      nextRight = cx + width / 2;
    } else {
      const anchorX = handle.includes('w') ? right : left;
      const anchorY = handle.includes('n') ? bottom : top;
      const scale = Math.max(
        Math.abs(pointer.x - anchorX) / Math.max(box.width, 1e-6),
        Math.abs(pointer.y - anchorY) / Math.max(box.height, 1e-6),
      );
      const width = clampMinSize(box.width * scale);
      const height = clampMinSize(box.height * scale);
      if (handle.includes('w')) {
        nextRight = anchorX;
        nextLeft = anchorX - width;
      } else {
        nextLeft = anchorX;
        nextRight = anchorX + width;
      }
      if (handle.includes('n')) {
        nextBottom = anchorY;
        nextTop = anchorY - height;
      } else {
        nextTop = anchorY;
        nextBottom = anchorY + height;
      }
    }
  }

  if (nextLeft > nextRight) {
    const swap = nextLeft;
    nextLeft = nextRight;
    nextRight = swap;
  }
  if (nextTop > nextBottom) {
    const swap = nextTop;
    nextTop = nextBottom;
    nextBottom = swap;
  }

  let width = nextRight - nextLeft;
  let height = nextBottom - nextTop;
  if (width < MIN_SHAPE_SIZE) {
    if (handle === 'w' || handle === 'nw' || handle === 'sw') {
      nextLeft = nextRight - MIN_SHAPE_SIZE;
    } else if (handle === 'e' || handle === 'ne' || handle === 'se') {
      nextRight = nextLeft + MIN_SHAPE_SIZE;
    } else {
      const cx = (nextLeft + nextRight) / 2;
      nextLeft = cx - MIN_SHAPE_SIZE / 2;
      nextRight = cx + MIN_SHAPE_SIZE / 2;
    }
    width = MIN_SHAPE_SIZE;
  }
  if (height < MIN_SHAPE_SIZE) {
    if (handle === 'n' || handle === 'nw' || handle === 'ne') {
      nextTop = nextBottom - MIN_SHAPE_SIZE;
    } else if (handle === 's' || handle === 'sw' || handle === 'se') {
      nextBottom = nextTop + MIN_SHAPE_SIZE;
    } else {
      const cy = (nextTop + nextBottom) / 2;
      nextTop = cy - MIN_SHAPE_SIZE / 2;
      nextBottom = cy + MIN_SHAPE_SIZE / 2;
    }
    height = MIN_SHAPE_SIZE;
  }

  return { x: nextLeft, y: nextTop, width, height };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Path corner-resize: uniform scale of every point around the opposite
 * corner of the axis-aligned bounding box. Scale is
 * distance(pointer, anchor) / distance(original-handle-corner, anchor).
 * Side handles are ignored.
 */
function resizePath(
  element: Extract<CanvasSceneElement, { type: 'path' }>,
  handle: BoxHandle,
  pointer: Point,
): CanvasSceneElement {
  if (!isCornerHandle(handle)) {
    return element;
  }
  const box = boundingBox(element);
  const anchor = boxHandlePosition(box, oppositeHandle(handle));
  const start = boxHandlePosition(box, handle);
  const origin = distance(start, anchor) || 1;
  const minSide = Math.min(box.width, box.height);
  const minScale = minSide > 0 ? MIN_SHAPE_SIZE / minSide : 0;
  const scale = Math.max(distance(pointer, anchor) / origin, minScale);
  return {
    ...element,
    points: element.points.map(
      ([x, y]) => [anchor.x + (x - anchor.x) * scale, anchor.y + (y - anchor.y) * scale] as [number, number],
    ),
  };
}

function resizeText(
  element: Extract<CanvasSceneElement, { type: 'text' }>,
  handle: BoxHandle,
  pointer: Point,
): CanvasSceneElement {
  if (!isCornerHandle(handle)) {
    return element;
  }
  const fontSize = element.fontSize ?? DEFAULT_SCENE_FONT_SIZE;
  const box = boundingBox(element);
  const anchor = boxHandlePosition(box, oppositeHandle(handle));
  const start = boxHandlePosition(box, handle);
  const origin = distance(start, anchor) || 1;
  const scale = distance(pointer, anchor) / origin;
  const nextFontSize = Math.max(MIN_TEXT_FONT_SIZE, fontSize * scale);
  const nextSize = estimateTextSize(element.text, nextFontSize);
  let x = element.x;
  let y = element.y;
  if (handle === 'nw' || handle === 'sw') {
    x = box.x + box.width - nextSize.width;
  }
  if (handle === 'nw' || handle === 'ne') {
    y = box.y + box.height - nextSize.height;
  }
  return { ...element, x, y, fontSize: nextFontSize };
}

export function resizeElement(
  element: CanvasSceneElement,
  handle: BoxHandle,
  pointer: Point,
  _options?: { keepAspect?: boolean; zoom?: number },
): CanvasSceneElement {
  const keepAspect = Boolean(_options?.keepAspect);
  if (element.type === 'rect' || element.type === 'ellipse') {
    const next = resizeBox(boundingBox(element), handle, pointer, keepAspect);
    return { ...element, x: next.x, y: next.y, width: next.width, height: next.height };
  }
  if (element.type === 'path') {
    return resizePath(element, handle, pointer);
  }
  if (element.type === 'text') {
    return resizeText(element, handle, pointer);
  }
  return element;
}

export function arrowNudge(key: string): Point | null {
  if (key === 'ArrowLeft') {
    return { x: -1, y: 0 };
  }
  if (key === 'ArrowRight') {
    return { x: 1, y: 0 };
  }
  if (key === 'ArrowUp') {
    return { x: 0, y: -1 };
  }
  if (key === 'ArrowDown') {
    return { x: 0, y: 1 };
  }
  return null;
}
