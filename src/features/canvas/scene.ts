import type {
  CanvasScene,
  CanvasSceneArrowElement,
  CanvasSceneElement,
  CanvasSceneEllipseElement,
  CanvasSceneLineElement,
  CanvasScenePathElement,
  CanvasSceneRectElement,
  CanvasSceneTextElement,
} from '@/lib/types';

export const CANVAS_SCENE_VERSION = 1;
export const DEFAULT_SCENE_COLOR = '#176bff';
export const DEFAULT_SCENE_INK_COLOR = '#172033';
export const DEFAULT_SCENE_STROKE_WIDTH = 2;
export const DEFAULT_SCENE_FONT_SIZE = 16;

/** Path stays product blue; rect / ellipse / line / arrow / text default to ink black. */
export function defaultElementColor(type: string): string {
  return type === 'path' ? DEFAULT_SCENE_COLOR : DEFAULT_SCENE_INK_COLOR;
}

export function inkColor(element: { type: string; color?: string }): string {
  if (element.color) {
    return element.color;
  }
  return defaultElementColor(element.type);
}

const SCENE_TYPES = ['path', 'line', 'arrow', 'rect', 'ellipse', 'text'] as const;

export function emptyCanvasScene(): CanvasScene {
  return { version: CANVAS_SCENE_VERSION, elements: [] };
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalColor(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalStrokeWidth(value: unknown): number | undefined {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

function asPoint(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const x = value[0];
  const y = value[1];
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    return null;
  }
  return [x, y];
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function isValidCanvasSceneElement(value: unknown): value is CanvasSceneElement {
  return normalizeCanvasSceneElement(value) !== null;
}

export function normalizeCanvasSceneElement(value: unknown): CanvasSceneElement | null {
  const record = recordOf(value);
  if (!record || typeof record.id !== 'string' || record.id.trim().length === 0) {
    return null;
  }
  if (typeof record.type !== 'string' || !SCENE_TYPES.includes(record.type as (typeof SCENE_TYPES)[number])) {
    return null;
  }

  const id = record.id;
  const color = optionalColor(record.color);
  const strokeWidth = optionalStrokeWidth(record.strokeWidth);

  if (record.type === 'path') {
    if (!Array.isArray(record.points)) {
      return null;
    }
    const points = record.points.map(asPoint).filter((point): point is [number, number] => point !== null);
    if (points.length < 2) {
      return null;
    }
    const element: CanvasScenePathElement = { id, type: 'path', points };
    if (color) {
      element.color = color;
    }
    if (strokeWidth !== undefined) {
      element.strokeWidth = strokeWidth;
    }
    return element;
  }

  if (record.type === 'arrow' || record.type === 'line') {
    if (
      !isFiniteNumber(record.x1) ||
      !isFiniteNumber(record.y1) ||
      !isFiniteNumber(record.x2) ||
      !isFiniteNumber(record.y2)
    ) {
      return null;
    }
    const element: CanvasSceneArrowElement | CanvasSceneLineElement = {
      id,
      type: record.type,
      x1: record.x1,
      y1: record.y1,
      x2: record.x2,
      y2: record.y2,
    };
    if (color) {
      element.color = color;
    }
    if (strokeWidth !== undefined) {
      element.strokeWidth = strokeWidth;
    }
    return element;
  }

  if (record.type === 'rect' || record.type === 'ellipse') {
    if (
      !isFiniteNumber(record.x) ||
      !isFiniteNumber(record.y) ||
      !isFiniteNumber(record.width) ||
      !isFiniteNumber(record.height)
    ) {
      return null;
    }
    const element: CanvasSceneRectElement | CanvasSceneEllipseElement = {
      id,
      type: record.type,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
    };
    if (color) {
      element.color = color;
    }
    if (strokeWidth !== undefined) {
      element.strokeWidth = strokeWidth;
    }
    if (record.fill === null) {
      element.fill = null;
    } else {
      const fill = optionalColor(record.fill);
      if (fill) {
        element.fill = fill;
      }
    }
    return element;
  }

  if (record.type === 'text') {
    if (!isFiniteNumber(record.x) || !isFiniteNumber(record.y) || typeof record.text !== 'string') {
      return null;
    }
    const element: CanvasSceneTextElement = {
      id,
      type: 'text',
      x: record.x,
      y: record.y,
      text: record.text,
    };
    if (color) {
      element.color = color;
    }
    if (isFiniteNumber(record.fontSize) && record.fontSize > 0) {
      element.fontSize = record.fontSize;
    }
    return element;
  }

  return null;
}

export function normalizeCanvasScene(value: unknown): CanvasScene {
  const record = recordOf(value);
  const elements = Array.isArray(record?.elements)
    ? record.elements.map(normalizeCanvasSceneElement).filter((element): element is CanvasSceneElement => element !== null)
    : [];
  return { version: CANVAS_SCENE_VERSION, elements };
}

export function sceneHasContent(scene: CanvasScene | undefined): boolean {
  return Boolean(scene && scene.elements.length > 0);
}
