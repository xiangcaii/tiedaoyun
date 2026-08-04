import { CalendarOutlined, DeleteOutlined, EnterOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Space, Tag, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import type { WorkspaceItem } from '../../api/workspace';
import './workspace-launchpad.css';

export interface WorkspaceLaunchCardProps {
  workspace: WorkspaceItem;
  onOpen: (workspace: WorkspaceItem) => void;
  onDelete: (workspace: WorkspaceItem) => void;
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function WorkspaceLaunchCard({ workspace, onOpen, onDelete }: WorkspaceLaunchCardProps) {
  const { t } = useTranslation();
  const archived = workspace.status === 'archived';

  return (
    <Card className={`workspace-launch-card${archived ? ' workspace-launch-card--archived' : ''}`}>
      <div className="workspace-launch-card__body">
        <div className="workspace-launch-card__identity-rail" aria-hidden="true" />
        <Space className="workspace-launch-card__identity" align="start" size={12}>
          <Avatar
            className="workspace-launch-card__avatar"
            size={40}
            src={workspace.logoUrl ?? undefined}
          >
            {workspace.name.slice(0, 1)}
          </Avatar>
          <div className="workspace-launch-card__details">
            <Typography.Text className="workspace-launch-card__name" strong>
              {workspace.name}
            </Typography.Text>
            <Typography.Text className="workspace-launch-card__slug" type="secondary">
              {workspace.slug}
            </Typography.Text>
          </div>
        </Space>

        <div className="workspace-launch-card__metadata">
          <Tag>{archived ? t('workspace.statusArchived') : t('workspace.statusActive')}</Tag>
          <Typography.Text className="workspace-launch-card__created-at" type="secondary">
            <CalendarOutlined aria-hidden="true" />
            {t('workspace.createdAt', { value: formatCreatedAt(workspace.createdAt) })}
          </Typography.Text>
        </div>
      </div>

      <div className="workspace-launch-card__actions">
        <Button
          type="primary"
          icon={<EnterOutlined />}
          disabled={archived}
          onClick={() => onOpen(workspace)}
        >
          {t('workspace.enter')}
        </Button>
        <Button danger icon={<DeleteOutlined />} onClick={() => onDelete(workspace)}>
          {t('workspace.delete')}
        </Button>
      </div>
    </Card>
  );
}
