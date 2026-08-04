import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../i18n';
import LoginPage from './LoginPage';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ state: null }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../stores/auth.store', () => ({
  useAuthStore: (selector: (state: { setAuth: () => void }) => unknown) =>
    selector({ setAuth: vi.fn() }),
}));

describe('LoginPage', () => {
  it('renders the industrial blueprint style login content', () => {
    const html = renderToStaticMarkup(<LoginPage />);

    expect(html).toContain('自部署、可扩展的低代码平台');
    expect(html).toContain('数据模型');
    expect(html).toContain('流程编排');
    expect(html).toContain('权限控制');
    expect(html).toContain('登录后进入工作空间');
  });

  it('renders the password hint inside the password placeholder', () => {
    const html = renderToStaticMarkup(<LoginPage />);

    expect(html).toContain('placeholder="请输入密码（至少 6 位）"');
    expect(html).not.toContain('&gt;至少 6 位&lt;');
  });

  it('uses a compact 36px input height', () => {
    const css = readFileSync(new URL('./LoginPage.css', import.meta.url), 'utf8');
    expect(css).toContain('min-height: 36px;');
  });
});
