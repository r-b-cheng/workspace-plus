import { create } from 'zustand';
import type { Edge, Node } from '@xyflow/react';

import { canvasApi } from '@/features/api/canvas-api';
import { AppApiError } from '@/features/api/tauri-client';
import {
  cryptoRandomId,
  DEFAULT_IMAGE_HEIGHT,
  DEFAULT_IMAGE_WIDTH,
  DEFAULT_MARKDOWN_HEIGHT,
  DEFAULT_MARKDOWN_WIDTH,
  productNodeFromInput,
  toCanvasEdgeInput,
  toCanvasNodeInput,
  toPersistedCanvasEdge,
  toPersistedCanvasNode,
} from '@/features/canvas/persist';
import { assertImageSize, blobToBase64, isImageFile } from '@/features/canvas/file';
import { userMessageForError } from '@/lib/errors';
import type { CanvasEdge, CanvasNode, CanvasSaveStatus, CommandError } from '@/lib/types';

export const SAVE_DEBOUNCE_MS = 600;

export type CanvasStoreData = {
  workspaceId: string | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  assetUrls: Record<string, string>;
  missingAssets: Record<string, true>;
  saveStatus: CanvasSaveStatus;
  lastSavedAt: string | null;
  canvasLoading: boolean;
  canvasError: CommandError | null;
  dirty: boolean;
};

export type CanvasStore = CanvasStoreData & {
  loadCanvas: (workspaceId: string) => Promise<void>;
  clearCanvas: () => void;
  createMarkdownCard: (position?: { x: number; y: number }) => CanvasNode | null;
  updateNodeFields: (nodeId: string, patch: Partial<Pick<CanvasNode, 'title' | 'contentMarkdown' | 'color'>>) => void;
  deleteNodes: (nodeIds: string[]) => void;
  applyFlowSnapshot: (flowNodes: Node[], flowEdges?: Edge[]) => void;
  applyFlowEdges: (flowEdges: Edge[]) => void;
  addImageFromFile: (
    file: File,
    source: 'clipboard' | 'drag_drop',
    position?: { x: number; y: number },
  ) => Promise<CanvasNode | null>;
  scheduleSave: () => void;
  flushSave: () => Promise<void>;
  retrySave: () => Promise<void>;
  reset: () => void;
};

export const initialCanvasStoreData: CanvasStoreData = {
  workspaceId: null,
  nodes: [],
  edges: [],
  assetUrls: {},
  missingAssets: {},
  saveStatus: 'idle',
  lastSavedAt: null,
  canvasLoading: false,
  canvasError: null,
  dirty: false,
};

let canvasRequestSeq = 0;
let dirtyRevision = 0;
let savingRevision = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let hydrateSeq = 0;

function toCommandError(error: unknown): CommandError {
  if (error instanceof AppApiError) {
    return { code: error.code, message: userMessageForError(error) };
  }
  if (error instanceof Error && error.message) {
    return { code: 'Internal', message: error.message };
  }
  return { code: 'Internal', message: '操作失败，请重试。' };
}

function clearSaveTimer() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function nextZIndex(nodes: CanvasNode[]): number {
  return nodes.reduce((max, node) => Math.max(max, node.zIndex), 0) + 1;
}

function markDirty(set: (partial: Partial<CanvasStoreData>) => void) {
  dirtyRevision += 1;
  set({ dirty: true });
}

function canMutateCanvas(state: CanvasStoreData): state is CanvasStoreData & { workspaceId: string } {
  return Boolean(state.workspaceId) && !state.canvasLoading;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  ...initialCanvasStoreData,

  async loadCanvas(workspaceId) {
    const previous = get();
    if (previous.workspaceId === workspaceId && (previous.dirty || previous.canvasLoading)) {
      return;
    }

    set({ canvasLoading: true, canvasError: null });

    if (previous.workspaceId && previous.workspaceId !== workspaceId && previous.dirty) {
      await get().flushSave();
      const afterFlush = get();
      if (afterFlush.workspaceId !== previous.workspaceId) {
        return;
      }
      if (afterFlush.saveStatus === 'save-failed' || afterFlush.dirty) {
        set({ canvasLoading: false });
        return;
      }
    }

    const seq = ++canvasRequestSeq;
    clearSaveTimer();
    set({
      workspaceId,
      nodes: [],
      edges: [],
      assetUrls: {},
      missingAssets: {},
      canvasLoading: true,
      canvasError: null,
      dirty: false,
      saveStatus: 'idle',
    });

    try {
      const canvas = await canvasApi.getCanvas({ workspaceId });
      if (seq !== canvasRequestSeq || get().workspaceId !== workspaceId) {
        return;
      }
      if (get().dirty) {
        set({ canvasLoading: false });
        get().scheduleSave();
        return;
      }
      set({
        workspaceId: canvas.workspaceId,
        nodes: canvas.nodes,
        edges: canvas.edges,
        canvasLoading: false,
        lastSavedAt: canvas.updatedAt ?? null,
        saveStatus: canvas.nodes.length > 0 || canvas.edges.length > 0 ? 'saved' : 'idle',
        dirty: false,
      });
      void hydrateAssetUrls(canvas.workspaceId, canvas.nodes, set, get);
    } catch (error) {
      if (seq !== canvasRequestSeq || get().workspaceId !== workspaceId) {
        return;
      }
      set({
        canvasLoading: false,
        canvasError: toCommandError(error),
      });
    }
  },

  clearCanvas() {
    canvasRequestSeq += 1;
    hydrateSeq += 1;
    clearSaveTimer();
    dirtyRevision += 1;
    set({ ...initialCanvasStoreData });
  },

  createMarkdownCard(position) {
    const state = get();
    if (!canMutateCanvas(state)) {
      return null;
    }
    const workspaceId = state.workspaceId;
    const now = new Date().toISOString();
    const node: CanvasNode = {
      id: cryptoRandomId(),
      workspaceId,
      nodeType: 'markdown',
      title: '笔记',
      contentMarkdown: '',
      x: position?.x ?? 72 + get().nodes.length * 20,
      y: position?.y ?? 72 + get().nodes.length * 20,
      width: DEFAULT_MARKDOWN_WIDTH,
      height: DEFAULT_MARKDOWN_HEIGHT,
      zIndex: nextZIndex(get().nodes),
      createdAt: now,
      updatedAt: now,
    };
    set({ nodes: [...get().nodes, node], canvasError: null });
    markDirty(set);
    get().scheduleSave();
    return node;
  },

  updateNodeFields(nodeId, patch) {
    const state = get();
    if (!canMutateCanvas(state)) {
      return;
    }
    const workspaceId = state.workspaceId;
    const now = new Date().toISOString();
    let changed = false;
    const nodes = get().nodes.map((node) => {
      if (node.id !== nodeId || node.workspaceId !== workspaceId) {
        return node;
      }
      changed = true;
      return { ...node, ...patch, updatedAt: now };
    });
    if (!changed) {
      return;
    }
    set({ nodes });
    markDirty(set);
    get().scheduleSave();
  },

  deleteNodes(nodeIds) {
    const state = get();
    if (!canMutateCanvas(state) || nodeIds.length === 0) {
      return;
    }
    const workspaceId = state.workspaceId;
    const remove = new Set(nodeIds);
    const nodes = get().nodes.filter((node) => node.workspaceId === workspaceId && !remove.has(node.id));
    const edges = get().edges.filter(
      (edge) => edge.workspaceId === workspaceId && !remove.has(edge.sourceNodeId) && !remove.has(edge.targetNodeId),
    );
    set({ nodes, edges });
    markDirty(set);
    get().scheduleSave();
  },

  applyFlowSnapshot(flowNodes, flowEdges) {
    const state = get();
    if (!canMutateCanvas(state)) {
      return;
    }
    const workspaceId = state.workspaceId;
    const existing = new Map(get().nodes.map((node) => [node.id, node]));
    const nodes = flowNodes
      .filter((node) => {
        const owner = (node.data as { workspaceId?: string } | undefined)?.workspaceId;
        return !owner || owner === workspaceId;
      })
      .map((node) => productNodeFromInput(workspaceId, toPersistedCanvasNode(node, workspaceId), existing.get(node.id)));

    const keepIds = new Set(nodes.map((node) => node.id));
    const edges = flowEdges
      ? flowEdges
          .filter((edge) => keepIds.has(edge.source) && keepIds.has(edge.target))
          .map((edge) => {
            const previous = get().edges.find((item) => item.id === edge.id);
            const input = toPersistedCanvasEdge(edge);
            const now = new Date().toISOString();
            return {
              id: input.id ?? previous?.id ?? cryptoRandomId(),
              workspaceId,
              sourceNodeId: input.sourceNodeId,
              targetNodeId: input.targetNodeId,
              label: input.label,
              edgeType: input.edgeType ?? previous?.edgeType ?? 'default',
              metadataJson: input.metadataJson ?? previous?.metadataJson,
              createdAt: previous?.createdAt ?? now,
              updatedAt: now,
            } satisfies CanvasEdge;
          })
      : get().edges.filter(
          (edge) => edge.workspaceId === workspaceId && keepIds.has(edge.sourceNodeId) && keepIds.has(edge.targetNodeId),
        );

    set({ nodes, edges });
    markDirty(set);
    get().scheduleSave();
  },

  applyFlowEdges(flowEdges) {
    const state = get();
    if (!canMutateCanvas(state)) {
      return;
    }
    const workspaceId = state.workspaceId;
    const keepIds = new Set(get().nodes.map((node) => node.id));
    const edges = flowEdges
      .filter((edge) => keepIds.has(edge.source) && keepIds.has(edge.target))
      .map((edge) => {
        const previous = get().edges.find((item) => item.id === edge.id);
        const input = toPersistedCanvasEdge(edge);
        const now = new Date().toISOString();
        return {
          id: input.id ?? previous?.id ?? cryptoRandomId(),
          workspaceId,
          sourceNodeId: input.sourceNodeId,
          targetNodeId: input.targetNodeId,
          label: input.label,
          edgeType: input.edgeType ?? previous?.edgeType ?? 'default',
          metadataJson: input.metadataJson ?? previous?.metadataJson,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        } satisfies CanvasEdge;
      });
    set({ edges });
    markDirty(set);
    get().scheduleSave();
  },

  async addImageFromFile(file, source, position) {
    const state = get();
    if (!canMutateCanvas(state)) {
      return null;
    }
    const workspaceId = state.workspaceId;
    if (!isImageFile(file)) {
      set({ canvasError: { code: 'Validation', message: '只支持粘贴或拖入图片。' } });
      return null;
    }
    try {
      assertImageSize(file);
      const contentBase64 = await blobToBase64(file);
      const mimeType = file.type || 'image/png';
      const asset = await canvasApi.saveCanvasAsset({
        fileName: file.name || 'pasted-image.png',
        contentBase64,
        mimeType,
        source,
        workspaceId,
      });
      if (get().workspaceId !== workspaceId) {
        return null;
      }
      const now = new Date().toISOString();
      const node: CanvasNode = {
        id: cryptoRandomId(),
        workspaceId,
        nodeType: 'image',
        title: file.name || '图片',
        assetId: asset.id,
        x: position?.x ?? 96,
        y: position?.y ?? 96,
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
        zIndex: nextZIndex(get().nodes),
        createdAt: now,
        updatedAt: now,
      };
      set({
        nodes: [...get().nodes, node],
        assetUrls: { ...get().assetUrls, [asset.id]: `data:${mimeType};base64,${contentBase64}` },
        canvasError: null,
      });
      markDirty(set);
      get().scheduleSave();
      return node;
    } catch (error) {
      if (get().workspaceId !== workspaceId) {
        return null;
      }
      set({ canvasError: toCommandError(error) });
      return null;
    }
  },

  scheduleSave() {
    if (!get().workspaceId || !get().dirty) {
      return;
    }
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void get().flushSave();
    }, SAVE_DEBOUNCE_MS);
  },

  async flushSave() {
    const workspaceId = get().workspaceId;
    if (!workspaceId || !get().dirty) {
      return;
    }
    clearSaveTimer();
    const revision = dirtyRevision;
    savingRevision = revision;
    const nodes = get().nodes.filter((node) => node.workspaceId === workspaceId).map(toCanvasNodeInput);
    const edges = get().edges.filter((edge) => edge.workspaceId === workspaceId).map(toCanvasEdgeInput);
    set({ saveStatus: 'saving', canvasError: null });

    try {
      const canvas = await canvasApi.saveCanvas({ workspaceId, nodes, edges });
      if (get().workspaceId !== workspaceId) {
        return;
      }
      if (dirtyRevision !== revision) {
        set({
          lastSavedAt: canvas.updatedAt ?? new Date().toISOString(),
          saveStatus: 'saving',
          dirty: true,
        });
        get().scheduleSave();
        return;
      }
      set({
        lastSavedAt: canvas.updatedAt ?? new Date().toISOString(),
        saveStatus: 'saved',
        dirty: false,
        nodes: canvas.nodes,
        edges: canvas.edges,
      });
    } catch (error) {
      if (get().workspaceId !== workspaceId) {
        return;
      }
      set({
        saveStatus: 'save-failed',
        canvasError: toCommandError(error),
        dirty: true,
      });
    }
  },

  async retrySave() {
    if (!get().workspaceId) {
      return;
    }
    if (!get().dirty) {
      dirtyRevision += 1;
      set({ dirty: true });
    }
    await get().flushSave();
  },

  reset() {
    canvasRequestSeq += 1;
    hydrateSeq += 1;
    clearSaveTimer();
    dirtyRevision += 1;
    savingRevision = dirtyRevision;
    set({ ...initialCanvasStoreData });
  },
}));

async function hydrateAssetUrls(
  workspaceId: string,
  nodes: CanvasNode[],
  set: (partial: Partial<CanvasStoreData>) => void,
  get: () => CanvasStoreData,
) {
  const seq = ++hydrateSeq;
  const assetIds = [...new Set(nodes.map((node) => node.assetId).filter((id): id is string => Boolean(id)))];
  for (const assetId of assetIds) {
    if (get().assetUrls[assetId] || get().missingAssets[assetId]) {
      continue;
    }
    try {
      const content = await canvasApi.readCanvasAsset({ assetId });
      if (seq !== hydrateSeq || get().workspaceId !== workspaceId) {
        return;
      }
      set({ assetUrls: { ...get().assetUrls, [assetId]: content.dataUrl } });
    } catch {
      if (seq !== hydrateSeq || get().workspaceId !== workspaceId) {
        return;
      }
      set({ missingAssets: { ...get().missingAssets, [assetId]: true } });
    }
  }
}
