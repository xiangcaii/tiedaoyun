/**
 * Role 模块（HLD §4.1 modules/role）。
 *
 * 提供 RoleService 与 RoleController。
 * 非全局模块：需要 Workspace 等模块显式 import 才能注入 RoleService。
 */
import { Module } from '@nestjs/common';
import { RoleService } from './role.service';
import { RoleController } from './role.controller';

@Module({
  controllers: [RoleController],
  providers: [RoleService],
  exports: [RoleService],
})
export class RoleModule {}
