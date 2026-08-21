import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { CanvasEdge, CanvasEdgeInput, CanvasNode, CanvasNodeInput, CanvasNodeType } from '@/lib/types';

export const DEFAULT_CANVAS_EDGE_TYPE = 'smoothstep';
export const CANVAS_EDGE_MARKER_END = 'arrowclosed' as const;

type CanvasEdgeMetadata = {
  markerEnd?: typeof CANVAS_EDGE_MARKER_END;
  sourceHandle?: string;
  targetHandle?: string;
};

export function canvasEdgeArrowMarker(): { type: MarkerType } {
  return { type: MarkerType.ArrowClosed };
}

export const DEFAULT_MARKDOWN_WIDTH = 280;
export const DEFAULT_MARKDOWN_HEIGHT = 200;
export const DEFAULT_IMAGE_WIDTH = 240;
export const DEFAULT_IMAGE_HEIGHT = 180;

export const MARKDOWN_FONT_SIZES = [13, 16, 20, 24] as const;
export type MarkdownFontSize = (typeof MARKDOWN_FONT_SIZES)[number];
export const DEFAULT_MARKDOWN_FONT_SIZE: MarkdownFontSize = 13;

export function isMarkdownFontSize(value: unknown): value is MarkdownFontSize {
  return typeof value === 'number' && (MARKDOWN_FONT_SIZES as readonly number[]).includes(value);
}

function parseNodeMetadataRecord(metadataJson: string | undefined): Record<string, unknown> {
  if (!metadataJson) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(metadataJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return { ...(parsed as Record<string, unknown>) };
  } catch {
    return {};
  }
}

/** Card-level Markdown font size. Only 13 / 16 / 20 / 24; anything else falls back to 13. */
export function parseMarkdownFontSize(metadataJson: string | undefined): MarkdownFontSize {
  const fontSize = parseNodeMetadataRecord(metadataJson).fontSize;
  return isMarkdownFontSize(fontSize) ? fontSize : DEFAULT_MARKDOWN_FONT_SIZE;
}

/** Merge fontSize into existing node metadata. Does not drop other fields. */
export function mergeMarkdownFontSize(metadataJson: string | undefined, fontSize: MarkdownFontSize): string {
  return JSON.stringify({
    ...parseNodeMetadataRecord(metadataJson),
    fontSize,
  });
}

const NODE_TYPES: CanvasNodeType[] = [
  'markdown',
  'text',
  'sticky',
  'todo',
  'image',
  'screenshot',
  'app_note',
];

export type CanvasFlowData = {
  workspaceId: string;
  nodeType: CanvasNodeType;
  title?: string;
  contentMarkdown?: string;
  contentText?: string;
  assetId?: string;
  color?: string;
  metadataJson?: string;
  zIndex: number;
  createdAt?: string;
  updatedAt?: string;
  imageUrl?: string;
  imageMissing?: boolean;
};

export type CanvasFlowNode = Node<CanvasFlowData>;

export function isImageNodeType(nodeType: CanvasNodeType | string | undefined): boolean {
  return nodeType === 'image' || nodeType === 'screenshot';
}

export function normalizeCanvasNodeType(value: unknown): CanvasNodeType {
  if (typeof value === 'string' && NODE_TYPES.includes(value as CanvasNodeType)) {
    return value as CanvasNodeType;
  }
  return 'markdown';
}

export function flowNodeType(nodeType: CanvasNodeType): 'markdown' | 'image' {
  return isImageNodeType(nodeType) ? 'image' : 'markdown';
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
}

function optionalFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function measuredSize(node: { measured?: { width?: number; height?: number } }, axis: 'width' | 'height'): number | undefined {
  return optionalFiniteNumber(node.measured?.[axis]);
}

type PersistableFlowNode = {
  id: string;
  type?: string;
  position?: { x?: number; y?: number };
  width?: number;
  height?: number;
  style?: { width?: number | string; height?: number | string };
  zIndex?: number;
  measured?: { width?: number; height?: number };
  data?: Partial<CanvasFlowData>;
};

/** Product payload only. Drops selected / dragging / measured / resizing and other renderer fields. */
export function toPersistedCanvasNode(node: PersistableFlowNode, _workspaceId: string): CanvasNodeInput {
  const data = node.data ?? {};
  const nodeType = normalizeCanvasNodeType(data.nodeType ?? node.type);
  const persisted: CanvasNodeInput = {
    id: node.id,
    nodeType,
    x: optionalFiniteNumber(node.position?.x) ?? 0,
    y: optionalFiniteNumber(node.position?.y) ?? 0,
    zIndex: optionalFiniteNumber(node.zIndex, data.zIndex) ?? 0,
  };

  const title = optionalString(data.title);
  if (title !== undefined) {
    persisted.title = title;
  }
  const contentMarkdown = optionalString(data.contentMarkdown);
  if (contentMarkdown !== undefined) {
    persisted.contentMarkdown = contentMarkdown;
  }
  const contentText = optionalString(data.contentText);
  if (contentText !== undefined) {
    persisted.contentText = contentText;
  }
  const assetId = optionalString(data.assetId);
  if (assetId !== undefined) {
    persisted.assetId = assetId;
  }
  const width = optionalFiniteNumber(node.width, node.style?.width, measuredSize(node, 'width'));
  if (width !== undefined) {
    persisted.width = width;
  }
  const height = optionalFiniteNumber(node.height, node.style?.height, measuredSize(node, 'height'));
  if (height !== undefined) {
    persisted.height = height;
  }
  const color = optionalString(data.color);
  if (color !== undefined) {
    persisted.color = color;
  }
  const metadataJson = optionalString(data.metadataJson);
  if (metadataJson !== undefined) {
    persisted.metadataJson = metadataJson;
  }

  return persisted;
}

export function fromPersistedCanvasNode(node: CanvasNode): CanvasFlowNode {
  const type = flowNodeType(node.nodeType);
  const width = node.width ?? (type === 'image' ? DEFAULT_IMAGE_WIDTH : DEFAULT_MARKDOWN_WIDTH);
  const height = node.height ?? (type === 'image' ? DEFAULT_IMAGE_HEIGHT : DEFAULT_MARKDOWN_HEIGHT);

  return {
    id: node.id,
    type,
    position: { x: node.x, y: node.y },
    width,
    height,
    style: { width, height },
    zIndex: node.zIndex,
    data: {
      workspaceId: node.workspaceId,
      nodeType: node.nodeType,
      title: node.title,
      contentMarkdown: node.contentMarkdown,
      contentText: node.contentText,
      assetId: node.assetId,
      color: node.color,
      metadataJson: node.metadataJson,
      zIndex: node.zIndex,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    },
  };
}

function optionalHandleId(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  return value;
}

function parseCanvasEdgeMetadata(value: string | undefined): CanvasEdgeMetadata {
  if (!value) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    const metadata: CanvasEdgeMetadata = {};
    if (record.markerEnd === CANVAS_EDGE_MARKER_END) {
      metadata.markerEnd = CANVAS_EDGE_MARKER_END;
    }
    const sourceHandle = optionalHandleId(record.sourceHandle);
    if (sourceHandle !== undefined) {
      metadata.sourceHandle = sourceHandle;
    }
    const targetHandle = optionalHandleId(record.targetHandle);
    if (targetHandle !== undefined) {
      metadata.targetHandle = targetHandle;
    }
    return metadata;
  } catch {
    return {};
  }
}

function toCanvasEdgeMetadataJson(edge: Edge): string {
  const metadata: CanvasEdgeMetadata = { markerEnd: CANVAS_EDGE_MARKER_END };
  const sourceHandle = optionalHandleId(edge.sourceHandle);
  if (sourceHandle !== undefined) {
    metadata.sourceHandle = sourceHandle;
  }
  const targetHandle = optionalHandleId(edge.targetHandle);
  if (targetHandle !== undefined) {
    metadata.targetHandle = targetHandle;
  }
  return JSON.stringify(metadata);
}

/** Product payload only. Drops selected / dragging and other renderer fields. */
export function toPersistedCanvasEdge(edge: Edge): CanvasEdgeInput {
  const persisted: CanvasEdgeInput = {
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    edgeType: optionalString(edge.type) ?? DEFAULT_CANVAS_EDGE_TYPE,
    metadataJson: toCanvasEdgeMetadataJson(edge),
  };
  const label = typeof edge.label === 'string' ? edge.label : undefined;
  if (label !== undefined) {
    persisted.label = label;
  }
  return persisted;
}

export type CanvasConnectionLike = {
  source?: string | null;
  target?: string | null;
};

/** Same directed pair only. Handles are ignored so a second A→B line cannot hit the unique index. */
export function isValidCanvasConnection(
  connection: CanvasConnectionLike,
  existingEdges: CanvasConnectionLike[],
): boolean {
  const source = connection.source;
  const target = connection.target;
  if (!source || !target || source === target) {
    return false;
  }
  return !existingEdges.some((edge) => edge.source === source && edge.target === target);
}

export function fromPersistedCanvasEdge(edge: CanvasEdge): Edge {
  const metadata = parseCanvasEdgeMetadata(edge.metadataJson);
  const restored: Edge = {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: edge.edgeType || DEFAULT_CANVAS_EDGE_TYPE,
    markerEnd: canvasEdgeArrowMarker(),
  };
  if (edge.label !== undefined) {
    restored.label = edge.label;
  }
  if (metadata.sourceHandle !== undefined) {
    restored.sourceHandle = metadata.sourceHandle;
  }
  if (metadata.targetHandle !== undefined) {
    restored.targetHandle = metadata.targetHandle;
  }
  return restored;
}

export function toCanvasNodeInput(node: CanvasNode): CanvasNodeInput {
  return {
    id: node.id,
    nodeType: node.nodeType,
    title: node.title,
    contentMarkdown: node.contentMarkdown,
    contentText: node.contentText,
    assetId: node.assetId,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    color: node.color,
    metadataJson: node.metadataJson,
    zIndex: node.zIndex,
  };
}

export function toCanvasEdgeInput(edge: CanvasEdge): CanvasEdgeInput {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    label: edge.label,
    edgeType: edge.edgeType,
    metadataJson: edge.metadataJson,
  };
}

export function productNodeFromInput(
  workspaceId: string,
  input: CanvasNodeInput,
  existing?: CanvasNode,
): CanvasNode {
  const now = new Date().toISOString();
  return {
    id: input.id ?? existing?.id ?? cryptoRandomId(),
    workspaceId,
    nodeType: input.nodeType,
    title: input.title,
    contentMarkdown: input.contentMarkdown,
    contentText: input.contentText,
    assetId: input.assetId,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    color: input.color,
    metadataJson: input.metadataJson,
    zIndex: input.zIndex ?? existing?.zIndex ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
