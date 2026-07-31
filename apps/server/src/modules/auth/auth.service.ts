/**
 * AuthService — 登录、刷新、鉴权核心逻辑（HLD §7.1）。
 *
 * - 密码使用 bcrypt（cost 12）。
 * - JWT Access Token：15 分钟（HS256）。
 * - JWT Refresh Token：7 天，可用于刷新 Access Token。
 * - 多端登录：token 独立签发，无需 session 表。
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UserService } from '../user/user.service';
import type { User } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';

const BCRYPT_COST = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string; // user.id
  email: string;
}

@Injectable()
export class AuthService {
  private readonly jwtConfig: AppConfig['jwt'];

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly userService: UserService,
  ) {
    this.jwtConfig = this.configService.get('jwt', { infer: true })!;
  }

  /** 验证邮箱+密码，返回用户（不抛异常返回 null） */
  async validateUser(email: string, password: string): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.userService.findByEmail(email);
    if (!user || user.status === 'DISABLED') return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    const { passwordHash: _, ...result } = user;
    return result;
  }

  /** 登录：校验账号密码，返回 token 对 + 用户信息 */
  async login(
    email: string,
    password: string,
  ): Promise<{ tokens: TokenPair; user: Omit<User, 'passwordHash'> }> {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const tokens = await this.generateTokens({ sub: user.id, email: user.email });
    await this.userService.updateLastLogin(user.id);

    return { tokens, user };
  }

  /** 刷新 Access Token（验证 Refresh Token 有效后签发新的 token 对） */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      const decoded = this.jwtService.verify<JwtPayload & { exp: number; iat: number }>(
        refreshToken,
        { secret: this.jwtConfig.refreshSecret },
      );
      // 只提取自定义 claims，避免 exp/iat 与 signAsync 的 expiresIn 冲突
      payload = { sub: decoded.sub, email: decoded.email };
    } catch {
      throw new UnauthorizedException('Refresh token 无效或已过期');
    }

    const user = await this.userService.findById(payload.sub);
    if (!user || user.status === 'DISABLED') {
      throw new UnauthorizedException('用户不存在或已被禁用');
    }

    return this.generateTokens(payload);
  }

  /** 生成 Access + Refresh Token 对 */
  private async generateTokens(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        payload as unknown as object,
        {
          secret: this.jwtConfig.accessSecret,
          expiresIn: this.jwtConfig.accessTtl,
        } as any,
      ),
      this.jwtService.signAsync(
        payload as unknown as object,
        {
          secret: this.jwtConfig.refreshSecret,
          expiresIn: this.jwtConfig.refreshTtl,
        } as any,
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /** 密码哈希（供用户创建时使用） */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }
}
