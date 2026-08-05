/**
 * AuthController — 鉴权相关端点（架构总览 §6.3 / features/authentication.md §4）。
 *
 * - POST /api/v1/auth/login    — 邮箱密码登录，accessToken 走响应体，refreshToken 走 httpOnly cookie
 * - POST /api/v1/auth/refresh  — 从 cookie 读取 refreshToken，滚动续期
 * - POST /api/v1/auth/logout   — 清除 refresh cookie
 * - GET  /api/v1/me            — 当前用户信息（Bearer JWT）
 *
 * refresh token 永远不进入响应体；cookie path 限定 /api/v1/auth/refresh，
 * 前端 JS 不可读（feature.md §6.2）。
 */
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService, type JwtPayload } from './auth.service';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AppConfig } from '../../config/configuration';
import type { Request, Response, CookieOptions } from 'express';
import type { SafeUser } from '@tiedaoyun/schema-types';

/** 扩展 Express Request，由 JwtStrategy 注入 user */
interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /** 账号密码登录：下发 accessToken（响应体）+ refreshToken（httpOnly cookie） */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; user: SafeUser }> {
    const { tokens, user } = await this.authService.login(dto.email, dto.password);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user: this.toSafeUser(user) };
  }

  /** 刷新 accessToken：从 cookie 读取 refreshToken，滚动续期重发 cookie */
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const cookieName = this.cookieConfig.name;
    const refreshToken = req.cookies?.[cookieName];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token 缺失 / 无效或已过期');
    }
    const tokens = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  /** 登出：清除 refresh cookie（无 cookie 也返回成功） */
  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ message: string }> {
    res.clearCookie(this.cookieConfig.name, { path: this.cookieConfig.path });
    return { message: '已登出' };
  }

  /** 获取当前登录用户信息 */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: AuthenticatedRequest): Promise<SafeUser> {
    const user = await this.userService.findById(req.user.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    return this.toSafeUser(user);
  }

  // ---- 私有辅助 ----

  private get cookieConfig() {
    return this.configService.get('auth.cookie', { infer: true })!;
  }

  /** 下发 refresh token httpOnly cookie（feature.md §4.1 / §6.2） */
  private setRefreshCookie(res: Response, refreshToken: string): void {
    const cfg = this.cookieConfig;
    const options: CookieOptions = {
      httpOnly: true,
      path: cfg.path,
      sameSite: cfg.sameSite,
      secure: cfg.secure,
      maxAge: cfg.maxAge * 1000,
    };
    res.cookie(cfg.name, refreshToken, options);
  }

  /** Prisma User → SafeUser（剥除 passwordHash，序列化日期为 ISO 字符串） */
  private toSafeUser(user: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status as SafeUser['status'],
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
