/**
 * AuthService 单元测试（Vitest，HLD T7）。
 *
 * 覆盖：登录成功 / 失败 / token 过期 / 刷新 token。
 * 由于 signAsync 是异步密文操作，此处验证 AuthService 的返回形状
 * 与异常抛出行为，不对比具体 token 字符串。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

const TEST_ACCESS_SECRET = 'test-access-secret-min-16chars';
const TEST_REFRESH_SECRET = 'test-refresh-secret-min-16chars';

/** 构建一个最小可用的 ConfigService mock */
function mockConfigService(overrides?: Partial<Record<string, string>>) {
  return {
    get: vi.fn((key: string) => {
      if (key === 'jwt') {
        return {
          accessSecret: overrides?.JWT_ACCESS_SECRET ?? TEST_ACCESS_SECRET,
          refreshSecret: overrides?.JWT_REFRESH_SECRET ?? TEST_REFRESH_SECRET,
          accessTtl: overrides?.JWT_ACCESS_TTL ?? '1s', // 短 TTL 便于测过期
          refreshTtl: overrides?.JWT_REFRESH_TTL ?? '1h',
          algorithm: 'HS256',
        };
      }
      return undefined;
    }),
  } as unknown as ConfigService;
}

function mockUserService() {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    updateLastLogin: vi.fn(),
    create: vi.fn(),
  } as unknown as UserService;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let userService: ReturnType<typeof mockUserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useFactory: mockConfigService,
        },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: TEST_ACCESS_SECRET,
            signOptions: { expiresIn: '1s' },
          }),
        },
        {
          provide: UserService,
          useFactory: mockUserService,
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    jwtService = module.get(JwtService);
    userService = module.get(UserService) as unknown as ReturnType<typeof mockUserService>;

    // 重置所有 mock
    vi.clearAllMocks();
  });

  // ------- validateUser -------

  describe('validateUser', () => {
    it('返回 null 当用户不存在', async () => {
      userService.findByEmail.mockResolvedValue(null);

      const result = await authService.validateUser('no@test.com', 'pwd');
      expect(result).toBeNull();
    });

    it('返回 null 当密码错误', async () => {
      const hashedPwd = await authService.hashPassword('correct');
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });

      const result = await authService.validateUser('u@test.com', 'wrong');
      expect(result).toBeNull();
    });

    it('返回用户信息（不含 passwordHash）当凭据正确', async () => {
      const hashedPwd = await authService.hashPassword('correct');
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        name: 'Test',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });

      const result = await authService.validateUser('u@test.com', 'correct');
      expect(result).not.toBeNull();
      expect(result!).not.toHaveProperty('passwordHash');
      expect(result!.email).toBe('u@test.com');
    });
  });

  // ------- login -------

  describe('login', () => {
    it('登录成功返回 token 对 + 用户信息', async () => {
      const hashedPwd = await authService.hashPassword('pwd');
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        name: 'Test',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });
      userService.updateLastLogin.mockResolvedValue(undefined);

      const result = await authService.login('u@test.com', 'pwd');
      expect(result).toHaveProperty('tokens');
      expect(result.tokens).toHaveProperty('accessToken');
      expect(result.tokens).toHaveProperty('refreshToken');
      expect(typeof result.tokens.accessToken).toBe('string');
      expect(result.tokens.accessToken.length).toBeGreaterThan(0);
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(userService.updateLastLogin).toHaveBeenCalledWith('u1');
    });

    it('登录失败（错误密码）抛出 UnauthorizedException', async () => {
      const hashedPwd = await authService.hashPassword('correct');
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });

      await expect(authService.login('u@test.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    });

    it('登录失败（用户被禁用）抛出 UnauthorizedException', async () => {
      const hashedPwd = await authService.hashPassword('pwd');
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        passwordHash: hashedPwd,
        status: 'DISABLED',
      });

      await expect(authService.login('u@test.com', 'pwd')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ------- refresh -------

  describe('refresh', () => {
    it('有效 refresh token 返回新 token 对', async () => {
      const hashedPwd = await authService.hashPassword('pwd');
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        name: 'Test',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });
      userService.findById.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        name: 'Test',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });
      userService.updateLastLogin.mockResolvedValue(undefined);

      // 先登录拿到 refresh token
      const loginResult = await authService.login('u@test.com', 'pwd');

      const refreshed = await authService.refresh(loginResult.tokens.refreshToken);
      expect(refreshed).toHaveProperty('accessToken');
      expect(refreshed).toHaveProperty('refreshToken');
      expect(typeof refreshed.accessToken).toBe('string');
      expect(refreshed.accessToken.length).toBeGreaterThan(0);
    });

    it('无效 refresh token 抛出 UnauthorizedException', async () => {
      await expect(authService.refresh('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('用户已被禁用的 refresh token 抛出 UnauthorizedException', async () => {
      const hashedPwd = await authService.hashPassword('pwd');
      // 首次登录成功
      userService.findByEmail.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        passwordHash: hashedPwd,
        status: 'ACTIVE',
      });
      userService.findById.mockResolvedValue({
        id: 'u1',
        email: 'u@test.com',
        passwordHash: hashedPwd,
        status: 'DISABLED', // 之后被禁用
      });
      userService.updateLastLogin.mockResolvedValue(undefined);

      const loginResult = await authService.login('u@test.com', 'pwd');

      await expect(authService.refresh(loginResult.tokens.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ------- token 过期 -------

  describe('token expiry', () => {
    it('过期的 access token 无法被 jwtService 验证', async () => {
      const secret = TEST_ACCESS_SECRET;
      const shortJwtService = new JwtService({
        secret,
        signOptions: { expiresIn: '0s' },
      });

      const token = await shortJwtService.signAsync({ sub: 'u1', email: 'u@t.com' });

      // 等待 1ms 确保过期
      await new Promise((r) => setTimeout(r, 10));

      expect(() => jwtService.verify(token, { secret })).toThrow();
    });
  });

  // ------- hashPassword -------

  describe('hashPassword', () => {
    it('返回 60 字符的 bcrypt 哈希', async () => {
      const hash = await authService.hashPassword('hello');
      expect(hash).toHaveLength(60);
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });
  });
});
