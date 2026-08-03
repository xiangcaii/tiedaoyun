/** 404 页（feature.md §5.1，AntD Result 简单实现） */
import { Result, Button } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="404"
      subTitle={t('common.notFound')}
      extra={
        <Button type="primary" onClick={() => navigate('/workspace', { replace: true })}>
          {t('common.backHome')}
        </Button>
      }
    />
  );
}
