export {};

declare global {
  interface Window {
    __E2E_MOCK_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    __E2E_MOCK_CONTROL__?: {
      failSaveCanvas: boolean;
      failNextFocus: boolean;
      closeNextWorkspaceApp?: boolean;
      closeWorkspaceAppId?: string | null;
      lastFocusWorkspaceAppId?: string | null;
      lastLaunchInstalledAppId?: string | null;
      closeWorkspaceApp?: (id: string) => void;
    };
    __E2E_ADD_IMAGE__?: (fileName: string, contentBase64: string, mimeType?: string) => Promise<unknown>;
    __E2E_OPEN_QUICK_SWITCH__?: () => void;
  }
}
