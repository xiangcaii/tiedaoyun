/**
 * 路由表（feature.md §5.1）。
 *
 * - 全部页面懒加载（React.lazy + Suspense + Spin fallback）
 * - /login：已登录跳 /workspace
 * - /workspace：RequireAuth 守卫，登录后落地页
 * - /：重定向 /workspace
 * - *：NotFound
 */
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuthStore } from './stores/auth.store';
import { RequireAuth } from './routes/RequireAuth';

const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const WorkspacePlaceholderPage = lazy(() => import('./pages/workspace/WorkspacePlaceholderPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageSpin() {
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

/** 已登录用户访问 /login 时跳 /workspace */
function GuestOnly({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  if (status === 'authed' && user) {
    return <Navigate to="/workspace" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<PageSpin />}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestOnly>
              <LoginPage />
            </GuestOnly>
          }
        />
        <Route
          path="/workspace"
          element={
            <RequireAuth>
              <WorkspacePlaceholderPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/workspace" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
