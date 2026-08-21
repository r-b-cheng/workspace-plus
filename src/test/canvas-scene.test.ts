import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasApi } from '@/features/api/canvas-api';
import { AppApiError } from '@/features/api/tauri-client';
import { emptyCanvasScene, inkColor, normalizeCanvasScene } from '@/features/canvas/scene';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
import type { CanvasScene, CanvasScenePathElement } from '@/lib/types';
import { mockCanvas, mockCanvasScene } from '@/test/fixtures';

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

describe('canvas scene 规范化', () => {
  it('空 scene 是 version 1 空数组', () => {
    expect(emptyCanvasScene()).toEqual({ version: 1, elements: [] });
    expect(normalizeCanvasScene(undefined)).toEqual({ version: 1, elements: [] });
    expect(normalizeCanvasScene({ version: 9, elements: [] })).toEqual({ version: 1, elements: [] });
  });

  it('丢掉 selected / dragging，并丢弃非法 type', () => {
    const scene = normalizeCanvasScene({
      version: 3,
      drawingTool: 'pen',
      selectedElementIds: ['el-1'],
      elements: [
        {
          id: 'el-1',
          type: 'path',
          points: [
            [120, 80],
            [160, 90],
          ],
          color: '#176bff',
          selected: true,
          dragging: false,
          hovered: true,
        },
        { id: 'bad', type: 'laser', points: [[0, 0]] },
        { id: 'missing', type: 'rect', x: 1 },
      ],
    });

    expect(scene.version).toBe(1);
    expect(scene.elements).toHaveLength(1);
    expect(scene.elements[0]).toEqual({
      id: 'el-1',
      type: 'path',
      points: [
        [120, 80],
        [160, 90],
      ],
      color: '#176bff',
    });
    expect(JSON.stringify(scene)).not.toContain('selected');
    expect(JSON.stringify(scene)).not.toContain('dragging');
    expect(JSON.stringify(scene)).not.toContain('drawingTool');
  });

  it('line 往返，非法 type 仍丢弃', () => {
    const scene = normalizeCanvasScene({
      version: 1,
      elements: [
        {
          id: 'el-line',
          type: 'line',
          x1: 10,
          y1: 20,
          x2: 80,
          y2: 20,
          color: '#172033',
          strokeWidth: 2,
        },
        { id: 'bad', type: 'laser', points: [[0, 0]] },
      ],
    });

    expect(scene).toEqual({
      version: 1,
      elements: [
        {
          id: 'el-line',
          type: 'line',
          x1: 10,
          y1: 20,
          x2: 80,
          y2: 20,
          color: '#172033',
          strokeWidth: 2,
        },
      ],
    });
    expect(JSON.stringify(scene)).not.toContain('laser');
    expect(JSON.stringify(scene)).not.toContain('markerEnd');
    expect(normalizeCanvasScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  });

  it('rect/ellipse 缺省描边是产品黑，path 仍是蓝；已有 color 不改', () => {
    expect(inkColor({ type: 'rect' })).toBe('#172033');
    expect(inkColor({ type: 'ellipse' })).toBe('#172033');
    expect(inkColor({ type: 'line' })).toBe('#172033');
    expect(inkColor({ type: 'arrow' })).toBe('#172033');
    expect(inkColor({ type: 'text' })).toBe('#172033');
    expect(inkColor({ type: 'path' })).toBe('#176bff');
    expect(inkColor({ type: 'rect', color: '#176bff' })).toBe('#176bff');
    expect(inkColor({ type: 'ellipse', color: '#ff8800' })).toBe('#ff8800');
  });
});

describe('canvas store scene 隔离与保存', () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
    vi.mocked(canvasApi.getCanvas).mockReset();
    vi.mocked(canvasApi.saveCanvas).mockReset();
    vi.mocked(canvasApi.readCanvasAsset).mockReset();
    vi.mocked(canvasApi.readCanvasAsset).mockRejectedValue(new AppApiError('NotFound', 'asset not found'));
  });

  it('切换工作区 A/B 后 scene 互不串数据', async () => {
    const pathA: CanvasScenePathElement = {
      id: 'el-a',
      type: 'path',
      points: [
        [10, 10],
        [20, 16],
      ],
      color: '#176bff',
    };
    vi.mocked(canvasApi.getCanvas).mockImplementation(async ({ workspaceId }) => {
      if (workspaceId === 'ws-a') {
        return mockCanvas({
          workspaceId: 'ws-a',
          scene: mockCanvasScene({ elements: [pathA] }),
        });
      }
      return mockCanvas({ workspaceId: 'ws-b', scene: mockCanvasScene() });
    });

    await useCanvasStore.getState().loadCanvas('ws-a');
    expect(useCanvasStore.getState().scene.elements.map((element) => element.id)).toEqual(['el-a']);

    const loadB = useCanvasStore.getState().loadCanvas('ws-b');
    expect(useCanvasStore.getState().workspaceId).toBe('ws-b');
    expect(useCanvasStore.getState().scene.elements).toEqual([]);
    await loadB;
    expect(useCanvasStore.getState().scene).toEqual({ version: 1, elements: [] });
    expect(useCanvasStore.getState().scene.elements.some((element) => element.id === 'el-a')).toBe(false);
  });

  it('upsertSceneElements 后 flushSave 带上规范化 scene，不含 selected', async () => {
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1' }));
    const savedScene: CanvasScene = {
      version: 1,
      elements: [
        {
          id: 'el-1',
          type: 'path',
          points: [
            [0, 0],
            [8, 6],
          ],
          color: '#176bff',
          strokeWidth: 2,
        },
      ],
    };
    vi.mocked(canvasApi.saveCanvas).mockResolvedValue(
      mockCanvas({ workspaceId: 'ws-1', scene: savedScene, updatedAt: '2026-08-21T08:00:00Z' }),
    );

    await useCanvasStore.getState().loadCanvas('ws-1');
    useCanvasStore.getState().upsertSceneElements([
      {
        id: 'el-1',
        type: 'path',
        points: [
          [0, 0],
          [8, 6],
        ],
        color: '#176bff',
        strokeWidth: 2,
        // renderer-only fields must not be persisted
        ...({ selected: true, dragging: true } as object),
      } as CanvasScenePathElement,
    ]);

    expect(useCanvasStore.getState().dirty).toBe(true);
    await useCanvasStore.getState().flushSave();

    expect(canvasApi.saveCanvas).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(canvasApi.saveCanvas).mock.calls[0]?.[0];
    expect(payload?.scene).toEqual(savedScene);
    expect(JSON.stringify(payload?.scene)).not.toContain('selected');
    expect(JSON.stringify(payload?.scene)).not.toContain('dragging');
    expect(useCanvasStore.getState().saveStatus).toBe('saved');
  });
});
