/**
 * Workspace 模块（HLD §4.1 modules/workspace）。
 *
 * 聚合 WorkspaceService / WorkspaceController 与 RoleModule。
 * 非全局模块：需要显式 import。
 */
import { Module } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { RoleModule } from '../role/role.module';

@Module({
  imports: [RoleModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
