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
};

export type InstalledApp = {
  id: string;
  name: string;
  iconUrl?: string;
  source: 'startMenu' | 'registry' | 'manualPath' | 'url' | 'command';
  launchKind: 'exe' | 'shortcut' | 'folder' | 'url' | 'command';
  category?: string;
  displayPath?: string;
  alreadyInWorkspace: boolean;
};

export type WorkspaceApp = {
  id: string;
  workspaceId: string;
  installedAppId: string;
  name: string;
  alias?: string;
  note?: string;
  iconUrl?: string;
  category?: string;
  status: 'notStarted' | 'launching' | 'running' | 'closed' | 'focusFailed' | 'launchFailed';
  lastFocusedAt?: string;
  windowTitle?: string;
  previewImageUrl?: string;
  errorMessage?: string;
};

