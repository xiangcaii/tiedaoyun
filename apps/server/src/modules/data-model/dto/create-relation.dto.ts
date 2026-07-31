import { IsString, IsOptional, MaxLength, IsIn, IsUUID } from 'class-validator';
import { RelationType, RELATION_TYPE_VALUES } from '@tiedaoyun/schema-types';

/**
 * 创建关系请求体（plan T10 / HLD §5.3 relations 表）。
 *
 * 字段约束（PRD §7.2.1）：
 * - 源/目标实体必须存在（外键校验由 service 层完成）。
 * - 多对多关系 junctionTable 由服务端按
 *   `e_<a_slug>__<b_slug>__rel` 自动生成（HLD §5.1）。
 * - sourceFieldId 可选：多对多通常不需要在源端维护具体外键字段。
 */
export class CreateRelationDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsString()
  @IsIn(RELATION_TYPE_VALUES, {
    message: `关系类型必须是 ${RELATION_TYPE_VALUES.join(' / ')} 之一`,
  })
  type!: RelationType;

  @IsUUID()
  sourceEntityId!: string;

  @IsOptional()
  @IsUUID()
  sourceFieldId?: string;

  @IsUUID()
  targetEntityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  onDelete?: 'restrict' | 'cascade' | 'set_null';
}

/**
 * 防止后续 RelationType 变更漏改。
 */
export const _CreateRelationDtoRefs = { RelationType };
