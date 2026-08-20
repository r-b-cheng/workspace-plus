import { useCanvasStore } from '@/features/canvas/store/canvas-store';

function decodeBase64ToFile(fileName: string, contentBase64: string, mimeType: string): File {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
}

export function installCanvasE2eHooks() {
  if (import.meta.env.VITE_E2E !== '1') {
    return () => undefined;
  }

  window.__E2E_ADD_IMAGE__ = async (fileName, contentBase64, mimeType = 'image/png') => {
    const file = decodeBase64ToFile(fileName, contentBase64, mimeType);
    return useCanvasStore.getState().addImageFromFile(file, 'drag_drop', { x: 120, y: 180 });
  };

  return () => {
    delete window.__E2E_ADD_IMAGE__;
  };
}
