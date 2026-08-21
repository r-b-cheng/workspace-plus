import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  filesFromClipboardApi,
  filesFromClipboardData,
  isTypingTarget,
} from '@/features/canvas/clipboard-images';

function imageFile(name = 'clip.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
}

describe('白板剪贴板图片', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('从 DataTransfer items 取出图片', () => {
    const file = imageFile();
    const data = {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => file,
        },
      ],
      files: [file],
    } as unknown as DataTransfer;

    expect(filesFromClipboardData(data)).toEqual([file]);
  });

  it('忽略非图片和正在输入的目标', () => {
    const text = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const data = {
      items: [{ kind: 'file', type: 'text/plain', getAsFile: () => text }],
      files: [text],
    } as unknown as DataTransfer;
    expect(filesFromClipboardData(data)).toEqual([]);

    const input = document.createElement('input');
    document.body.append(input);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    input.remove();
  });

  it('clipboard.read 作为截图回退', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    vi.stubGlobal('navigator', {
      clipboard: {
        read: async () => [
          {
            types: ['image/png'],
            getType: async () => blob,
          },
        ],
      },
    });

    const files = await filesFromClipboardApi();
    expect(files).toHaveLength(1);
    expect(files[0]?.type).toBe('image/png');
    expect(files[0]?.name).toMatch(/pasted-image\.png/);
  });
});
