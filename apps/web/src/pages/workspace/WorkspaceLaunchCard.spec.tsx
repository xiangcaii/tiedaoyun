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

describe('WorkspaceLaunchCard', () => {
  it('shows an archive hint and disables entering an archived workspace', () => {
    const html = renderToStaticMarkup(
      <WorkspaceLaunchCard workspace={archivedWorkspace} onOpen={vi.fn()} onDelete={vi.fn()} />,
    );

    expect(html).toContain('已归档');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?<span>进入<\/span><\/button>/);
  });
});
