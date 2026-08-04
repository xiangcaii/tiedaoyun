import { Form, Input } from 'antd';
import type { FormInstance } from 'antd';
import { useTranslation } from 'react-i18next';

export interface WorkspaceCreateValues {
  name: string;
  slug: string;
  logoUrl?: string;
}

interface WorkspaceCreateFormProps {
  form: FormInstance<WorkspaceCreateValues>;
  onNameChange: (value: string) => void;
  onSlugChange: () => void;
}

export default function WorkspaceCreateForm({
  form,
  onNameChange,
  onSlugChange,
}: WorkspaceCreateFormProps) {
  const { t } = useTranslation();

  return (
    <Form form={form} layout="vertical" initialValues={{ name: '', slug: '', logoUrl: '' }}>
      <Form.Item
        label={t('workspace.name')}
        name="name"
        rules={[
          { required: true, message: t('workspace.nameRequired') },
          { min: 1, max: 50, message: t('workspace.nameRule') },
        ]}
      >
        <Input onChange={(e) => onNameChange(e.target.value)} />
      </Form.Item>

      <Form.Item
        label={t('workspace.slug')}
        name="slug"
        rules={[
          { required: true, message: t('workspace.slugRequired') },
          { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: t('workspace.slugRule') },
        ]}
      >
        <Input
          onChange={onSlugChange}
          placeholder={t('workspace.slugPlaceholder')}
          autoComplete="off"
        />
      </Form.Item>

      <Form.Item label={t('workspace.logoUrl')} name="logoUrl">
        <Input placeholder={t('workspace.logoPlaceholder')} />
      </Form.Item>
    </Form>
  );
}
