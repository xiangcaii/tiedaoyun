/**
 * 鉴权共享类型（MVP 计划 T29 / features/authentication.md §4 API 契约）。
 *
 * 前后端共用，确保 auth 端点请求/响应形态一致。
 * 后端成功响应为裸业务对象（不做 `{ code, data }` 包装，见 feature.md §4.5）。
 * refresh token 走 httpOnly cookie，不出现在任何响应体中。
 */

/** 用户状态（与 Prisma enum UserStatus 对齐） */
export type UserStatus = 'ACTIVE' | 'DISABLED';

/**
 * 安全用户对象（剥除 passwordHash）。
 * feature.md §4.1 / §4.4 返回的用户形态。
 */
export interface SafeUser {
  id: string;
  email: string;
  /** 用户显示名，当前 DB 非空；保留 null 以兼容后续可空调整 */
  name: string | null;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /auth/login 请求体 */
export interface LoginRequest {
  email: string;
  password: string;
}

/** POST /auth/login 成功响应（200，裸对象） */
export interface LoginResponse {
  accessToken: string;
  user: SafeUser;
}

/** POST /auth/refresh 成功响应（200，裸对象；refreshToken 仅在 Set-Cookie） */
export interface RefreshResponse {
  accessToken: string;
}

/** POST /auth/logout 成功响应（200，裸对象） */
export interface LogoutResponse {
  message: string;
}

/** GET /me 成功响应（200，裸对象，即 SafeUser） */
export type MeResponse = SafeUser;
