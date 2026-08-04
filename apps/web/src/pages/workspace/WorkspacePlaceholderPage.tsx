/**
 * 工作空间占位页（feature.md §5.3）。
 *
 * - 顶部 Alert info：占位说明
 * - 调 GET /workspaces 展示列表（React Query）
 * - 列表项点击：message.info（不跳转）
 * - 空态：Empty + 禁用「创建工作空间」按钮
 * - 顶栏：当前用户邮箱 + Logout
 * - 四态：空 / 加载（Spin）/ 错误（Alert）/ 正常
 */
import { useState } from 'react';
import { Layout, Alert, List, Empty, Button, Spin, Typography, Space, Tag, Card } from 'antd';
import { LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkspacesQuery, type WorkspaceItem } from '../../api/workspace';
import { logout } from '../../api/auth';
import { useAuthStore } from '../../stores/auth.store';

const { Header, Content } = Layout;

export default function WorkspacePlaceholderPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const {
    data: workspacePage,
    isLoading,
    isError,
    error,
  } = useWorkspacesQuery({
    page: 1,
    pageSize: 10,
  });
  const [loggingOut, setLoggingOut] = useState(false);
  const workspaces = workspacePage?.items ?? [];

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

  const onItemClick = () => {
    message.info(t('workspace.itemClickHint'));
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin tip={t('common.loading')} />
        </div>
      );
    }
    if (isError) {
      return (
        <Alert
          type="error"
          showIcon
          message={error instanceof Error ? error.message : t('common.loading')}
        />
      );
    }
    if (workspaces.length === 0) {
      return (
        <Empty description={t('workspace.empty')}>
          <Button type="primary" icon={<PlusOutlined />} disabled>
            {t('workspace.create')}
          </Button>
        </Empty>
      );
    }
    return (
      <List<WorkspaceItem>
        bordered
        dataSource={workspaces}
        renderItem={(ws) => (
          <List.Item onClick={onItemClick} style={{ cursor: 'pointer' }}>
            <List.Item.Meta
              title={ws.name}
              description={
                <Space>
                  <Tag>{ws.slug}</Tag>
                  <Tag color={ws.status === 'archived' ? 'default' : 'blue'}>{ws.status}</Tag>
                </Space>
              }
            />
          </List.Item>
        )}
      />
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
        <Alert
          type="info"
          showIcon
          message={t('workspace.placeholderAlert')}
          style={{ marginBottom: 16 }}
        />
        <Typography.Title level={4}>{t('workspace.title')}</Typography.Title>
        <Card style={{ maxWidth: 960 }}>{renderBody()}</Card>
      </Content>
    </Layout>
  );
}
