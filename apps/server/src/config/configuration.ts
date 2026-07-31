/**
 * 环境变量 → 类型化配置对象（HLD §11.2 可观测、§12 部署）。
 *
 * 仅声明 T5 骨架启动所需字段；DB / Redis / JWT 等模块相关配置
 * 在后续任务（T6 Prisma、T7 Auth）落地时由各自模块补齐校验。
 */

export interface ServerConfig {
  /** 运行环境 */
  nodeEnv: 'development' | 'production' | 'test';
  /** HTTP 监听端口 */
  port: number;
  /** HTTP 监听地址 */
  host: string;
}

export interface DatabaseConfig {
  /** PostgreSQL 连接串（T6：env 校验已强制为必填，此处非空） */
  url: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  /** 原始 env，供各模块按需读取（T6+ 使用） */
  raw: NodeJS.ProcessEnv;
}

/**
 * ConfigModule 加载的工厂函数。
 * @nestjs/config 会缓存返回值，注入时用 `ConfigService<typeof config>`。
 */
export default function configuration(): AppConfig {
  return {
    server: {
      nodeEnv: (process.env.NODE_ENV ?? 'development') as ServerConfig['nodeEnv'],
      port: Number.parseInt(process.env.SERVER_PORT ?? '3000', 10),
      host: process.env.SERVER_HOST ?? '0.0.0.0',
    },
    database: {
      url: process.env.DATABASE_URL!,
    },
    raw: process.env,
  };
}
