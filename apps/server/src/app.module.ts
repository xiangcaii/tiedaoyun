/**
 * 应用根模块（HLD §4.1）。
 *
 * T5 阶段聚合：
 * - ConfigModule：环境变量加载 + class-validator 校验（config/）
 * - LoggerModule（nestjs-pino）：结构化日志（config/logger.config.ts）
 * - HealthController：/healthz、/readyz
 *
 * T6 阶段聚合：
 * - PrismaModule：全局数据连接（infra/prisma/）
 *
 * T7 阶段聚合：
 * - AuthModule：鉴权（modules/auth/）
 * - UserModule：用户服务（modules/user/）
 *
 * T8 阶段聚合：
 * - WorkspaceModule：工作空间 + 成员（modules/workspace/）
 * - RoleModule：角色 + 权限点（modules/role/）
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { buildPinoConfig } from './config/logger.config';
import { HealthController } from './common/health/health.controller';
import { PrismaModule } from './infra/prisma/prisma.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { RoleModule } from './modules/role/role.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 同时支持 apps/server/.env 与仓库根 .env，前者优先。
      envFilePath: ['.env', '../../.env'],
      load: [configuration],
      validate: validateEnv,
    }),
    LoggerModule.forRoot(buildPinoConfig()),
    PrismaModule,
    UserModule,
    AuthModule,
    WorkspaceModule,
    RoleModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
