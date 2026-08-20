import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { fromPersistedCanvasNode, toPersistedCanvasNode } from '@/features/canvas/persist';
import { mockCanvasNode } from '@/test/fixtures';

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
