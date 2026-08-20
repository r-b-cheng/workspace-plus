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

export type CanvasSaveStatus = 'idle' | 'saving' | 'saved' | 'save-failed';

export type CanvasNodeInput = {
  id?: string;
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
  zIndex?: number;
};

export type CanvasEdgeInput = {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  edgeType?: string;
  metadataJson?: string;
};

export type GetCanvasInput = WorkspaceIdInput;

export type SaveCanvasInput = {
  workspaceId: string;
  nodes: CanvasNodeInput[];
  edges: CanvasEdgeInput[];
};

export type UpsertCanvasNodeInput = {
  workspaceId: string;
  node: CanvasNodeInput;
};

export type DeleteCanvasNodeInput = {
  workspaceId: string;
  nodeId: string;
};

export type SaveCanvasAssetInput = {
  fileName: string;
  contentBase64: string;
  mimeType?: string;
  source?: string;
  workspaceId?: string;
};

export type ReadCanvasAssetInput = {
  assetId: string;
};

export type CanvasAssetContent = {
  assetId: string;
  mimeType?: string;
  fileName?: string;
  contentBase64: string;
  dataUrl: string;
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

export type DeleteWorkspaceResult = {
  workspaceId: string;
  deleted: boolean;
};

export type RemoveWorkspaceAppResult = {
  workspaceAppId: string;
  removed: boolean;
};

export type CreateWorkspaceInput = {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
};

export type RenameWorkspaceInput = {
  workspaceId: string;
  name: string;
};

export type WorkspaceIdInput = {
  workspaceId: string;
};

export type ListInstalledAppsInput = {
  workspaceId?: string;
};

export type SearchInstalledAppsInput = {
  query: string;
  workspaceId?: string;
};

export type AddManualAppInput = {
  path: string;
  workspaceId?: string;
};

export type LaunchWorkspaceAppInput = {
  workspaceId: string;
  installedAppId: string;
};

export type WorkspaceAppIdInput = {
  workspaceAppId: string;
};

export type WorkspaceAppWindowStatus = 'running' | 'closed';

export type WorkspaceAppWindow = {
  id: string;
  workspaceAppId: string;
  title: string;
  status: WorkspaceAppWindowStatus;
  lastFocusedAt?: string | null;
};

export type ListWorkspaceAppWindowsInput = {
  workspaceAppId: string;
};

export type FocusNativeWindowInput = {
  windowId: string;
};

export type ShortcutRegistrationStatus = 'registered' | 'conflict' | 'denied' | 'unregistered';

export type AppSettings = {
  quickSwitchShortcut: string;
  registrationStatus: ShortcutRegistrationStatus;
  lastError?: string | null;
};

export type UpdateAppSettingsInput = {
  quickSwitchShortcut?: string | null;
};
