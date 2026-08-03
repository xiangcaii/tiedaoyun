/**
 * 路由守卫 RequireAuth（feature.md §2.2 + §5.1）。
 *
 * - status='authed' 且 user 已就绪 → 渲染 <Outlet/>
 * - status='guest' → 跳转 /login（携带 from 位置，登录后回跳）
 * - status='idle'（页面刷新后）→ 调 GET /me 重建会话；axios 拦截器自动处理
 *   401 → refresh → 重放；refresh 失败由拦截器清 store 并跳 /login
 */
import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from '../stores/auth.store';
import { fetchMe } from '../api/auth';

function FullScreenSpin() {
  return (
    <div
      style={{
        minHeight: '100vh',
        minWidth: 'var(--tdy-min-width)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    // 仅在 idle（页面刷新后）时重建会话；已登录态不重复拉 /me
    if (useAuthStore.getState().status !== 'idle') return;
    startedRef.current = true;
    fetchMe()
      .then((u) => useAuthStore.getState().setUser(u))
      .catch(() => useAuthStore.getState().clearAuth());
  }, []);

  if (status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (status === 'authed' && user) {
    return <>{children}</>;
  }
  return <FullScreenSpin />;
}
