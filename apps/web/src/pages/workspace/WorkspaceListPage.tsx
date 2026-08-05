import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Pagination,
  Select,
  Skeleton,
  Space,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  CheckSquareOutlined,
  DeploymentUnitOutlined,
  InboxOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { logout } from '../../api/auth';
import { extractErrorMessage } from '../../api/http';
import {
  type WorkspaceSort,
  useCreateWorkspaceMutation,
  useDeleteWorkspaceMutation,
  useWorkspacesQuery,
  type WorkspaceItem,
  type WorkspaceStatus,
} from '../../api/workspace';
import { useAuthStore } from '../../stores/auth.store';
import WorkspaceCreateForm from './WorkspaceCreateForm';
import { WorkspaceLaunchCard } from './WorkspaceLaunchCard';
import './workspace-launchpad.css';

const { Header, Content } = Layout;

type StatusFilter = 'all' | WorkspaceStatus;
type SortOption = WorkspaceSort;
const PAGE_SIZE = 10;

function slugifyWorkspace(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export default function WorkspaceListPage() {
  const { t } = useTranslation();
  const { message, modal } = AntdApp.useApp();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [loggingOut, setLoggingOut] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('createdAtDesc');
  const [currentPage, setCurrentPage] = useState(1);

  const [form] = Form.useForm<{ name: string; slug: string; logoUrl?: string }>();

  const query = useMemo(
    () => ({
      page: currentPage,
      pageSize: PAGE_SIZE,
      status: statusFilter === 'all' ? undefined : statusFilter,
      keyword: keyword.trim() || undefined,
      sort: sortOption,
    }),
    [currentPage, keyword, sortOption, statusFilter],
  );
  const { data: workspacePage, isLoading, isError, error, refetch } = useWorkspacesQuery(query);
  const createMutation = useCreateWorkspaceMutation();
  const deleteMutation = useDeleteWorkspaceMutation();
  const workspaces = workspacePage?.items ?? [];
  const total = workspacePage?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeOnPage = workspaces.filter((workspace) => workspace.status === 'active').length;
  const archivedOnPage = workspaces.filter((workspace) => workspace.status === 'archived').length;

  useEffect(() => {
    setCurrentPage(1);
  }, [keyword, sortOption, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      clearAuth();
      setLoggingOut(false);
      navigate('/login', { replace: true });
    }
  };

  const openCreateDrawer = () => {
    form.resetFields();
    setSlugTouched(false);
    setCreateOpen(true);
  };

  const onNameChange = (value: string) => {
    if (slugTouched) return;
    const nextSlug = slugifyWorkspace(value);
    form.setFieldsValue({ slug: nextSlug });
  };

  const submitCreate = async () => {
    try {
      const values = await form.validateFields();
      const created = await createMutation.mutateAsync(values);
      setCreateOpen(false);
      message.success(t('workspace.createSuccess'));
      navigate(`/workspace/${created.id}/settings`);
    } catch (e) {
      const statusCode = (e as { response?: { status?: number } })?.response?.status;
      if (statusCode === 409) {
        form.setFields([{ name: 'slug', errors: [t('workspace.slugConflict')] }]);
        return;
      }
      if (e && typeof e === 'object' && 'errorFields' in (e as Record<string, unknown>)) {
        return;
      }
      message.error(extractErrorMessage(e, t('workspace.createFailed')));
    }
  };

  const confirmDelete = (ws: WorkspaceItem) => {
    modal.confirm({
      title: t('workspace.deleteTitle'),
      content: (
        <div>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t('workspace.deleteConfirm', { name: ws.name })}
          </Typography.Paragraph>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t('workspace.deleteNote')}
          </Typography.Paragraph>
        </div>
      ),
      okText: t('workspace.delete'),
      okButtonProps: { danger: true, loading: deleteMutation.isPending },
      cancelText: t('common.cancel'),
      onOk: async () => {
        await deleteMutation.mutateAsync(ws.id);
        message.success(t('workspace.deleteSuccess'));
      },
    });
  };

  const gotoSettings = (ws: WorkspaceItem) => {
    if (ws.status === 'archived') return;
    navigate(`/workspace/${ws.id}/settings`);
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <List
          className="workspace-launchpad__grid"
          split={false}
          dataSource={new Array(6).fill(0)}
          renderItem={(_, idx) => (
            <List.Item key={idx}>
              <Card>
                <Skeleton active avatar paragraph={{ rows: 2 }} />
              </Card>
            </List.Item>
          )}
        />
      );
    }

    if (isError) {
      return (
        <Alert
          type="error"
          showIcon
          message={extractErrorMessage(error, t('workspace.loadFailed'))}
          action={
            <Button onClick={() => refetch()} size="small">
              {t('common.retry')}
            </Button>
          }
        />
      );
    }

    if (total === 0) {
      return (
        <Empty
          className="workspace-launchpad__empty"
          description={
            keyword.trim() || statusFilter !== 'all'
              ? t('workspace.emptyFiltered')
              : t('workspace.empty')
          }
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            {t('workspace.create')}
          </Button>
        </Empty>
      );
    }

    return (
      <Space className="workspace-launchpad__result-stack" direction="vertical" size={16}>
        <List
          className="workspace-launchpad__grid"
          split={false}
          dataSource={workspaces}
          renderItem={(workspace) => (
            <List.Item key={workspace.id}>
              <WorkspaceLaunchCard
                workspace={workspace}
                canDelete={workspace.ownerId === user?.id}
                onOpen={gotoSettings}
                onDelete={confirmDelete}
              />
            </List.Item>
          )}
        />
        {total > PAGE_SIZE ? (
          <div className="workspace-launchpad__pagination">
            <Pagination
              current={currentPage}
              pageSize={PAGE_SIZE}
              total={total}
              onChange={setCurrentPage}
              showSizeChanger={false}
            />
          </div>
        ) : null}
      </Space>
    );
  };

  return (
    <Layout className="workspace-launchpad">
      <Header className="workspace-launchpad__topbar">
        <Typography.Text className="workspace-launchpad__brand" strong>
          {t('app.title')}
        </Typography.Text>
        <Space size={10}>
          <Typography.Text className="workspace-launchpad__user">{user?.email}</Typography.Text>
          <Divider type="vertical" className="workspace-launchpad__topbar-divider" />
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={onLogout}
            loading={loggingOut}
            className="workspace-launchpad__logout"
          >
            {t('common.logout')}
          </Button>
        </Space>
      </Header>
      <Content className="workspace-launchpad__content">
        <div className="workspace-launchpad__shell">
          <section className="workspace-launchpad__hero">
            <div className="workspace-launchpad__route-rail" aria-hidden="true" />
            <div className="workspace-launchpad__hero-main">
              <Typography.Text className="workspace-launchpad__eyebrow">
                {t('workspace.eyebrow')}
              </Typography.Text>
              <div className="workspace-launchpad__hero-overview">
                <span className="workspace-launchpad__hero-icon" aria-hidden="true">
                  <DeploymentUnitOutlined />
                </span>
                <div className="workspace-launchpad__hero-copy">
                  <Typography.Title level={2} className="workspace-launchpad__title">
                    {t('workspace.title')}
                  </Typography.Title>
                  <Typography.Paragraph className="workspace-launchpad__subtitle">
                    {t('workspace.subtitle')}
                  </Typography.Paragraph>
                </div>
              </div>
            </div>

            <div className="workspace-launchpad__metrics" aria-label={t('workspace.summaryLabel')}>
              <div className="workspace-launchpad__metric workspace-launchpad__metric--total">
                <span className="workspace-launchpad__metric-icon" aria-hidden="true">
                  <AppstoreOutlined />
                </span>
                <Typography.Text className="workspace-launchpad__metric-value">
                  {total}
                </Typography.Text>
                <Typography.Text className="workspace-launchpad__metric-label">
                  {t('workspace.summaryTotal')}
                </Typography.Text>
              </div>
              <div className="workspace-launchpad__metric workspace-launchpad__metric--active">
                <span className="workspace-launchpad__metric-icon" aria-hidden="true">
                  <CheckSquareOutlined />
                </span>
                <Typography.Text className="workspace-launchpad__metric-value">
                  {activeOnPage}
                </Typography.Text>
                <Typography.Text className="workspace-launchpad__metric-label">
                  {t('workspace.summaryActive')}
                </Typography.Text>
              </div>
              <div className="workspace-launchpad__metric workspace-launchpad__metric--archived">
                <span className="workspace-launchpad__metric-icon" aria-hidden="true">
                  <InboxOutlined />
                </span>
                <Typography.Text className="workspace-launchpad__metric-value">
                  {archivedOnPage}
                </Typography.Text>
                <Typography.Text className="workspace-launchpad__metric-label">
                  {t('workspace.summaryArchived')}
                </Typography.Text>
              </div>
            </div>

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateDrawer}
              className="workspace-launchpad__hero-action"
            >
              {t('workspace.create')}
            </Button>
          </section>

          <section className="workspace-launchpad__surface">
            <div className="workspace-launchpad__toolbar">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('workspace.searchPlaceholder')}
                className="workspace-launchpad__search"
                aria-label={t('workspace.searchPlaceholder')}
              />
              <Space wrap size={12}>
                <Select<StatusFilter>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  className="workspace-launchpad__status-filter"
                  aria-label={t('workspace.statusFilter')}
                  options={[
                    { value: 'all', label: t('workspace.filterAll') },
                    { value: 'active', label: t('workspace.filterActive') },
                    { value: 'archived', label: t('workspace.filterArchived') },
                  ]}
                />
                <Select<SortOption>
                  value={sortOption}
                  onChange={setSortOption}
                  suffixIcon={<SortAscendingOutlined />}
                  className="workspace-launchpad__sort"
                  aria-label={t('workspace.sort')}
                  options={[
                    { value: 'createdAtDesc', label: t('workspace.sortCreatedDesc') },
                    { value: 'createdAtAsc', label: t('workspace.sortCreatedAsc') },
                    { value: 'nameAsc', label: t('workspace.sortNameAsc') },
                    { value: 'nameDesc', label: t('workspace.sortNameDesc') },
                  ]}
                />
              </Space>
            </div>

            <div className="workspace-launchpad__list-head">
              <Space align="center" size={8}>
                <AppstoreOutlined aria-hidden="true" />
                <Typography.Text strong>{t('workspace.listTitle')}</Typography.Text>
              </Space>
              <Typography.Text type="secondary">
                {t('workspace.listMeta', { shown: workspaces.length, total })}
              </Typography.Text>
            </div>

            {renderBody()}
          </section>
        </div>
      </Content>

      <Drawer
        title={t('workspace.createTitle')}
        open={createOpen}
        getContainer={false}
        placement="right"
        width={440}
        onClose={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={createMutation.isPending} onClick={submitCreate}>
              {t('common.create')}
            </Button>
          </Space>
        }
      >
        <WorkspaceCreateForm
          form={form}
          onNameChange={onNameChange}
          onSlugChange={() => setSlugTouched(true)}
        />
      </Drawer>
    </Layout>
  );
}
