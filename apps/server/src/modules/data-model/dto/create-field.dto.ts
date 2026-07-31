import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsIn,
  IsArray,
  ValidateNested,
  IsObject,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FieldType, FIELD_TYPES } from '@tiedaoyun/schema-types';

/**
 * 创建字段请求体（plan T10 / HLD §5.3 fields 表）。
 *
 * 约束（PRD §7.2.1）：
 * - name 仅允许字母/数字/下划线，1–64 字符，以字母或下划线开头。
 * - type 在 FieldType 词汇表内（默认全集合）。
 * - config 与 type 强相关，类型校验在 service 层完成。
 */
export class CreateFieldDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, {
    message: '字段名仅允许字母、数字、下划线，且以字母或下划线开头，长度 ≤ 64',
  })
  name!: string;

  @IsString()
  @MaxLength(128)
  label!: string;

  @IsString()
  @IsIn(FIELD_TYPES as unknown as string[], {
    message: `字段类型必须在 ${FIELD_TYPES.join(', ')} 之中`,
  })
  type!: FieldType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  defaultValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** 业务校验规则（PRD §7.2.1），存于 Field.config.validations。 */
  @IsOptional()
  @IsArray()
  validations?: Record<string, unknown>[];

  /** 索引定义（v0.1 单字段），存于 Field.config.index。 */
  @IsOptional()
  @IsObject()
  index?: Record<string, unknown>;
}

/**
 * 批量创建字段请求体（plan T10）。同一实体下原子写入。
 */
export class BatchCreateFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldDto)
  fields!: CreateFieldDto[];
}

/**
 * 校验当前全局 DTO 编译：防止后续 import 删除时漏改。
 */
export const _CreateFieldDtoRefs = {
  FieldType,
  FIELD_TYPES,
};
