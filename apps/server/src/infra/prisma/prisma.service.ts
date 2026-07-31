/**
 * PrismaService（HLD §4.1 infra/prisma、§5 数据架构）。
 *
 * - 继承 PrismaClient，作为全局唯一数据源连接（PrismaModule 标记 @Global）。
 * - query / warn / error 日志以事件形式转发到 pino（经 Nest Logger，
 *   main.ts 中 app.useLogger 已接管），保持结构化日志统一。
 * - onModuleInit 建立连接、onModuleDestroy 断开；进程级退出由
 *   main.ts 的 app.enableShutdownHooks() 触发模块销毁钩子。
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'warn' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    this.$on('query', (event) => {
      this.logger.debug({
        msg: 'prisma query',
        query: event.query,
        durationMs: event.duration,
      });
    });
    this.$on('warn', (event) => {
      this.logger.warn({ msg: 'prisma warn', message: event.message });
    });
    this.$on('error', (event) => {
      this.logger.error({ msg: 'prisma error', message: event.message });
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
