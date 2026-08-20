import { callCommand } from '@/features/api/tauri-client';
import type {
  Asset,
  Canvas,
  CanvasAssetContent,
  CanvasNode,
  DeleteCanvasNodeInput,
  GetCanvasInput,
  ReadCanvasAssetInput,
  SaveCanvasAssetInput,
  SaveCanvasInput,
  UpsertCanvasNodeInput,
} from '@/lib/types';

export const canvasApi = {
  getCanvas(input: GetCanvasInput): Promise<Canvas> {
    return callCommand<Canvas>('get_canvas', { workspaceId: input.workspaceId });
  },

  saveCanvas(input: SaveCanvasInput): Promise<Canvas> {
    return callCommand<Canvas>('save_canvas', {
      workspaceId: input.workspaceId,
      nodes: input.nodes,
      edges: input.edges,
    });
  },

  upsertCanvasNode(input: UpsertCanvasNodeInput): Promise<CanvasNode> {
    return callCommand<CanvasNode>('upsert_canvas_node', {
      workspaceId: input.workspaceId,
      node: input.node,
    });
  },

  deleteCanvasNode(input: DeleteCanvasNodeInput): Promise<void> {
    return callCommand<void>('delete_canvas_node', {
      workspaceId: input.workspaceId,
      nodeId: input.nodeId,
    });
  },

  saveCanvasAsset(input: SaveCanvasAssetInput): Promise<Asset> {
    return callCommand<Asset>('save_canvas_asset', {
      fileName: input.fileName,
      contentBase64: input.contentBase64,
      mimeType: input.mimeType,
      source: input.source,
      workspaceId: input.workspaceId,
    });
  },

  readCanvasAsset(input: ReadCanvasAssetInput): Promise<CanvasAssetContent> {
    return callCommand<CanvasAssetContent>('read_canvas_asset', {
      assetId: input.assetId,
    });
  },
};
