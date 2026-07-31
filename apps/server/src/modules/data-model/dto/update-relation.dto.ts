import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';
import { RELATION_TYPE_VALUES, RelationType } from '@tiedaoyun/schema-types';

/**
 * 更新关系请求体（plan T10）。
 *
 * - source/target 实体不允许修改（修改等于重建关系，物理表需迁移 → T12）。
 * - type 可更新（如 from one-to-many 升级到 many-to-many 需新建关系）。
 */
export class UpdateRelationDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(RELATION_TYPE_VALUES)
  type?: RelationType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  onDelete?: 'restrict' | 'cascade' | 'set_null';
}
