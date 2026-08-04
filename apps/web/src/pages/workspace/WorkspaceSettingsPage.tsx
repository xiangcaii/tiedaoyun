import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Skeleton,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { LeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage } from '../../api/http';
import {
  useDeleteWorkspaceMutation,
  useUpdateWorkspaceMutation,
  useWorkspaceQuery,
} from '../../api/workspace';
import { useAuthStore } from '../../stores/auth.store';

const { Content, Sider } = Layout;

type SectionKey = 'basic' | 'appearance' | 'danger';

function formatIso(iso?: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function WorkspaceSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const workspaceId = params.id ?? '';

  const user = useAuthStore((s) => s.user);

  const { data: workspace, isLoading, isError, error, refetch } = useWorkspaceQuery(workspaceId);
  const updateMutation = useUpdateWorkspaceMutation(workspaceId);
  const deleteMutation = useDeleteWorkspaceMutation();

  const isOwner = useMemo(() => {
    if (!workspace || !user) return false;
    return workspace.ownerId === user.id;
  }, [user, workspace]);

  const [activeKey, setActiveKey] = useState<SectionKey>('basic');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState('');

  const [basicForm] = Form.useForm<{ name: string }>();
  const [appearanceForm] = Form.useForm<{ logoUrl?: string }>();

  const scrollTo = (key: SectionKey) => {
    setActiveKey(key);
    const el = document.getElementById(`ws-${key}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!workspace) return;
    basicForm.setFieldsValue({ name: workspace.name });
    appearanceForm.setFieldsValue({ logoUrl: workspace.logoUrl ?? '' });
  }, [appearanceForm, basicForm, workspace]);

  const saveBasic = async () => {
    try {
      const values = await basicForm.validateFields();
      await updateMutation.mutateAsync({ name: values.name });
      message.success(t('workspace.saveSuccess'));
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in (e as Record<string, unknown>)) return;
      message.error(extractErrorMessage(e, t('workspace.saveFailed')));
    }
  };

  const saveAppearance = async () => {
    try {
      const values = await appearanceForm.validateFields();
      await updateMutation.mutateAsync({ logoUrl: values.logoUrl || null });
      message.success(t('workspace.saveSuccess'));
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in (e as Record<string, unknown>)) return;
      message.error(extractErrorMessage(e, t('workspace.saveFailed')));
    }
  };

  const doDelete = async () => {
    if (!workspace) return;
    try {
      await deleteMutation.mutateAsync(workspace.id);
      message.success(t('workspace.deleteSuccess'));
      navigate('/workspace', { replace: true });
    } catch (e) {
      message.error(extractErrorMessage(e, t('workspace.deleteFailed')));
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
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

    if (!workspace) {
      return <Alert type="error" showIcon message={t('workspace.notFound')} />;
    }

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {workspace.name}
        </Typography.Title>
        {!isOwner && (
          <Alert
            type="info"
            showIcon
            message={t('workspace.readonlyHint')}
            style={{ marginBottom: 0 }}
          />
        )}

        <Card id="ws-basic" title={t('workspace.sectionBasic')}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Form form={basicForm} layout="vertical" disabled={!isOwner}>
              <Form.Item
                label={t('workspace.name')}
                name="name"
                rules={[
                  { required: true, message: t('workspace.nameRequired') },
                  { min: 1, max: 50, message: t('workspace.nameRule') },
                ]}
              >
                <Input />
              </Form.Item>
            </Form>

            <Space wrap>
              <Tag>{workspace.slug}</Tag>
              <Tag color={workspace.status === 'archived' ? 'default' : 'blue'}>
                {workspace.status === 'archived'
                  ? t('workspace.statusArchived')
                  : t('workspace.statusActive')}
              </Tag>
              <Typography.Text type="secondary">
                {t('workspace.createdAt', { value: formatIso(workspace.createdAt) })}
              </Typography.Text>
            </Space>

            {isOwner && (
              <Button type="primary" loading={updateMutation.isPending} onClick={saveBasic}>
                {t('common.save')}
              </Button>
            )}
          </Space>
        </Card>

        <Card id="ws-appearance" title={t('workspace.sectionAppearance')}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Form form={appearanceForm} layout="vertical" disabled={!isOwner}>
              <Form.Item label={t('workspace.logoUrl')} name="logoUrl">
                <Input placeholder={t('workspace.logoPlaceholder')} />
              </Form.Item>
            </Form>
            {isOwner && (
              <Button type="primary" loading={updateMutation.isPending} onClick={saveAppearance}>
                {t('common.save')}
              </Button>
            )}
          </Space>
        </Card>

        <Card
          id="ws-danger"
          title={t('workspace.sectionDanger')}
          styles={{ header: { borderBottomColor: 'rgba(255, 77, 79, 0.2)' } }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">{t('workspace.deleteDangerHint')}</Typography.Text>
            {isOwner ? (
              <Button danger onClick={() => setDeleteOpen(true)}>
                {t('workspace.delete')}
              </Button>
            ) : (
              <Typography.Text type="secondary">{t('workspace.deleteOwnerOnly')}</Typography.Text>
            )}
          </Space>
        </Card>
      </Space>
    );
  };

  return (
    <Layout style={{ minHeight: '100vh', minWidth: 'var(--tdy-min-width)' }}>
      <Sider width={240} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: 16 }}>
          <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/workspace')}>
            {t('workspace.backToList')}
          </Button>
          <Typography.Title level={5} style={{ marginTop: 12, marginBottom: 0 }}>
            {t('workspace.settingsTitle')}
          </Typography.Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeKey]}
          onClick={(e) => scrollTo(e.key as SectionKey)}
          items={[
            { key: 'basic', label: t('workspace.sectionBasic') },
            { key: 'appearance', label: t('workspace.sectionAppearance') },
            { key: 'danger', label: t('workspace.sectionDanger') },
          ]}
        />
      </Sider>
      <Content style={{ padding: 24 }}>{renderContent()}</Content>

      <Modal
        title={t('workspace.deleteTitle')}
        open={deleteOpen}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteName('');
        }}
        okText={t('workspace.delete')}
        okButtonProps={{
          danger: true,
          loading: deleteMutation.isPending,
          disabled: !workspace || deleteName.trim() !== workspace.name,
        }}
        cancelText={t('common.cancel')}
        onOk={doDelete}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t('workspace.deleteModalHint')}
          </Typography.Paragraph>
          <Input
            value={deleteName}
            onChange={(e) => setDeleteName(e.target.value)}
            placeholder={t('workspace.deleteModalPlaceholder')}
          />
        </Space>
      </Modal>
    </Layout>
  );
}
