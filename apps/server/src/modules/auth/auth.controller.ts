/**
 * AuthController — 鉴权相关端点（HLD §6.3）。
 *
 * - POST /api/v1/auth/login    — 账号密码登录
 * - POST /api/v1/auth/refresh  — 刷新 token
 * - GET  /api/v1/me            — 当前用户信息
 */
import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, type JwtPayload } from './auth.service';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';

/** 扩展 Express Request，由 JwtStrategy 注入 user */
interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  /** 账号密码登录 */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  /** 刷新 token */
  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /** 获取当前登录用户信息 */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.userService.findById(req.user.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    const { passwordHash: _, ...result } = user;
    return result;
  }
}
