/**
 * axios 实例 + 拦截器（apps/web AGENTS.md「API 调用约定」+ feature.md §2.3）。
 *
 * - withCredentials: true（refresh token 走 httpOnly cookie，必需）
 * - 请求拦截器：从 auth.store 读 accessToken，注入 Authorization: Bearer
 * - 响应成功拦截器：直接返回 response.data（后端成功响应为裸业务对象）
 * - 响应错误拦截器：401 自动刷新（排除 /auth/login、/auth/refresh），
 *   promise 队列去重，并发请求只刷新一次；成功重放原请求，失败清 store 跳 /login
 */
import axios, {
  type AxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '../stores/auth.store';
import type { RefreshResponse } from '@tiedaoyun/schema-types';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const http = axios.create({ baseURL, withCredentials: true });

/** 标记已重放，避免刷新后再次 401 死循环 */
interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

function isAuthEndpoint(url?: string): boolean {
  return !!url && (url.includes('/auth/login') || url.includes('/auth/refresh'));
}

// ---- 请求拦截器：注入 Bearer token ----
http.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- 响应成功拦截器：unwrap response.data ----
http.interceptors.response.use((response: AxiosResponse) => response.data);

// ---- 401 自动刷新（promise 队列去重）----
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = http
    .post<unknown, RefreshResponse>('/auth/refresh')
    .then((data) => {
      useAuthStore.getState().setAccessToken(data.accessToken);
      return data.accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as RetriableConfig | undefined;
  const status = error.response?.status;
  if (status === 401 && original && !isAuthEndpoint(original.url) && !original._retried) {
    original._retried = true;
    try {
      const newToken = await refreshAccessToken();
      original.headers = original.headers ?? {};
      original.headers.Authorization = `Bearer ${newToken}`;
      return http.request(original);
    } catch {
      useAuthStore.getState().clearAuth();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      return Promise.reject(error);
    }
  }
  return Promise.reject(error);
});

// ---- 类型化便捷方法（响应已被拦截器 unwrap，运行期直接返回业务对象）----

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return (await http.get(url, config)) as unknown as T;
}

export async function post<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  return (await http.post(url, body, config)) as unknown as T;
}

/** 后端错误响应形态（all-exception.filter.ts） */
export interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  errors?: unknown;
  timestamp?: string;
  path?: string;
}

/** 从 axios 错误中提取面向用户的 message */
export function extractErrorMessage(error: unknown, fallback: string): string {
  const envelope = (error as AxiosError<ErrorEnvelope>)?.response?.data;
  if (envelope && typeof envelope.message === 'string' && envelope.message.length > 0) {
    return envelope.message;
  }
  return fallback;
}
