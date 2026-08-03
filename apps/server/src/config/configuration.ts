/**
 * 环境变量 → 类型化配置对象（HLD §11.2 可观测、§12 部署）。
 *
 * T5：server / database / raw
 * T7（Auth）：新增 jwt 配置
 * T29（Login）：新增 web（CORS origin）+ auth.cookie（refresh token cookie 参数）
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

/** Refresh token cookie 参数（feature.md §6.2 / §4.1） */
export interface AuthCookieConfig {
  /** cookie 名（固定 tdy_rt） */
  name: string;
  /** 限定路径，仅 /auth/refresh 可携带 */
  path: string;
  /** 是否仅 HTTPS（生产 true） */
  secure: boolean;
  /** SameSite 策略，默认 Lax */
  sameSite: 'lax' | 'strict' | 'none';
  /** Max-Age（秒），与 refreshTtl 对齐 */
  maxAge: number;
}

export interface WebConfig {
  /** 前端 origin，用于 CORS（feature.md §6.2） */
  origin: string;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  jwt: JwtConfig;
  web: WebConfig;
  auth: { cookie: AuthCookieConfig };
  /** 原始 env，供各模块按需读取 */
  raw: NodeJS.ProcessEnv;
}

/** refreshTtl 字符串（如 "7d"）→ 秒数，用于 cookie Max-Age */
function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) return 604800; // 兜底 7d
  const n = Number.parseInt(m[1], 10);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return 604800;
  }
}

/**
 * ConfigModule 加载的工厂函数。
 * @nestjs/config 会缓存返回值，注入时用 `ConfigService<typeof config>`。
 */
export default function configuration(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as ServerConfig['nodeEnv'];
  const refreshTtl = process.env.JWT_REFRESH_TTL ?? '7d';
  const sameSite = (process.env.AUTH_COOKIE_SAMESITE ?? 'lax').toLowerCase();
  return {
    server: {
      nodeEnv,
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
      refreshTtl,
      algorithm: 'HS256',
    },
    web: {
      origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    },
    auth: {
      cookie: {
        name: 'tdy_rt',
        path: '/api/v1/auth/refresh',
        secure: nodeEnv === 'production',
        sameSite: sameSite === 'strict' || sameSite === 'none' ? sameSite : 'lax',
        maxAge: ttlToSeconds(refreshTtl),
      },
    },
    raw: process.env,
  };
}
