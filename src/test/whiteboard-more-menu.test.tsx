import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canvasApi } from '@/features/api/canvas-api';
import { WhiteboardPanel } from '@/features/canvas/components/whiteboard-panel';
import { useCanvasStore } from '@/features/canvas/store/canvas-store';
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

describe('白板更多菜单', () => {
  beforeEach(async () => {
    useCanvasStore.getState().reset();
    vi.mocked(canvasApi.getCanvas).mockResolvedValue(
      mockCanvas({ workspaceId: 'ws-1', nodes: [mockCanvasNode()] }),
    );
    vi.mocked(canvasApi.saveCanvas).mockResolvedValue(mockCanvas({ workspaceId: 'ws-1' }));
    vi.mocked(canvasApi.saveCanvasAsset).mockResolvedValue({
      id: 'asset-1',
      assetType: 'canvas_image',
      mimeType: 'image/png',
      fileName: 'shot.png',
      storagePath: 'asset-1.png',
      source: 'manual_import',
      createdAt: '2026-08-21T10:00:00Z',
    });
    await useCanvasStore.getState().loadCanvas('ws-1');
  });

  it('三个点打开适应画布和添加图片', async () => {
    const user = userEvent.setup();
    render(<WhiteboardPanel workspaceId="ws-1" />);

    await user.click(screen.getByTestId('whiteboard-more-button'));
    expect(screen.getByTestId('whiteboard-fit-view')).toHaveTextContent('适应画布');
    expect(screen.getByTestId('whiteboard-add-image')).toHaveTextContent('添加图片');

    await user.click(screen.getByTestId('whiteboard-fit-view'));
    expect(screen.queryByTestId('whiteboard-fit-view')).not.toBeInTheDocument();
  });

  it('选文件添加图片按手动导入写入', async () => {
    const user = userEvent.setup();
    render(<WhiteboardPanel workspaceId="ws-1" />);

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('whiteboard-add-image-input'), file);

    await waitFor(() => expect(canvasApi.saveCanvasAsset).toHaveBeenCalled());
    expect(vi.mocked(canvasApi.saveCanvasAsset).mock.calls[0]?.[0]).toMatchObject({
      fileName: 'shot.png',
      source: 'manual_import',
      workspaceId: 'ws-1',
    });
  });
});
