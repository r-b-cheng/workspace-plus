const TYPING_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable="true"], .cm-editor, .cm-content';

export function isTypingTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element) {
    return false;
  }
  return Boolean(element.closest(TYPING_TARGET_SELECTOR));
}

function isImageFileLike(file: File | null | undefined): file is File {
  return Boolean(file?.type.startsWith('image/'));
}

function fileKey(file: File): string {
  return `${file.type}:${file.size}:${file.name}:${file.lastModified}`;
}

export function filesFromClipboardData(data: DataTransfer | null | undefined): File[] {
  const files: File[] = [];
  const seen = new Set<string>();
  const push = (file: File | null | undefined) => {
    if (!isImageFileLike(file) || seen.has(fileKey(file))) {
      return;
    }
    seen.add(fileKey(file));
    files.push(file);
  };

  const items = data?.items;
  if (items) {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.kind === 'file' || item.type.startsWith('image/')) {
        push(item.getAsFile());
      }
    }
  }

  const listed = data?.files;
  if (listed) {
    for (let index = 0; index < listed.length; index += 1) {
      push(listed[index]);
    }
  }

  return files;
}

function extensionForMime(type: string): string {
  if (type.includes('jpeg')) {
    return 'jpg';
  }
  if (type.includes('gif')) {
    return 'gif';
  }
  if (type.includes('webp')) {
    return 'webp';
  }
  if (type.includes('bmp')) {
    return 'bmp';
  }
  return 'png';
}

export async function filesFromClipboardApi(): Promise<File[]> {
  if (!navigator.clipboard?.read) {
    return [];
  }
  try {
    const items = await navigator.clipboard.read();
    const files: File[] = [];
    for (const item of items) {
      const type = item.types.find((value) => value.startsWith('image/'));
      if (!type) {
        continue;
      }
      const blob = await item.getType(type);
      const mime = blob.type.startsWith('image/') ? blob.type : type;
      files.push(new File([blob], `pasted-image.${extensionForMime(mime)}`, { type: mime }));
    }
    return files;
  } catch {
    return [];
  }
}
