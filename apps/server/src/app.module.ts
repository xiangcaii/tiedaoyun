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
 * 后续任务（T7 Auth、T8 Workspace …）在此处增量挂载子模块。
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { buildPinoConfig } from './config/logger.config';
import { HealthController } from './common/health/health.controller';
import { PrismaModule } from './infra/prisma/prisma.module';

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
