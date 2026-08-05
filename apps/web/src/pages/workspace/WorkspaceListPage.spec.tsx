import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../i18n';
import WorkspaceListPage from './WorkspaceListPage';

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    Drawer: ({ children, placement, width }: import('antd').DrawerProps) => (
      <aside className="ant-drawer" data-placement={placement} data-width={width}>
        {children}
      </aside>
    ),
  };
});

type MockWorkspace = {
  id: string;
  name: string;
  slug: string;
  logoUrl: null;
  ownerId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
};

function createWorkspace(index: number): MockWorkspace {
  return {
    id: `ws_${index}`,
    name: `工作空间 ${index}`,
    slug: `workspace-${index}`,
    logoUrl: null,
    ownerId: 'u_1',
    status: 'active',
    createdAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    updatedAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    deletedAt: null,
  };
}

let mockWorkspaces: MockWorkspace[] = [createWorkspace(1)];
let mockTotal = 1;
const useWorkspacesQueryMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: (
    selector: (state: {
      user: { id: string; email: string } | null;
      clearAuth: () => void;
    }) => unknown,
  ) => selector({ user: { id: 'u_1', email: 'test@example.com' }, clearAuth: vi.fn() }),
}));

vi.mock('../../api/workspace', () => ({
  useWorkspacesQuery: (...args: unknown[]) => {
    useWorkspacesQueryMock(...args);
    return {
      data: {
        items: mockWorkspaces,
        total: mockTotal,
        page: 1,
        pageSize: 10,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
  useCreateWorkspaceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteWorkspaceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

describe('WorkspaceListPage', () => {
  it('renders workspace launch cards in the launchpad card grid', () => {
    useWorkspacesQueryMock.mockClear();
    mockWorkspaces = [
      {
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
    ];
    mockTotal = 1;
    const html = renderToStaticMarkup(<WorkspaceListPage />);
    expect(html).toContain('工作空间');
    expect(html).toContain('人事中心');
    expect(html).toContain('hr-center');
    expect(html).toContain('workspace-launch-card');
    expect(html).toContain('workspace-launchpad__grid');
    expect(useWorkspacesQueryMock).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      status: undefined,
      keyword: undefined,
      sort: 'createdAtDesc',
    });
  });

  it('uses a right-side drawer as the workspace creation surface', () => {
    const html = renderToStaticMarkup(<WorkspaceListPage />);

    expect(html).toContain('ant-drawer');
    expect(html).toContain('data-placement="right"');
    expect(html).toContain('data-width="440"');
    expect(html).toContain('新建工作空间');
  });

  it('shows pagination when backend reports more than one page', () => {
    useWorkspacesQueryMock.mockClear();
    mockWorkspaces = Array.from({ length: 11 }, (_, index) => createWorkspace(index + 1));
    mockTotal = 11;

    const html = renderToStaticMarkup(<WorkspaceListPage />);

    expect(html).toContain('ant-pagination');
  });

  it('hides pagination when all workspaces fit on a single page', () => {
    useWorkspacesQueryMock.mockClear();
    mockWorkspaces = Array.from({ length: 10 }, (_, index) => createWorkspace(index + 1));
    mockTotal = 10;

    const html = renderToStaticMarkup(<WorkspaceListPage />);

    expect(html).not.toContain('ant-pagination');
  });
});
