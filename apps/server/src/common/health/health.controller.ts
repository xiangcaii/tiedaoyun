/**
 * 健康检查端点（HLD §11.2 可观测）。
 *
 * - GET /healthz  : liveness，进程存活即返回 200，不依赖下游。
 * - GET /readyz   : readiness，依赖就绪才返回 200；DB 不可用时 503。
 *   T6 接入 Prisma 后 db 探针执行 `SELECT 1`；Redis 待 T19 接入。
 */
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { nowISO } from '@tiedaoyun/utils';
import { PrismaService } from '../../infra/prisma/prisma.service';

const STARTED_AT = Date.now();

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  timestamp: string;
  checks?: Record<string, { status: 'ok' | 'skipped' | 'error'; detail?: string }>;
}

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  liveness(): HealthResponse {
    return {
      status: 'ok',
      uptime: Date.now() - STARTED_AT,
      timestamp: nowISO(),
    };
  }

  @Get('readyz')
  async readiness(): Promise<HealthResponse> {
    const checks: HealthResponse['checks'] = {};

    // T6: 真实 DB 探针（SELECT 1）
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks!.db = { status: 'ok' };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'Database not ready',
        status: 'degraded',
        uptime: Date.now() - STARTED_AT,
        timestamp: nowISO(),
        checks: {
          db: { status: 'error', detail },
          redis: { status: 'skipped', detail: 'redis not wired (T19)' },
        },
      });
    }

    checks!.redis = { status: 'skipped', detail: 'redis not wired (T19)' };

    return {
      status: 'ok',
      uptime: Date.now() - STARTED_AT,
      timestamp: nowISO(),
      checks,
    };
  }
}
