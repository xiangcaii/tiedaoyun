/**
 * pino 日志配置（HLD §11.2 可观测：结构化 JSON 输出到 stdout）。
 *
 * - 生产环境：原始 JSON 行，由 Docker 收集。
 * - 开发环境：pino-pretty 彩色输出，便于本地阅读。
 * - 敏感字段（authorization / cookie / password / token）写入前脱敏，
 *   对齐 HLD §11.1 审计脱敏要求。
 */
import type { Params } from 'nestjs-pino';

const isProd = process.env.NODE_ENV === 'production';

/** 需要脱敏的字段路径（pino redact 语法） */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
];

/**
 * LoggerModule.forRoot 的配置工厂。
 * 直接读 process.env 是有意为之：LoggerModule 在 ConfigModule 注入前
 * 就需要决定 transport，且 NODE_ENV 在进程启动时已确定。
 */
export function buildPinoConfig(): Params {
  return {
    pinoHttp: {
      level: isProd ? 'info' : 'debug',
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname',
              singleLine: false,
            },
          },
      // 健康检查打日志会刷屏，统一静默。
      autoLogging: {
        ignore: (req) => {
          const url = (req as { url?: string }).url ?? '';
          return url.startsWith('/healthz') || url.startsWith('/readyz');
        },
      },
    },
  };
}
