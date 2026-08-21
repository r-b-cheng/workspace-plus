import { MarkerType } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasApi } from '@/features/api/canvas-api';
import { AppApiError } from '@/features/api/tauri-client';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import type { Canvas } from '@/lib/types';
import { mockCanvas, mockCanvasEdge, mockCanvasNode } from '@/test/fixtures';

vi.mock('@/features/api/canvas-api', () => ({
  canvasApi: {
    getCanvas: vi.fn(),
    saveCanvas: vi.fn(),
    upsertCanvasNode: vi.fn(),
    deleteCanvasNode: vi.fn(),
    saveCanvasAsset: vi.fn(),
    readCanvasAsset: vi.fn(),
  },
}));

describe('canvas store 工作区隔离与保存重试', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    vi.mocked(canvasApi.getCanvas).mockReset();
    vi.mocked(canvasApi.saveCanvas).mockReset();
    vi.mocked(canvasApi.readCanvasAsset).mockReset();
    vi.mocked(canvasApi.readCanvasAsset).mockRejectedValue(new AppApiError('NotFound', 'asset not found'));
  });

  it('切换工作区 A/B 后节点互不串数据', async () => {
    const nodeA = mockCanvasNode({ id: 'n-a', workspaceId: 'ws-a', contentMarkdown: 'A' });
    const nodeB = mockCanvasNode({ id: 'n-b', workspaceId: 'ws-b', contentMarkdown: 'B' });
    vi.mocked(canvasApi.getCanvas).mockImplementation(async ({ workspaceId }) => {
      if (workspaceId === 'ws-a') {
        return mockCanvas({ workspaceId: 'ws-a', nodes: [nodeA] });
      }
      return mockCanvas({ workspaceId: 'ws-b', nodes: [nodeB] });
    });

    await useCanvasStore.getState().loadCanvas('ws-a');
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['n-a']);
    expect(useCanvasStore.getState().nodes[0]?.contentMarkdown).toBe('A');

    await useCanvasStore.getState().loadCanvas('ws-b');
    expect(useCanvasStore.getState().workspaceId).toBe('ws-b');
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['n-b']);
    expect(useCanvasStore.getState().nodes[0]?.contentMarkdown).toBe('B');
    expect(useCanvasStore.getState().nodes.some((node) => node.workspaceId === 'ws-a')).toBe(false);
  });

  it('较慢的工作区 A 响应不会覆盖已切到 B 的画布', async () => {
    const nodeA = mockCanvasNode({ id: 'n-a', workspaceId: 'ws-a' });
    const nodeB = mockCanvasNode({ id: 'n-b', workspaceId: 'ws-b' });
    let resolveA!: (canvas: Canvas) => void;
    const pendingA = new Promise<Canvas>((resolve) => {
      resolveA = resolve;
    });

    vi.mocked(canvasApi.getCanvas).mockImplementation(async ({ workspaceId }) => {
      if (workspaceId === 'ws-a') {
        return pendingA;
      }
      return mockCanvas({ workspaceId: 'ws-b', nodes: [nodeB] });
    });

    const loadA = useCanvasStore.getState().loadCanvas('ws-a');
    await useCanvasStore.getState().loadCanvas('ws-b');
    resolveA(mockCanvas({ workspaceId: 'ws-a', nodes: [nodeA] }));
    await loadA;

    expect(useCanvasStore.getState().workspaceId).toBe('ws-b');
    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['n-b']);
  });

  it('loadCanvas 未完成时本地已新建的卡片，get_canvas 回包不能清掉', async () => {
    let resolveCanvas!: (canvas: Canvas) => void;
    vi.mocked(canvasApi.getCanvas).mockImplementation(
      () =>
        new Promise<Canvas>((resolve) => {
          resolveCanvas = resolve;
        }),
    );

    const loadPromise = useCanvasStore.getState().loadCanvas('ws-1');
    await Promise.resolve();
    expect(useCanvasStore.getState().canvasLoading).toBe(true);

    const localCard = mockCanvasNode({
      id: 'local-new',
      workspaceId: 'ws-1',
      contentMarkdown: '本地新建',
    });
    useCanvasStore.setState({ nodes: [localCard], dirty: true });

    resolveCanvas(
      mockCanvas({
        workspaceId: 'ws-1',
        nodes: [mockCanvasNode({ id: 'server-old', workspaceId: 'ws-1', contentMarkdown: '服务端快照' })],
      }),
    );
    await loadPromise;

    expect(useCanvasStore.getState().nodes.map((node) => node.id)).toEqual(['local-new']);
    expect(useCanvasStore.getState().nodes[0]?.contentMarkdown).toBe('本地新建');
    expect(useCanvasStore.getState().dirty).toBe(true);
    expect(useCanvasStore.getState().canvasLoading).toBe(false);
  });

  it('保存失败后可重试', async () => {
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1', nodes: [], edges: [] }));
    vi.mocked(canvasApi.saveCanvas)
      .mockRejectedValueOnce(new AppApiError('Internal', 'disk full'))
      .mockResolvedValueOnce(
        mockCanvas({
          workspaceId: 'ws-1',
          nodes: [mockCanvasNode({ id: 'created', workspaceId: 'ws-1' })],
          updatedAt: '2026-08-20T12:00:00Z',
        }),
      );

    await useCanvasStore.getState().loadCanvas('ws-1');
    const created = useCanvasStore.getState().createMarkdownCard();
    expect(created?.workspaceId).toBe('ws-1');

    await useCanvasStore.getState().flushSave();
    expect(useCanvasStore.getState().saveStatus).toBe('save-failed');
    expect(useCanvasStore.getState().dirty).toBe(true);

    await useCanvasStore.getState().retrySave();
    expect(useCanvasStore.getState().saveStatus).toBe('saved');
    expect(useCanvasStore.getState().lastSavedAt).toBe('2026-08-20T12:00:00Z');
    expect(canvasApi.saveCanvas).toHaveBeenCalledTimes(2);
  });

  it('applyFlowEdges 增加一条边并会 saveCanvas', async () => {
    const nodeA = mockCanvasNode({ id: 'n-1', workspaceId: 'ws-1' });
    const nodeB = mockCanvasNode({ id: 'n-2', workspaceId: 'ws-1', x: 360 });
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(
      mockCanvas({ workspaceId: 'ws-1', nodes: [nodeA, nodeB], edges: [] }),
    );
    vi.mocked(canvasApi.saveCanvas).mockResolvedValue(
      mockCanvas({
        workspaceId: 'ws-1',
        nodes: [nodeA, nodeB],
        edges: [
          mockCanvasEdge({
            id: 'e-new',
            workspaceId: 'ws-1',
            sourceNodeId: 'n-1',
            targetNodeId: 'n-2',
          }),
        ],
        updatedAt: '2026-08-21T06:00:00Z',
      }),
    );

    await useCanvasStore.getState().loadCanvas('ws-1');
    useCanvasStore.getState().applyFlowEdges([
      {
        id: 'e-new',
        source: 'n-1',
        target: 'n-2',
        sourceHandle: 'right',
        targetHandle: 'left',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    ]);

    expect(useCanvasStore.getState().edges).toHaveLength(1);
    expect(useCanvasStore.getState().edges[0]).toMatchObject({
      id: 'e-new',
      workspaceId: 'ws-1',
      sourceNodeId: 'n-1',
      targetNodeId: 'n-2',
      edgeType: 'smoothstep',
    });
    expect(JSON.parse(useCanvasStore.getState().edges[0]?.metadataJson ?? '{}')).toEqual({
      markerEnd: 'arrowclosed',
      sourceHandle: 'right',
      targetHandle: 'left',
    });
    expect(useCanvasStore.getState().dirty).toBe(true);

    await useCanvasStore.getState().flushSave();
    expect(canvasApi.saveCanvas).toHaveBeenCalledTimes(1);
    expect(canvasApi.saveCanvas).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      nodes: expect.any(Array),
      edges: [
        expect.objectContaining({
          id: 'e-new',
          sourceNodeId: 'n-1',
          targetNodeId: 'n-2',
          edgeType: 'smoothstep',
          metadataJson: '{"markerEnd":"arrowclosed","sourceHandle":"right","targetHandle":"left"}',
        }),
      ],
      scene: { version: 1, elements: [] },
    });
    expect(useCanvasStore.getState().saveStatus).toBe('saved');
  });

  it('setMarkdownFontSize 合并已有 metadata 并会 saveCanvas', async () => {
    const node = mockCanvasNode({
      id: 'n-1',
      workspaceId: 'ws-1',
      metadataJson: '{"pinned":true}',
    });
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1', nodes: [node], edges: [] }));
    vi.mocked(canvasApi.saveCanvas).mockResolvedValue(
      mockCanvas({
        workspaceId: 'ws-1',
        nodes: [
          mockCanvasNode({
            id: 'n-1',
            workspaceId: 'ws-1',
            metadataJson: '{"pinned":true,"fontSize":16}',
          }),
        ],
        updatedAt: '2026-08-21T07:00:00Z',
      }),
    );

    await useCanvasStore.getState().loadCanvas('ws-1');
    useCanvasStore.getState().setMarkdownFontSize('n-1', 16);

    expect(JSON.parse(useCanvasStore.getState().nodes[0]?.metadataJson ?? '{}')).toEqual({
      pinned: true,
      fontSize: 16,
    });
    expect(useCanvasStore.getState().dirty).toBe(true);

    await useCanvasStore.getState().flushSave();
    expect(canvasApi.saveCanvas).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(canvasApi.saveCanvas).mock.calls[0]?.[0];
    expect(payload?.workspaceId).toBe('ws-1');
    expect(JSON.parse(payload?.nodes[0]?.metadataJson ?? '{}')).toEqual({
      pinned: true,
      fontSize: 16,
    });
    expect(useCanvasStore.getState().saveStatus).toBe('saved');
  });

  it('setMarkdownFontSize 非法字号回落 13，不改图片卡片', async () => {
    const markdown = mockCanvasNode({
      id: 'n-md',
      workspaceId: 'ws-1',
      metadataJson: '{"fontSize":20,"note":"keep"}',
    });
    const image = mockCanvasNode({
      id: 'n-img',
      workspaceId: 'ws-1',
      nodeType: 'image',
      metadataJson: '{"alt":"cover"}',
    });
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(
      mockCanvas({ workspaceId: 'ws-1', nodes: [markdown, image], edges: [] }),
    );

    await useCanvasStore.getState().loadCanvas('ws-1');
    useCanvasStore.getState().setMarkdownFontSize('n-md', 99);
    useCanvasStore.getState().setMarkdownFontSize('n-img', 24);

    const nodes = useCanvasStore.getState().nodes;
    expect(JSON.parse(nodes.find((node) => node.id === 'n-md')?.metadataJson ?? '{}')).toEqual({
      fontSize: 13,
      note: 'keep',
    });
    expect(JSON.parse(nodes.find((node) => node.id === 'n-img')?.metadataJson ?? '{}')).toEqual({
      alt: 'cover',
    });
  });
});
