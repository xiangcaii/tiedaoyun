/**
 * JWT Auth Guard（基于 passport-jwt 策略）。
 *
 * 用法：在 Controller 或路由上使用 `@UseGuards(JwtAuthGuard)`。
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
