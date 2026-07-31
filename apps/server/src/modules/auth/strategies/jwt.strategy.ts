/**
 * JWT Strategy（passport-jwt，HLD §7.1）。
 *
 * 从 Authorization: Bearer <token> 中提取 Access Token 并校验。
 * 校验通过后将 `JwtPayload` 注入 request.user。
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import type { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<AppConfig, true>) {
    const jwtConfig = configService.get('jwt', { infer: true })!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.accessSecret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    // payload 已由 passport-jwt 验签；这里可以做额外权限加载。
    // 返回的对象挂载到 req.user。
    if (!payload.sub) {
      throw new UnauthorizedException('Token 无效');
    }
    return payload;
  }
}
