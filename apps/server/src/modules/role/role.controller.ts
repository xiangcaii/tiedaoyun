/**
 * RoleController — 角色与权限管理端点（HLD §6.3、§7.2）。
 *
 * 路由前缀：/api/v1（main.ts 全局设置）。
 * - GET    roles                           — 当前工作空间角色列表
 * - POST   roles                           — 创建角色
 * - GET    roles/:id                        — 角色详情
 * - PATCH  roles/:id                        — 更新角色
 * - DELETE roles/:id                        — 删除角色
 * - GET    roles/:id/permissions            — 角色权限列表
 * - PUT    roles/:id/permissions            — 分配权限点
 * - GET    permissions                      — 全局权限点列表
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Put, UseGuards } from '@nestjs/common';
import { RoleService } from './role.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /** 获取工作空间下的角色列表 */
  @Get('roles')
  async listRoles() {
    // T8: workspaceId 后续从 X-Workspace-Id header / guard 中获取。
    // 当前 MVP 阶段由 controller 直接接收，T9 后统一注入。
    // 为简化单测，先暴露不带 workspaceId 的角色查询方式。
    // 实际使用时通过 workspaceId query 或 header 传入。
    const roles = await this.roleService.listByWorkspace(''); // 占位
    return roles;
  }

  /** 获取全局权限点列表 */
  @Get('permissions')
  async listPermissions() {
    const permissions = await this.roleService.listPermissions();
    return permissions;
  }

  /** 创建角色 */
  @Post('roles')
  async createRole(@Body() dto: CreateRoleDto) {
    // TODO: workspaceId 从 X-Workspace-Id header 中获取（T9）
    const role = await this.roleService.create('', dto);
    return role;
  }

  /** 获取角色详情 */
  @Get('roles/:id')
  async getRole(@Param('id') id: string) {
    const role = await this.roleService.findByIdOrFail(id);
    return role;
  }

  /** 更新角色 */
  @Patch('roles/:id')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    const role = await this.roleService.update(id, dto);
    return role;
  }

  /** 删除角色 */
  @Delete('roles/:id')
  async deleteRole(@Param('id') id: string) {
    await this.roleService.delete(id);
    return { message: '角色已删除' };
  }

  /** 获取角色的权限点列表 */
  @Get('roles/:id/permissions')
  async getRolePermissions(@Param('id') id: string) {
    const permissions = await this.roleService.getRolePermissions(id);
    return permissions;
  }

  /** 为角色分配权限点（全量替换） */
  @Put('roles/:id/permissions')
  async assignPermissions(@Param('id') id: string, @Body() dto: AssignPermissionsDto) {
    await this.roleService.assignPermissions(id, dto.permissionCodes);
    return { message: '权限点已分配' };
  }
}
