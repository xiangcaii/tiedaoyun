import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { isValidEntitySlug } from '@tiedaoyun/schema-types';

/**
 * 创建实体请求体（plan T10 / HLD §5.3 entities 表）。
 *
 * 约束：
 * - slug 仅允许小写字母、数字、下划线，1–64 字符，以字母开头（与 FieldType
 *   一致，便于直接做物理表列前缀）。
 * - 物理表名由服务端根据 app.slug + entity.slug 自动生成（HLD §5.1），
 *   客户端无需传入。
 */
export class CreateEntityDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]{0,63}$/, {
    message: 'slug 仅允许小写字母、数字、下划线，以字母开头',
  })
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

// Re-export 让 service 层与 DTO 共用校验函数
export { isValidEntitySlug };
