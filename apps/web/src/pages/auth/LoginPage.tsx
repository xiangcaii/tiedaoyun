/**
 * 登录页（feature.md §5.2）。
 *
 * - AntD Form：email（required + email 正则）、password（required，前端最小 6 位仅提示）
 * - 错误反馈：Alert 读取后端 message；401 显示「邮箱或密码错误」
 * - 成功：store.setAuth → 跳转 from ?? '/workspace'
 * - 四态：空 / 加载（Spin 包裹按钮，不改变布局）/ 错误 / 正常
 */
import { useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Space, Spin, Tag, Typography } from 'antd';
import {
  DatabaseOutlined,
  DeploymentUnitOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { login } from '../../api/auth';
import { extractErrorMessage } from '../../api/http';
import { useAuthStore } from '../../stores/auth.store';
import type { LoginRequest } from '@tiedaoyun/schema-types';
import loginBackground from '../../assets/images/login-background.png';
import './LoginPage.css';

interface FromState {
  from?: { pathname?: string };
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as FromState | null)?.from?.pathname ?? '/workspace';
  const features = [
    {
      icon: <DatabaseOutlined />,
      title: t('login.featureModel'),
      description: t('login.featureModelDesc'),
    },
    {
      icon: <DeploymentUnitOutlined />,
      title: t('login.featureFlow'),
      description: t('login.featureFlowDesc'),
    },
    {
      icon: <SafetyOutlined />,
      title: t('login.featurePermission'),
      description: t('login.featurePermissionDesc'),
    },
  ];

  const onFinish = async (values: LoginRequest) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(values);
      setAuth(res.accessToken, res.user);
      navigate(from, { replace: true });
    } catch (e) {
      setError(extractErrorMessage(e, t('login.errorDefault')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__grid">
        <section className="login-page__brand">
          <span className="login-page__eyebrow">{t('login.eyebrow')}</span>
          <Typography.Title level={1} className="login-page__brand-title">
            {t('app.title')}
          </Typography.Title>
          <Typography.Paragraph className="login-page__brand-subtitle">
            {t('login.platformSubtitle')}
          </Typography.Paragraph>
          <Typography.Paragraph className="login-page__brand-description">
            {t('login.platformDescription')}
          </Typography.Paragraph>

          <Row gutter={[16, 16]} className="login-page__feature-list">
            {features.map((feature) => (
              <Col key={feature.title} span={8}>
                <Card size="small" className="login-page__feature">
                  <Space direction="vertical" size="small">
                    <span className="login-page__feature-icon" aria-hidden="true">
                      {feature.icon}
                    </span>
                    <Typography.Text strong>{feature.title}</Typography.Text>
                    <Typography.Text type="secondary">{feature.description}</Typography.Text>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </section>

        <section className="login-page__auth">
          <div className="login-page__card">
            <Card className="login-page__card">
              <Space direction="vertical" size="middle" className="login-page__card-content">
                <Tag color="processing">{t('login.cardBadge')}</Tag>
                <Typography.Title level={3} className="login-page__card-logo">
                  {t('app.title')}
                </Typography.Title>
                <div>
                  <Typography.Title level={2} className="login-page__card-title">
                    {t('login.cardTitle')}
                  </Typography.Title>
                  <Typography.Paragraph className="login-page__card-description">
                    {t('login.cardDescription')}
                  </Typography.Paragraph>
                </div>

                {error && <Alert type="error" message={error} showIcon />}

                <Form<LoginRequest>
                  className="login-page__form"
                  layout="vertical"
                  onFinish={onFinish}
                  disabled={submitting}
                  initialValues={{ email: '', password: '' }}
                >
                  <Form.Item
                    label={t('login.email')}
                    name="email"
                    rules={[
                      { required: true, message: t('login.emailRequired') },
                      { type: 'email', message: t('login.emailInvalid') },
                    ]}
                  >
                    <Input
                      size="large"
                      prefix={<MailOutlined />}
                      placeholder={t('login.emailPlaceholder')}
                      autoComplete="email"
                    />
                  </Form.Item>

                  <Form.Item
                    label={t('login.password')}
                    name="password"
                    rules={[{ required: true, message: t('login.passwordRequired') }]}
                  >
                    <Input.Password
                      size="large"
                      prefix={<LockOutlined />}
                      placeholder={`${t('login.passwordPlaceholder')}（${t('login.passwordMinHint')}）`}
                      autoComplete="current-password"
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Spin
                      spinning={submitting}
                      size="small"
                      wrapperClassName="login-page__submit-wrap"
                    >
                      <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        block
                        disabled={submitting}
                      >
                        {submitting ? t('login.submitting') : t('login.submit')}
                      </Button>
                    </Spin>
                  </Form.Item>
                </Form>

                <Typography.Text type="secondary" className="login-page__security">
                  <SafetyCertificateOutlined /> {t('login.securityHint')}
                </Typography.Text>
              </Space>
            </Card>
          </div>
        </section>
      </div>
      <div
        aria-hidden="true"
        className="login-page__background"
        style={{ backgroundImage: `url(${loginBackground})` }}
      />
    </div>
  );
}
