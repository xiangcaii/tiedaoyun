import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
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
  message,
  Modal,
} from 'antd';
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons';
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
    Modal.confirm({
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
          grid={{ gutter: 16, column: 3 }}
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
        <Empty description={t('workspace.empty')}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            {t('workspace.create')}
          </Button>
        </Empty>
      );
    }

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <List
          grid={{ gutter: 16, column: 3 }}
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
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
    <Layout style={{ minHeight: '100vh', minWidth: 'var(--tdy-min-width)' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fff',
        }}
      >
        <Typography.Text style={{ color: '#fff' }} strong>
          {t('app.title')}
        </Typography.Text>
        <Space>
          <Typography.Text style={{ color: '#fff' }}>{user?.email}</Typography.Text>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={onLogout}
            loading={loggingOut}
            style={{ color: '#fff' }}
          >
            {t('common.logout')}
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space direction="vertical" size={2}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {t('workspace.title')}
                </Typography.Title>
                <Typography.Text type="secondary">{t('workspace.subtitle')}</Typography.Text>
              </Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
                {t('workspace.create')}
              </Button>
            </Space>
          </Card>

          <Card>
            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
              <Input
                allowClear
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('workspace.searchPlaceholder')}
                style={{ width: 260 }}
              />
              <Space wrap>
                <Select<StatusFilter>
                  value={statusFilter}
                  onChange={setStatusFilter}
                  style={{ width: 140 }}
                  options={[
                    { value: 'all', label: t('workspace.filterAll') },
                    { value: 'active', label: t('workspace.filterActive') },
                    { value: 'archived', label: t('workspace.filterArchived') },
                  ]}
                />
                <Select<SortOption>
                  value={sortOption}
                  onChange={setSortOption}
                  style={{ width: 160 }}
                  options={[
                    { value: 'createdAtDesc', label: t('workspace.sortCreatedDesc') },
                    { value: 'createdAtAsc', label: t('workspace.sortCreatedAsc') },
                    { value: 'nameAsc', label: t('workspace.sortNameAsc') },
                    { value: 'nameDesc', label: t('workspace.sortNameDesc') },
                  ]}
                />
              </Space>
            </Space>
          </Card>

          {renderBody()}
        </Space>
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
