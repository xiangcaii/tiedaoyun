import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsObject,
  IsArray,
} from 'class-validator';

/**
 * 更新字段请求体（plan T10）。
 *
 * - name 不允许通过此接口修改：name 是物理列名，类型变更与重命名
 *   走"影响分析"流程（T12）。v0.1 直接 400。
 * - 业务校验规则与索引可独立更新。
 */
export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  label?: string;

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
  defaultValue?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  validations?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  index?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  deprecated?: boolean;
}
