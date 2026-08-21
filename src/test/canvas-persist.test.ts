import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  fromPersistedCanvasEdge,
  fromPersistedCanvasNode,
  isValidCanvasConnection,
  mergeMarkdownFontSize,
  parseMarkdownFontSize,
  toPersistedCanvasEdge,
  toPersistedCanvasNode,
} from '@/features/canvas/persist';
import { mockCanvasEdge, mockCanvasNode } from '@/test/fixtures';

describe('toPersistedCanvasNode', () => {
  it('不包含 selected / dragging / measured / resizing 等渲染字段', () => {
    const flowNode = {
      id: 'n1',
      type: 'markdown',
      position: { x: 12, y: 34 },
      selected: true,
      dragging: true,
      resizing: true,
      measured: { width: 111, height: 222 },
      width: 280,
      height: 200,
      data: {
        workspaceId: 'ws-a',
        nodeType: 'markdown',
        title: '笔记',
        contentMarkdown: '# hi',
        zIndex: 2,
        imageUrl: 'data:image/png;base64,xx',
        imageMissing: false,
      },
    } as Node;

    const persisted = toPersistedCanvasNode(flowNode, 'ws-a');
    const keys = Object.keys(persisted);

    expect(keys).not.toContain('selected');
    expect(keys).not.toContain('dragging');
    expect(keys).not.toContain('measured');
    expect(keys).not.toContain('resizing');
    expect(keys).not.toContain('imageUrl');
    expect(keys).not.toContain('imageMissing');
    expect(persisted).toMatchObject({
      id: 'n1',
      nodeType: 'markdown',
      title: '笔记',
      contentMarkdown: '# hi',
      x: 12,
      y: 34,
      width: 280,
      height: 200,
      zIndex: 2,
    });
    expect(JSON.stringify(persisted)).not.toContain('"selected"');
    expect(JSON.stringify(persisted)).not.toContain('"dragging"');
    expect(JSON.stringify(persisted)).not.toContain('"measured"');
    expect(JSON.stringify(persisted)).not.toContain('"resizing"');
  });
});

describe('fromPersistedCanvasNode', () => {
  it('恢复产品字段且不补渲染态', () => {
    const flow = fromPersistedCanvasNode(
      mockCanvasNode({
        id: 'n-a',
        workspaceId: 'ws-a',
        contentMarkdown: '工作区 A',
      }),
    );

    expect(flow.data.workspaceId).toBe('ws-a');
    expect(flow.data.contentMarkdown).toBe('工作区 A');
    expect(flow).not.toHaveProperty('selected');
    expect(flow).not.toHaveProperty('dragging');
    expect(flow).not.toHaveProperty('measured');
    expect(flow).not.toHaveProperty('resizing');
  });

  it('metadataJson.fontSize 往返保留，且不写入 selected / dragging', () => {
    const flow = fromPersistedCanvasNode(
      mockCanvasNode({
        id: 'n-font',
        workspaceId: 'ws-a',
        metadataJson: '{"fontSize":16,"pinned":true}',
      }),
    );

    expect(parseMarkdownFontSize(flow.data.metadataJson)).toBe(16);
    expect(JSON.parse(flow.data.metadataJson ?? '{}')).toEqual({ fontSize: 16, pinned: true });

    const persisted = toPersistedCanvasNode(
      {
        ...flow,
        selected: true,
        dragging: true,
      },
      'ws-a',
    );

    expect(JSON.parse(persisted.metadataJson ?? '{}')).toEqual({ fontSize: 16, pinned: true });
    expect(JSON.stringify(persisted)).not.toContain('"selected"');
    expect(JSON.stringify(persisted)).not.toContain('"dragging"');
  });

  it('工作区 A/B 的转换结果互不串数据', () => {
    const nodeA = fromPersistedCanvasNode(
      mockCanvasNode({ id: 'n-a', workspaceId: 'ws-a', contentMarkdown: 'A 正文' }),
    );
    const nodeB = fromPersistedCanvasNode(
      mockCanvasNode({ id: 'n-b', workspaceId: 'ws-b', contentMarkdown: 'B 正文', nodeType: 'image', assetId: 'asset-b' }),
    );

    expect(toPersistedCanvasNode(nodeA, 'ws-a')).toMatchObject({
      id: 'n-a',
      contentMarkdown: 'A 正文',
    });
    expect(toPersistedCanvasNode(nodeB, 'ws-b')).toMatchObject({
      id: 'n-b',
      nodeType: 'image',
      assetId: 'asset-b',
      contentMarkdown: 'B 正文',
    });
    expect(nodeA.data.workspaceId).toBe('ws-a');
    expect(nodeB.data.workspaceId).toBe('ws-b');
    expect(nodeA.data.contentMarkdown).not.toBe(nodeB.data.contentMarkdown);
  });
});

describe('toPersistedCanvasEdge / fromPersistedCanvasEdge', () => {
  it('箭头样式往返，且不入库 selected / dragging', () => {
    const flowEdge = {
      id: 'e-1',
      source: 'n-1',
      target: 'n-2',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'smoothstep',
      label: '相关',
      markerEnd: { type: MarkerType.ArrowClosed },
      selected: true,
      dragging: true,
    } as Edge;

    const persisted = toPersistedCanvasEdge(flowEdge);
    const keys = Object.keys(persisted);

    expect(keys).not.toContain('selected');
    expect(keys).not.toContain('dragging');
    expect(keys).not.toContain('markerEnd');
    expect(persisted).toMatchObject({
      id: 'e-1',
      sourceNodeId: 'n-1',
      targetNodeId: 'n-2',
      label: '相关',
      edgeType: 'smoothstep',
    });
    expect(JSON.parse(persisted.metadataJson ?? '{}')).toEqual({
      markerEnd: 'arrowclosed',
      sourceHandle: 'right',
      targetHandle: 'left',
    });
    expect(JSON.stringify(persisted)).not.toContain('"selected"');
    expect(JSON.stringify(persisted)).not.toContain('"dragging"');

    const restored = fromPersistedCanvasEdge(
      mockCanvasEdge({
        id: persisted.id,
        sourceNodeId: persisted.sourceNodeId,
        targetNodeId: persisted.targetNodeId,
        label: persisted.label,
        edgeType: persisted.edgeType ?? 'smoothstep',
        metadataJson: persisted.metadataJson,
      }),
    );

    expect(restored).toMatchObject({
      id: 'e-1',
      source: 'n-1',
      target: 'n-2',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'smoothstep',
      label: '相关',
      markerEnd: { type: MarkerType.ArrowClosed },
    });
    expect(restored).not.toHaveProperty('selected');
    expect(restored).not.toHaveProperty('dragging');
  });

  it('没有 metadataJson 的旧边读回时仍补上实心箭头', () => {
    const restored = fromPersistedCanvasEdge(
      mockCanvasEdge({
        edgeType: 'default',
        metadataJson: undefined,
      }),
    );

    expect(restored.type).toBe('default');
    expect(restored.markerEnd).toEqual({ type: MarkerType.ArrowClosed });
  });
});

describe('parseMarkdownFontSize / mergeMarkdownFontSize', () => {
  it('只接受 13 / 16 / 20 / 24，非法回落 13', () => {
    expect(parseMarkdownFontSize(undefined)).toBe(13);
    expect(parseMarkdownFontSize('{"fontSize":13}')).toBe(13);
    expect(parseMarkdownFontSize('{"fontSize":16}')).toBe(16);
    expect(parseMarkdownFontSize('{"fontSize":20}')).toBe(20);
    expect(parseMarkdownFontSize('{"fontSize":24}')).toBe(24);
    expect(parseMarkdownFontSize('{"fontSize":18}')).toBe(13);
    expect(parseMarkdownFontSize('{"fontSize":"16"}')).toBe(13);
    expect(parseMarkdownFontSize('{"fontSize":null}')).toBe(13);
    expect(parseMarkdownFontSize('not-json')).toBe(13);
    expect(parseMarkdownFontSize('[]')).toBe(13);
  });

  it('改字号时合并已有 metadata，不整份覆盖', () => {
    expect(JSON.parse(mergeMarkdownFontSize('{"pinned":true,"colorHint":"warm"}', 20))).toEqual({
      pinned: true,
      colorHint: 'warm',
      fontSize: 20,
    });
    expect(JSON.parse(mergeMarkdownFontSize(undefined, 16))).toEqual({ fontSize: 16 });
  });
});

describe('isValidCanvasConnection', () => {
  it('拒绝连到自己，以及同一对卡片的重复边', () => {
    expect(isValidCanvasConnection({ source: 'n-1', target: 'n-1' }, [])).toBe(false);
    expect(isValidCanvasConnection({ source: 'n-1', target: 'n-2' }, [])).toBe(true);
    expect(isValidCanvasConnection({ source: 'n-1', target: 'n-2' }, [{ source: 'n-1', target: 'n-2' }])).toBe(
      false,
    );
    expect(isValidCanvasConnection({ source: 'n-2', target: 'n-1' }, [{ source: 'n-1', target: 'n-2' }])).toBe(
      true,
    );
  });
});
