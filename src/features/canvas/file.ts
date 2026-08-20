const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function isImageFile(file: File | Blob): boolean {
  return Boolean(file.type) && file.type.startsWith('image/');
}

export function assertImageSize(file: Blob): void {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('图片过大，请选择 12MB 以内的文件。');
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'));
    reader.readAsDataURL(blob);
  });
}
