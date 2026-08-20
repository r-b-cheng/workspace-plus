import type { Edge, Node } from '@xyflow/react';

import type { CanvasEdge, CanvasEdgeInput, CanvasNode, CanvasNodeInput, CanvasNodeType } from '@/lib/types';

export const DEFAULT_MARKDOWN_WIDTH = 280;
export const DEFAULT_MARKDOWN_HEIGHT = 200;
export const DEFAULT_IMAGE_WIDTH = 240;
export const DEFAULT_IMAGE_HEIGHT = 180;

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

export function toPersistedCanvasEdge(edge: Edge): CanvasEdgeInput {
  return {
    id: edge.id,
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    edgeType: edge.type,
  };
}

export function fromPersistedCanvasEdge(edge: CanvasEdge): Edge {
  return {
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label,
    type: edge.edgeType,
  };
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
