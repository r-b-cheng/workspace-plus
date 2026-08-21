import { describe, expect, it } from 'vitest';

import {
  boundingBox,
  moveElement,
  moveLineEndpoint,
  resizeElement,
  unionBoundingBoxes,
} from '@/features/canvas/scene-transform';
import type {
  CanvasSceneLineElement,
  CanvasScenePathElement,
  CanvasSceneRectElement,
  CanvasSceneTextElement,
} from '@/lib/types';

const rect = (patch?: Partial<CanvasSceneRectElement>): CanvasSceneRectElement => ({
  id: 'r',
  type: 'rect',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  ...patch,
});

const line = (patch?: Partial<CanvasSceneLineElement>): CanvasSceneLineElement => ({
  id: 'l',
  type: 'line',
  x1: 0,
  y1: 0,
  x2: 10,
  y2: 4,
  ...patch,
});

const path = (patch?: Partial<CanvasScenePathElement>): CanvasScenePathElement => ({
  id: 'p',
  type: 'path',
  points: [
    [0, 0],
    [4, 2],
    [8, 1],
  ],
  ...patch,
});

describe('scene-transform', () => {
  it('平移 rect', () => {
    expect(moveElement(rect(), 5, -3)).toEqual(rect({ x: 15, y: 17 }));
  });

  it('se 手柄拉大 rect', () => {
    const next = resizeElement(rect(), 'se', { x: 160, y: 90 }, { keepAspect: false });
    expect(next).toMatchObject({ type: 'rect', x: 10, y: 20, width: 150, height: 70 });
  });

  it('Shift 保持比例', () => {
    const next = resizeElement(rect(), 'se', { x: 160, y: 90 }, { keepAspect: true });
    expect(next).toMatchObject({ type: 'rect', x: 10, y: 20, width: 150, height: 75 });
  });

  it('平移 line 两端', () => {
    expect(moveElement(line(), 3, 2)).toEqual(line({ x1: 3, y1: 2, x2: 13, y2: 6 }));
  });

  it('平移 path 所有点', () => {
    const next = moveElement(path(), 1, -1);
    expect(next.type).toBe('path');
    if (next.type !== 'path') {
      return;
    }
    expect(next.points).toEqual([
      [1, -1],
      [5, 1],
      [9, 0],
    ]);
  });

  it('line 端点改形状，Shift 锁轴', () => {
    const next = moveLineEndpoint(line(), 'end', { x: 20, y: 18 }, { lockAxis: true });
    expect(next).toMatchObject({ x1: 0, y1: 0, x2: 20, y2: 0 });
  });

  it('path 角手柄相对对边锚点等比缩放全部点', () => {
    const source = path({
      points: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    });
    const next = resizeElement(source, 'se', { x: 20, y: 20 }, { keepAspect: true });
    expect(next.type).toBe('path');
    if (next.type !== 'path') {
      return;
    }
    expect(next.points).toEqual([
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ]);
    expect(boundingBox(next)).toMatchObject({ x: 0, y: 0, width: 20, height: 20 });
  });

  it('text 角手柄改字号且不低于 10', () => {
    const source: CanvasSceneTextElement = { id: 't', type: 'text', x: 0, y: 0, text: '字', fontSize: 16 };
    const next = resizeElement(source, 'se', { x: 0.1, y: 0.1 });
    expect(next.type).toBe('text');
    if (next.type !== 'text') {
      return;
    }
    expect(next.fontSize).toBe(10);
  });

  it('合并多块包围盒', () => {
    expect(unionBoundingBoxes([])).toBeNull();
    expect(
      unionBoundingBoxes([
        { x: 0, y: 0, width: 10, height: 8 },
        { x: 20, y: -4, width: 5, height: 6 },
      ]),
    ).toEqual({ x: 0, y: -4, width: 25, height: 12 });
  });
});
