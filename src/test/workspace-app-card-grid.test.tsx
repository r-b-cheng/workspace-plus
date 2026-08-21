import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceAppCardGrid } from '@/features/apps/components/workspace-app-card-grid';
import { mockWorkspaceApp } from '@/test/fixtures';

function installResizeObserver(width: number) {
  class FakeResizeObserver {
    callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: { width } as DOMRectReadOnly,
          } as ResizeObserverEntry,
        ],
        this,
      );
    }

    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
}

const apps = [
  mockWorkspaceApp({ id: 'app-1', name: 'Chrome' }),
  mockWorkspaceApp({ id: 'app-2', name: 'VS Code' }),
  mockWorkspaceApp({ id: 'app-3', name: 'Notepad' }),
];

describe('中间栏软件卡片动态排列', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('栏宽足够时最多三列卡片', async () => {
    installResizeObserver(960);
    render(
      <WorkspaceAppCardGrid
        apps={apps}
        onActivate={() => undefined}
        onReopen={() => undefined}
        onRemove={() => undefined}
      />,
    );

    const grid = await screen.findByTestId('workspace-app-card-grid');
    await waitFor(() => expect(grid).toHaveAttribute('data-grid-cols', '3'));
    expect(grid).toHaveAttribute('data-layout', 'grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(screen.getAllByTestId('workspace-app-card')[0]).toHaveAttribute('data-layout', 'card');
  });

  it('中间栏变窄后改成单列竖排', async () => {
    installResizeObserver(480);
    render(
      <WorkspaceAppCardGrid
        apps={apps}
        onActivate={() => undefined}
        onReopen={() => undefined}
        onRemove={() => undefined}
      />,
    );

    const grid = await screen.findByTestId('workspace-app-card-grid');
    await waitFor(() => expect(grid).toHaveAttribute('data-grid-cols', '1'));
    expect(grid).toHaveAttribute('data-layout', 'stack');
    expect(grid.style.gridTemplateColumns).toBe('repeat(1, minmax(0, 1fr))');
    expect(screen.getAllByTestId('workspace-app-card')[0]).toHaveAttribute('data-layout', 'stack');
  });
});
