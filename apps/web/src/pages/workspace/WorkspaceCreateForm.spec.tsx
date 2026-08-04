import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Form } from 'antd';
import '../../i18n';
import WorkspaceCreateForm from './WorkspaceCreateForm';

function FormWrapper() {
  const [form] = Form.useForm<{ name: string; slug: string; logoUrl?: string }>();

  return (
    <WorkspaceCreateForm
      form={form}
      onNameChange={() => undefined}
      onSlugChange={() => undefined}
    />
  );
}

describe('WorkspaceCreateForm', () => {
  it('marks required fields with required label styles', () => {
    const html = renderToStaticMarkup(<FormWrapper />);

    expect(html).toContain('ant-form-item-required');
  });
});
