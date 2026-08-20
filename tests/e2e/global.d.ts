export {};

declare global {
  interface Window {
    __E2E_MOCK_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    __E2E_MOCK_CONTROL__?: {
      failSaveCanvas: boolean;
      failNextFocus: boolean;
    };
    __E2E_ADD_IMAGE__?: (fileName: string, contentBase64: string, mimeType?: string) => Promise<unknown>;
  }
}
