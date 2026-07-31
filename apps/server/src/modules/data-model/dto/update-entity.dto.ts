import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * 更新实体请求体（plan T10）。
 *
 * - 不允许通过此接口修改 slug：slug 是物理表名的语义部分，
 *   改名意味着物理表需迁移，迁移走"影响分析"流程（T12）。
 * - 仅允许修改展示名与描述。
 */
export class UpdateEntityDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: 'active' | 'archived';
}
