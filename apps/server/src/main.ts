/**
 * NestJS 服务启动入口（HLD §4.1、§11.2）。
 *
 * 启动流程：
 * 1. 创建 Nest 应用，启用 pino 作为默认 Logger（bufferLogs 确保启动期日志也走 pino）。
 * 2. 全局中间件：Helmet（安全响应头）、CORS。
 * 3. 全局管道：ValidationPipe（whitelist + transform，对齐 HLD §6.1 输入校验）。
 * 4. 全局过滤器：AllExceptionsFilter（统一错误响应形状）。
 * 5. 监听 SERVER_HOST:SERVER_PORT。
 *
 * 健康检查端点 /healthz、/readyz 由 HealthController 提供，不挂全局前缀，
 * 便于 docker / nginx 直接探活；业务 API 统一挂载 /api/v1 前缀（T7 起生效）。
 */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exception.filter';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // pino 接管所有日志（含 NestJS 内部启动日志）。
  app.useLogger(app.get(Logger));

  // 安全响应头 & 跨域。
  app.use(helmet());
  app.enableCors();

  // 全局输入校验：剥离未声明字段、自动类型转换、拒绝非白名单字段。
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 全局异常过滤器：注入 HttpAdapterHost 以兼容非 Express 适配器。
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  // T7: 业务 API 统一前缀 /api/v1（健康检查端点 /healthz、/readyz 不受影响）。
  app.setGlobalPrefix('api/v1');

  // T6: 启用优雅关闭，确保 Prisma 连接在 SIGTERM 时正确释放。
  app.enableShutdownHooks();

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('server.port', { infer: true }) ?? 3000;
  const host = config.get('server.host', { infer: true }) ?? '0.0.0.0';

  await app.listen(port, host);

  const logger = app.get(Logger);
  logger.log(`🚀 铁道云后端已启动：http://${host}:${port}`);
  logger.log(`   healthz → http://${host}:${port}/healthz`);
  logger.log(`   readyz  → http://${host}:${port}/readyz`);
}

void bootstrap();
