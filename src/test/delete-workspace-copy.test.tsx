import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { REMOVE_WORKSPACE_APP_COPY } from '@/features/apps/components/workspace-app-card';
import {
  DELETE_WORKSPACE_CONFIRM_COPY,
  DeleteWorkspaceDialog,
} from '@/features/workspaces/components/delete-workspace-dialog';

describe('删除工作区确认文案', () => {
  it('写明只删本产品数据、不卸载、不关闭真实窗口', () => {
    render(
      <DeleteWorkspaceDialog
        open
        workspaceName="论文写作"
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const copy = screen.getByTestId('delete-workspace-confirm-copy');
    expect(copy).toHaveTextContent('不卸载');
    expect(copy).toHaveTextContent('不关闭');
    expect(copy).toHaveTextContent(DELETE_WORKSPACE_CONFIRM_COPY);
    expect(DELETE_WORKSPACE_CONFIRM_COPY).toContain('不卸载软件');
    expect(DELETE_WORKSPACE_CONFIRM_COPY).toContain('不关闭真实窗口');
  });

  it('移出软件文案写明不关闭、不卸载', () => {
    expect(REMOVE_WORKSPACE_APP_COPY).toContain('不会关闭真实窗口');
    expect(REMOVE_WORKSPACE_APP_COPY).toContain('也不会卸载软件');
  });
});
