/**
 * DataModel 模块（plan T10 / HLD §4.1 modules/data-model）。
 *
 * 聚合：
 * - EntityService：实体 CRUD（HLD §5.3 entities 表）
 * - FieldService：字段 CRUD（HLD §5.3 fields 表）
 * - RelationService：关系 CRUD（HLD §5.3 relations 表）
 * - DataModelController：REST 端点（HLD §6.3）
 *
 * 物理表生成（DDL）由 T11 DynamicMigrator 在 T10 基础上叠加实现。
 * 行/字段级权限（T9）通过 PermissionService.evaluate 在 T13 DataEngine
 * 写操作时强制；本模块只负责元数据 CRUD。
 */
import { Module } from '@nestjs/common';
import { EntityService } from './entity.service';
import { FieldService } from './field.service';
import { RelationService } from './relation.service';
import { DataModelController } from './data-model.controller';

@Module({
  controllers: [DataModelController],
  providers: [EntityService, FieldService, RelationService],
  exports: [EntityService, FieldService, RelationService],
})
export class DataModelModule {}
