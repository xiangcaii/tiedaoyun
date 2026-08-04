import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../i18n';
import type { WorkspaceItem } from '../../api/workspace';
import { WorkspaceLaunchCard } from './WorkspaceLaunchCard';

const archivedWorkspace: WorkspaceItem = {
  id: 'ws_archived',
  name: '人事中心',
  slug: 'hr-center',
  logoUrl: null,
  ownerId: 'user_1',
  status: 'archived',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  deletedAt: '2026-08-02T00:00:00.000Z',
};

const activeWorkspace: WorkspaceItem = {
  ...archivedWorkspace,
  id: 'ws_active',
  status: 'active',
  deletedAt: null,
};

describe('WorkspaceLaunchCard', () => {
  it('hides deletion when the parent does not grant delete permission', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLaunchCard
        workspace={archivedWorkspace}
        canDelete={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(html).toContain('已归档');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?<span>进入<\/span><\/button>/);
    expect(html).not.toContain('删除工作空间');
  });

  it('renders an active workspace identity area as a native enter button', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLaunchCard
        workspace={activeWorkspace}
        canDelete
        onOpen={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(html).toMatch(/<button[^>]*class="workspace-launch-card__body"[^>]*>/);
    expect(html).toContain('进入');
  });
});
