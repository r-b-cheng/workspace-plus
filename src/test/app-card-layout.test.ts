import { describe, expect, it } from 'vitest';

import { APP_CARD_MAX_COLUMNS, appCardColumnCount } from '@/features/apps/app-card-layout';

describe('中间栏软件卡片列数', () => {
  it('默认窗口宽度下也能收到单列，不要等缩到一张卡片那么窄', () => {
    expect(appCardColumnCount(0)).toBe(1);
    expect(appCardColumnCount(400)).toBe(1);
    expect(appCardColumnCount(559)).toBe(1);
  });

  it('随栏宽在 1、2、3 列之间切换，最多三列', () => {
    expect(appCardColumnCount(560)).toBe(2);
    expect(appCardColumnCount(746)).toBe(2);
    expect(appCardColumnCount(879)).toBe(2);
    expect(appCardColumnCount(880)).toBe(3);
    expect(appCardColumnCount(1600)).toBe(APP_CARD_MAX_COLUMNS);
  });
});
