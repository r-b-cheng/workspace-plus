import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateWorkspaceDialog } from '@/features/workspaces/components/create-workspace-dialog';

describe('创建工作区名称校验', () => {
  it('空名不可创建', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CreateWorkspaceDialog open submitting={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />,
    );

    const submit = screen.getByTestId('create-workspace-submit');
    expect(submit).toBeDisabled();

    await user.type(screen.getByTestId('create-workspace-name-input'), '   ');
    expect(submit).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('填写名称后可以创建', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CreateWorkspaceDialog open submitting={false} onOpenChange={vi.fn()} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByTestId('create-workspace-name-input'), ' 产品设计 ');
    expect(screen.getByTestId('create-workspace-submit')).toBeEnabled();
    await user.click(screen.getByTestId('create-workspace-submit'));

    expect(onSubmit).toHaveBeenCalledWith({ name: '产品设计', color: '#176bff' });
  });
});
