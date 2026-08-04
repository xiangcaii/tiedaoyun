import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../i18n';
import WorkspaceSettingsPage from './WorkspaceSettingsPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'ws_1' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { id: string; email: string } | null }) => unknown) =>
    selector({ user: { id: 'u_1', email: 'test@example.com' } }),
}));

vi.mock('../../api/workspace', () => ({
  useWorkspaceQuery: () => ({
    data: {
      id: 'ws_1',
      name: '人事中心',
      slug: 'hr-center',
      logoUrl: null,
      ownerId: 'u_1',
      status: 'active',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
      deletedAt: null,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateWorkspaceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteWorkspaceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe('WorkspaceSettingsPage', () => {
  it('renders workspace settings title and fields', () => {
    const html = renderToStaticMarkup(<WorkspaceSettingsPage />);
    expect(html).toContain('工作空间设置');
    expect(html).toContain('人事中心');
    expect(html).toContain('hr-center');
  });
});
