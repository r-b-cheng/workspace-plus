export type Workspace = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  appCount: number;
  updatedAt: string;
  lastOpenedAt?: string;
  archived: boolean;
  isActive?: boolean;
};

export type InstalledAppSource =
  | 'startMenu'
  | 'registry'
  | 'commonPath'
  | 'manualPath'
  | 'url'
  | 'command'
  | 'imported';

export type LaunchKind = 'exe' | 'shortcut' | 'folder' | 'url' | 'command';

export type InstalledApp = {
  id: string;
  name: string;
  iconUrl?: string;
  source: InstalledAppSource;
  launchKind: LaunchKind;
  category?: string;
  displayPath?: string;
  alreadyInWorkspace: boolean;
  isAvailable?: boolean;
  platform?: string;
};

export type WorkspaceAppStatus =
  | 'notStarted'
  | 'launching'
  | 'running'
  | 'closed'
  | 'focusFailed'
  | 'launchFailed';

export type WorkspaceApp = {
  id: string;
  workspaceId: string;
  installedAppId: string;
  name: string;
  alias?: string;
  note?: string;
  iconUrl?: string;
  category?: string;
  status: WorkspaceAppStatus;
  lastFocusedAt?: string;
  lastLaunchedAt?: string;
  windowTitle?: string;
  nativeWindowId?: string;
  previewImageUrl?: string;
  errorMessage?: string;
};

export type CanvasNodeType =
  | 'markdown'
  | 'text'
  | 'sticky'
  | 'todo'
  | 'image'
  | 'screenshot'
  | 'app_note';

export type CanvasNode = {
  id: string;
  workspaceId: string;
  nodeType: CanvasNodeType;
  title?: string;
  contentMarkdown?: string;
  contentText?: string;
  assetId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  metadataJson?: string;
  zIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type CanvasEdge = {
  id: string;
  workspaceId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  edgeType: string;
  metadataJson?: string;
  createdAt: string;
  updatedAt: string;
};

export type Canvas = {
  workspaceId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  updatedAt?: string;
};

export type Asset = {
  id: string;
  assetType: string;
  mimeType?: string;
  fileName?: string;
  storagePath: string;
  byteSize?: number;
  sha256?: string;
  source: string;
  createdAt: string;
};

export type CommandError = {
  code: string;
  message: string;
};
