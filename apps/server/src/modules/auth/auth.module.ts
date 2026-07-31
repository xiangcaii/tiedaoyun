/**
 * Auth 模块（HLD §4.1 modules/auth）。
 *
 * 聚合：
 * - JwtModule.registerAsync — 按需签名（access / refresh 使用不同密钥）
 * - PassportModule — 策略注册容器
 * - JwtStrategy — 解析 Authorization: Bearer <token>
 * - AuthService / AuthController
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { AppConfig } from '../../config/configuration';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const jwtConfig = config.get('jwt', { infer: true })!;
        // @nestjs/jwt v11 的 signOptions.expiresIn 期望 number | StringValue。
        // 传入字符串 TTL（如 "15m"）在所有 jwt 实现中均被支持，
        // 此处忽略 TS 窄类型约束。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        return {
          secret: jwtConfig.accessSecret,
          signOptions: { expiresIn: jwtConfig.accessTtl },
        } as any;
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
