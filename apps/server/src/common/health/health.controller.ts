/**
 * 健康检查端点（HLD §11.2 可观测）。
 *
 * - GET /healthz  : liveness，进程存活即返回 200，不依赖下游。
 * - GET /readyz   : readiness，依赖（DB / Redis）就绪才返回 200。
 *   T5 阶段尚未接入 Prisma / Redis，故 readyz 仅做进程级自检并标记
 *   `checks` 为 "skipped"；T6 / T19 引入依赖后在此扩展真实探针。
 */
import { Controller, Get } from '@nestjs/common';
import { nowISO } from '@tiedaoyun/utils';

const STARTED_AT = Date.now();

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  checks?: Record<string, { status: 'ok' | 'skipped'; detail?: string }>;
}

@Controller()
export class HealthController {
  @Get('healthz')
  liveness(): HealthResponse {
    return {
      status: 'ok',
      uptime: Date.now() - STARTED_AT,
      timestamp: nowISO(),
    };
  }

  @Get('readyz')
  readiness(): HealthResponse {
    // T5: 无外部依赖；T6 接入 Prisma、T19 接入 Redis 后改为真实探针。
    return {
      status: 'ok',
      uptime: Date.now() - STARTED_AT,
      timestamp: nowISO(),
      checks: {
        db: { status: 'skipped', detail: 'prisma not wired (T6)' },
        redis: { status: 'skipped', detail: 'redis not wired (T19)' },
      },
    };
  }
}
