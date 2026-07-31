/**
 * 环境变量校验（class-validator，HLD §11.2 可观测）。
 *
 * T5–T6：仅强校验启动必需 + DATABASE_URL。
 * T7（Auth）：收紧 JWT_ACCESS_SECRET / JWT_REFRESH_SECRET 为必填。
 */
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'production', 'test'] as const;

class EnvVariables {
  @IsEnum(NODE_ENVS)
  NODE_ENV!: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  SERVER_PORT!: number;

  @IsString()
  @Matches(/^[0-9a-zA-Z.\-:]+$/, { message: 'SERVER_HOST must be a valid host' })
  SERVER_HOST!: string;

  @IsString()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must be a PostgreSQL connection string',
  })
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  // T7（Auth）：JWT 密钥为生产必填，开发/测试环境允许使用 .env 兜底值。
  @IsString()
  @Matches(/^.{16,}$/, { message: 'JWT_ACCESS_SECRET must be at least 16 chars' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @Matches(/^.{16,}$/, { message: 'JWT_REFRESH_SECRET must be at least 16 chars' })
  JWT_REFRESH_SECRET!: string;

  @IsOptional()
  @IsString()
  FIELD_ENCRYPTION_KEY?: string;
}

/** T5 启动所需变量的兜底默认值（仅在 env / .env 未提供时生效） */
const DEFAULTS: Record<string, unknown> = {
  NODE_ENV: 'development',
  SERVER_PORT: '3000',
  SERVER_HOST: '0.0.0.0',
};

/**
 * 供 ConfigModule.forRoot({ validate }) 使用。
 *
 * 注意：validate 在 configuration（load 工厂）之前执行，因此 configuration.ts
 * 内的 `?? 默认值` 此时还未生效。这里显式合并默认值（仅当 env 未提供时），
 * 既保证无 .env 也能启动，又能对显式传入的非法值做严格校验。
 */
export function validateEnv(config: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...DEFAULTS };
  for (const [key, value] of Object.entries(config)) {
    // process.env 中未设置的变量为 undefined，不应覆盖默认值。
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }
  const validated = plainToInstance(EnvVariables, merged, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((err) => Object.values(err.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`环境变量校验失败: ${messages}`);
  }
  return validated;
}
