/**
 * AuthController 单元测试（Vitest，features/2026-08-03-login.md §7）。
 *
 * 覆盖 cookie 行为：
 * - login 下发 httpOnly cookie（path=/api/v1/auth/refresh），响应体不含 refreshToken
 * - refresh 从 cookie 读取 refreshToken，并滚动续期重发 cookie
 * - logout 清除 cookie（path 与下发一致）
 * - refresh 缺失 cookie 返回 401
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService, type TokenPair, type JwtPayload } from './auth.service';
import { UserService } from '../user/user.service';

const COOKIE_NAME = 'tdy_rt';
const COOKIE_PATH = '/api/v1/auth/refresh';

/** 最小可用的 cookie 配置（与 configuration.ts 默认一致） */
const COOKIE_CFG = {
  name: COOKIE_NAME,
  path: COOKIE_PATH,
  secure: false,
  sameSite: 'lax' as const,
  maxAge: 604800,
};

function mockConfigService() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'auth.cookie') return COOKIE_CFG;
      return undefined;
    }),
  } as unknown as ConfigService;
}

/** 构造一个 fake express Response，记录 cookie 操作 */
function fakeResponse() {
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  const cleared: { name: string; options: Record<string, unknown> }[] = [];
  const res = {
    cookie: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
      cookies[name] = { value, options };
      return res;
    }),
    clearCookie: vi.fn((name: string, options: Record<string, unknown>) => {
      cleared.push({ name, options });
      return res;
    }),
  };
  return { cookies, cleared, res };
}

function mockAuthService() {
  return {
    login: vi.fn(),
    refresh: vi.fn(),
    validateUser: vi.fn(),
    hashPassword: vi.fn(),
  } as unknown as AuthService;
}

function mockUserService() {
  return {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    updateLastLogin: vi.fn(),
  } as unknown as UserService;
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof mockAuthService>;
  let userService: ReturnType<typeof mockUserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useFactory: mockAuthService },
        { provide: UserService, useFactory: mockUserService },
        { provide: ConfigService, useFactory: mockConfigService },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService) as unknown as ReturnType<typeof mockAuthService>;
    userService = module.get(UserService) as unknown as ReturnType<typeof mockUserService>;
    vi.clearAllMocks();
  });

  // ------- login -------

  describe('login', () => {
    it('下发 httpOnly cookie（path=/api/v1/auth/refresh），响应体不含 refreshToken', async () => {
      const tokens: TokenPair = { accessToken: 'access-jwt', refreshToken: 'refresh-jwt' };
      const now = new Date();
      authService.login.mockResolvedValue({
        tokens,
        user: {
          id: 'u1',
          email: 'u@test.com',
          name: 'Test',
          passwordHash: 'x',
          status: 'ACTIVE',
          lastLoginAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

      const fr = fakeResponse();
      const result = await controller.login(
        { email: 'u@test.com', password: 'pwd' },
        fr.res as any,
      );

      // 响应体只含 accessToken + user
      expect(result).toHaveProperty('accessToken', 'access-jwt');
      expect(result).not.toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user.email).toBe('u@test.com');

      // cookie 下发参数
      expect(fr.res.cookie).toHaveBeenCalledWith(
        COOKIE_NAME,
        'refresh-jwt',
        expect.objectContaining({
          httpOnly: true,
          path: COOKIE_PATH,
          sameSite: 'lax',
          secure: false,
        }),
      );
    });
  });

  // ------- refresh -------

  describe('refresh', () => {
    it('从 cookie 读取 refreshToken 并滚动续期重发 cookie', async () => {
      const newTokens: TokenPair = { accessToken: 'access-2', refreshToken: 'refresh-2' };
      authService.refresh.mockResolvedValue(newTokens);

      const fr = fakeResponse();
      const req = { cookies: { [COOKIE_NAME]: 'old-refresh' } } as any;

      const result = await controller.refresh(req, fr.res as any);

      expect(authService.refresh).toHaveBeenCalledWith('old-refresh');
      expect(result).toEqual({ accessToken: 'access-2' });
      expect(result).not.toHaveProperty('refreshToken');
      // 滚动续期：重发 cookie
      expect(fr.res.cookie).toHaveBeenCalledWith(
        COOKIE_NAME,
        'refresh-2',
        expect.objectContaining({ httpOnly: true, path: COOKIE_PATH }),
      );
    });

    it('缺失 cookie 抛出 UnauthorizedException', async () => {
      const fr = fakeResponse();
      const req = { cookies: {} } as any;

      await expect(controller.refresh(req, fr.res as any)).rejects.toThrow(UnauthorizedException);
      expect(authService.refresh).not.toHaveBeenCalled();
      // 缺 cookie 时不应下发新 cookie
      expect(fr.res.cookie).not.toHaveBeenCalled();
    });
  });

  // ------- logout -------

  describe('logout', () => {
    it('清除 cookie，path 与下发时一致', async () => {
      const fr = fakeResponse();
      const result = await controller.logout(fr.res as any);

      expect(result).toEqual({ message: '已登出' });
      expect(fr.res.clearCookie).toHaveBeenCalledWith(COOKIE_NAME, { path: COOKIE_PATH });
    });
  });

  // ------- me -------

  describe('me', () => {
    it('返回当前用户（剥除 passwordHash，日期序列化为 ISO）', async () => {
      const now = new Date('2026-08-03T10:00:00.000Z');
      userService.findById.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        name: 'Test',
        passwordHash: 'x',
        status: 'ACTIVE',
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const result = await controller.me({ user: { sub: 'u1', email: 'u@test.com' } } as any);

      expect(result).not.toHaveProperty('passwordHash');
      expect(result.id).toBe('u1');
      expect(result.lastLoginAt).toBe(now.toISOString());
      expect(result.createdAt).toBe(now.toISOString());
    });

    it('用户不存在抛 UnauthorizedException', async () => {
      userService.findById.mockResolvedValue(null);
      await expect(
        controller.me({ user: { sub: 'x', email: 'x@t.com' } as JwtPayload } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
