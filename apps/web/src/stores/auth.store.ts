/**
 * Auth 全局状态（Zustand，apps/web AGENTS.md「API 调用约定」+ feature.md §5.4）。
 *
 * - accessToken 仅存内存，刷新页面即丢失，由路由守卫调 /me + refresh 重建。
 * - 禁止写 localStorage / sessionStorage（refresh token 走 httpOnly cookie）。
 */
import { create } from 'zustand';
import type { SafeUser } from '@tiedaoyun/schema-types';

export type AuthStatus = 'idle' | 'authed' | 'guest';

interface AuthState {
  accessToken: string | null;
  user: SafeUser | null;
  status: AuthStatus;
  setAuth: (accessToken: string, user: SafeUser) => void;
  setAccessToken: (accessToken: string) => void;
  setUser: (user: SafeUser) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: 'idle',
  setAuth: (accessToken, user) => set({ accessToken, user, status: 'authed' }),
  setAccessToken: (accessToken) => set({ accessToken, status: 'authed' }),
  setUser: (user) => set({ user, status: 'authed' }),
  clearAuth: () => set({ accessToken: null, user: null, status: 'guest' }),
}));
