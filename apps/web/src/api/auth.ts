/**
 * Auth API（feature.md §4 端点契约）。
 *
 * 后端成功响应为裸业务对象；refresh token 不出现在响应体（仅 Set-Cookie）。
 */
import { get, post } from './http';
import type {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  LogoutResponse,
  MeResponse,
} from '@tiedaoyun/schema-types';

/** POST /auth/login */
export function login(req: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', req);
}

/** POST /auth/refresh（cookie 自动携带） */
export function refresh(): Promise<RefreshResponse> {
  return post<RefreshResponse>('/auth/refresh');
}

/** POST /auth/logout */
export function logout(): Promise<LogoutResponse> {
  return post<LogoutResponse>('/auth/logout');
}

/** GET /me */
export function fetchMe(): Promise<MeResponse> {
  return get<MeResponse>('/me');
}
