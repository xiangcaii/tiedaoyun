/**
 * 环境变量 → 类型化配置对象（HLD §11.2 可观测、§12 部署）。
 *
 * T5：server / database / raw
 * T7（Auth）：新增 jwt 配置
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
  /** PostgreSQL 连接串 */
  url: string;
}

export interface JwtConfig {
  /** Access Token 密钥 */
  accessSecret: string;
  /** Refresh Token 密钥 */
  refreshSecret: string;
  /** Access Token 有效期（如 15m / 900s） */
  accessTtl: string;
  /** Refresh Token 有效期（如 7d / 604800s） */
  refreshTtl: string;
  /** 签名算法（HS256） */
  algorithm: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  /** 原始 env，供各模块按需读取 */
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
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET!,
      refreshSecret: process.env.JWT_REFRESH_SECRET!,
      accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
      refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
      algorithm: 'HS256',
    },
    raw: process.env,
  };
}
