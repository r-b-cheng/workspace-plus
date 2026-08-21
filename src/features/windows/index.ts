export { EmbedPreviewHost } from './components/embed-preview-host';
export {
  applyWorkspaceWindowsChanged,
  listenWorkspaceWindowsChanged,
  useWindowsChangedBridge,
  WORKSPACE_WINDOWS_CHANGED_EVENT,
} from './listen-windows-changed';
export type { WorkspaceWindowsChangedPayload } from './listen-windows-changed';
export { EMBED_PREVIEW_ACTION, EMBED_PREVIEW_LABEL, EXIT_EMBED_PREVIEW_LABEL } from './embed-copy';
export { embedHostBoundsFromElement, queryEmbedHostBounds, waitForEmbedHostBounds } from './embed-host';
export {
  canFocusWorkspaceApp,
  canFocusWorkspaceAppWindow,
  canPreviewWorkspaceApp,
  canReopenWorkspaceApp,
  displayWorkspaceAppTitle,
  statusFromErrorCode,
  workspaceAppStatusLabel,
  workspaceAppWindowStatusLabel,
} from './window-status';
