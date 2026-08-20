import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CurrentWorkspaceHeader } from '@/features/apps/components/current-workspace-header';
import { mockWorkspace } from '@/test/fixtures';

const headerProps = {
  workspace: mockWorkspace(),
  contentQuery: '',
  onContentQueryChange: vi.fn(),
  onAddApp: vi.fn(),
  onSettings: vi.fn(),
};

describe('顶栏 save-status', () => {
  it('在 saving / saved / save-failed 间切换，失败可重试', () => {
    const onRetrySave = vi.fn();
    const { rerender } = render(<CurrentWorkspaceHeader {...headerProps} saveStatus="saving" />);
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-save-state', 'saving');
    expect(screen.getByTestId('save-status')).toHaveTextContent('保存中');

    rerender(<CurrentWorkspaceHeader {...headerProps} saveStatus="saved" lastSavedAt="2026-08-20T12:00:00Z" />);
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-save-state', 'saved');
    expect(screen.getByTestId('save-status')).toHaveTextContent('已保存');

    rerender(<CurrentWorkspaceHeader {...headerProps} saveStatus="save-failed" onRetrySave={onRetrySave} />);
    expect(screen.getByTestId('save-status')).toHaveAttribute('data-save-state', 'save-failed');
    expect(screen.getByTestId('save-status')).toHaveTextContent('保存失败');
    expect(screen.getByTestId('retry-save-button')).toBeInTheDocument();
  });
});
