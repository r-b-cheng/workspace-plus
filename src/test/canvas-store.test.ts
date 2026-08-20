import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasApi } from '@/features/api/canvas-api';
import { AppApiError } from '@/features/api/tauri-client';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import type { Canvas } from '@/lib/types';
import { mockCanvas, mockCanvasNode } from '@/test/fixtures';

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
});
