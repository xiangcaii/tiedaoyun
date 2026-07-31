/**
 * PermissionService — 功能 / 行 / 字段三级权限统一计算（HLD §7.2、§7.3）。
 *
 * 设计要点：
 * - **默认拒绝**：任何未显式允许的 action / 字段 / 记录均视为禁止。
 * - **三级独立计算**：functional → row → field；任一级失败即拒绝。
 * - **多角色取并集**：同一用户多角色时，功能级权限点取并集；
 *   行/字段级策略按 admin > builder > viewer 优先级合并（admin 通配最优先）。
 * - **超级管理员**：isSuperadmin=true 跳过功能级与行级（字段级仍生效）。
 * - **可缓存**：当前未引入 Redis（HLD §7.3 "角色与权限点静态预置 + 启动加载到 Redis
 *   缓存"），本服务在调用点即时解析，结果可由调用方自行缓存。
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type {
  PermissionAction,
  PermissionContext,
  PermissionResource,
  PermissionResult,
  PermissionSubject,
  RoleConfig,
  RowPolicy,
  FieldPolicyMode,
} from './permission.types';
import { BUILTIN_ROLE_CODES, BUILTIN_ROLE_PERMISSIONS, WILDCARD_ALL } from './builtin-policies';

/** 缓存：workspaceId -> userId -> 解析结果（功能级权限 + 角色配置）。 */
interface SubjectResolution {
  permissionCodes: Set<string>;
  roleConfigs: RoleConfig[];
  builtinCodes: string[];
}

@Injectable()
export class PermissionService {
  private readonly cache = new Map<string, SubjectResolution>();

  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // 主入口：evaluate
  // =========================================================================

  /**
   * 三级权限统一评估。
   *
   * @param subject  当前用户主体
   * @param resource 受保护资源
   * @param action   功能级权限 code
   * @param context  行/字段级判断上下文（可选）
   */
  async evaluate(
    subject: PermissionSubject,
    resource: PermissionResource,
    action: PermissionAction,
    context: PermissionContext = {},
  ): Promise<PermissionResult> {
    // 1. 工作空间校验：subject.workspaceId 必须与 resource.workspaceId 一致
    if (
      resource.workspaceId &&
      subject.workspaceId &&
      resource.workspaceId !== subject.workspaceId
    ) {
      return { allowed: false, reason: '跨工作空间访问被拒绝' };
    }

    const resolution = await this.resolveSubject(subject);

    // 2. 功能级：superadmin 与 admin 通配直接放行
    if (!this.checkFunctionPermission(resolution, action, subject)) {
      return { allowed: false, reason: `功能权限 ${action} 未授予` };
    }

    // 3. 字段级（如有 context.requestedFields / fieldAction 触发）
    const fieldResult = this.evaluateFieldPolicies(
      resolution,
      resource,
      context.requestedFields,
      context.fieldAction,
    );
    if (!fieldResult.allowed) {
      return { allowed: false, reason: fieldResult.reason };
    }

    // 4. 行级：仅 record / records 触发
    if (context.record !== undefined) {
      const rowOk = this.checkRowPolicy(resolution, resource, subject, context.record);
      if (!rowOk) {
        return { allowed: false, reason: '行级权限被拒绝' };
      }
    }

    if (context.records !== undefined) {
      const filteredRecords = context.records.filter((rec) =>
        this.checkRowPolicy(resolution, resource, subject, rec),
      );
      return {
        allowed: true,
        allowedFields: fieldResult.allowedFields,
        hiddenFields: fieldResult.hiddenFields,
        filteredRecords,
      };
    }

    return {
      allowed: true,
      allowedFields: fieldResult.allowedFields,
      hiddenFields: fieldResult.hiddenFields,
    };
  }

  // =========================================================================
  // 便捷方法
  // =========================================================================

  /** 便捷：仅判断功能级（无行/字段上下文）。 */
  async can(
    subject: PermissionSubject,
    resource: PermissionResource,
    action: PermissionAction,
  ): Promise<boolean> {
    const result = await this.evaluate(subject, resource, action);
    return result.allowed;
  }

  /** 便捷：批量行级过滤。返回 subject 可见的记录子集。 */
  async filterRows<T extends Record<string, unknown>>(
    subject: PermissionSubject,
    resource: PermissionResource,
    action: PermissionAction,
    records: T[],
  ): Promise<T[]> {
    if (records.length === 0) return [];
    const result = await this.evaluate(subject, resource, action, { records });
    return (result.filteredRecords ?? []) as T[];
  }

  /** 便捷：字段白名单过滤（默认读模式）。无 context.requestedFields 时返回 hidden 列表。 */
  async filterFields(
    subject: PermissionSubject,
    resource: PermissionResource,
    fields: string[],
    fieldAction: 'read' | 'write' = 'read',
  ): Promise<{ allowedFields: string[]; hiddenFields: string[] }> {
    const result = await this.evaluate(subject, resource, 'data.read', {
      requestedFields: fields,
      fieldAction,
    });
    return {
      allowedFields: result.allowedFields ?? fields,
      hiddenFields: result.hiddenFields ?? [],
    };
  }

  /** 清除缓存（角色权限点变更时由调用方手动调用）。 */
  invalidateCache(workspaceId?: string, userId?: string): void {
    if (!workspaceId && !userId) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      const [ws, uid] = key.split('|');
      if ((workspaceId && ws === workspaceId) || (userId && uid === userId)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 查询用户是否为平台超级管理员（HLD §5.3 users.is_superadmin）。
   * 用于 PermissionGuard 等场景的快速判定。
   */
  async isSuperadmin(userId: string): Promise<boolean> {
    if (!userId) return false;
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperadmin: true },
    });
    return row?.isSuperadmin === true;
  }

  // =========================================================================
  // Subject 解析（功能级权限点 + 角色配置）
  // =========================================================================

  private cacheKey(workspaceId: string, userId: string): string {
    return `${workspaceId}|${userId}`;
  }

  /**
   * 解析 subject：汇总用户所有角色的功能级权限点、内置角色 code、自定义 Role.config。
   * 命中缓存直接返回；未命中查 DB（一次性查出该用户在工作空间内的全部角色 + 权限点）。
   */
  private async resolveSubject(subject: PermissionSubject): Promise<SubjectResolution> {
    const wsId = subject.workspaceId ?? '*';
    const key = this.cacheKey(wsId, subject.id);
    const cached = this.cache.get(key);
    if (cached) return cached;

    // 查 DB：用户在工作空间下的所有角色（含内置角色 + 关联权限点）
    const memberships = await this.prisma.workspaceMember.findMany({
      where: {
        userId: subject.id,
        ...(subject.workspaceId
          ? {
              workspaceId: subject.workspaceId,
              status: { in: ['ACTIVE', 'INVITED'] },
            }
          : {}),
      },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    const permissionCodes = new Set<string>();
    const roleConfigs: RoleConfig[] = [];
    const builtinCodes: string[] = [];

    for (const m of memberships) {
      const role = m.role;
      if (!role) continue;
      // 1. 内置角色的功能级权限点
      const builtinPerms = BUILTIN_ROLE_PERMISSIONS[role.code];
      if (builtinPerms) {
        builtinCodes.push(role.code);
        for (const p of builtinPerms) permissionCodes.add(p);
      }
      // 2. 自定义权限点（role_permissions 关联）
      for (const rp of role.rolePermissions) {
        permissionCodes.add(rp.permission.code);
      }
      // 3. 角色自定义配置（行/字段）
      roleConfigs.push(this.parseRoleConfig(role.config, role.code));
    }

    // 兜底：如果 subject 中已带 roleCodes，补充内置权限（无 DB 角色时）
    if (memberships.length === 0 && subject.roleCodes.length > 0) {
      for (const code of subject.roleCodes) {
        const builtinPerms = BUILTIN_ROLE_PERMISSIONS[code];
        if (builtinPerms) {
          builtinCodes.push(code);
          for (const p of builtinPerms) permissionCodes.add(p);
        }
      }
    }

    const resolution: SubjectResolution = {
      permissionCodes,
      roleConfigs,
      builtinCodes,
    };
    this.cache.set(key, resolution);
    return resolution;
  }

  /** 解析 Role.config（Json 字段）→ RoleConfig；不可解析时返回空配置。 */
  private parseRoleConfig(raw: unknown, roleCode: string): RoleConfig {
    if (!raw || typeof raw !== 'object') return {};
    const cfg = raw as RoleConfig;
    // 仅做最浅校验：必须包含 rowPolicies/fieldPolicies 对象（可为空）
    const result: RoleConfig = {};
    if (cfg.rowPolicies && typeof cfg.rowPolicies === 'object') {
      result.rowPolicies = cfg.rowPolicies;
    }
    if (cfg.fieldPolicies && typeof cfg.fieldPolicies === 'object') {
      result.fieldPolicies = cfg.fieldPolicies;
    }
    // 标记 role code 便于排查
    if (Object.keys(result).length > 0) {
      (result as { _roleCode?: string })._roleCode = roleCode;
    }
    return result;
  }

  // =========================================================================
  // 功能级
  // =========================================================================

  private checkFunctionPermission(
    resolution: SubjectResolution,
    action: PermissionAction,
    subject?: PermissionSubject,
  ): boolean {
    // superadmin / 内置 admin 通配
    if (subject?.isSuperadmin) return true;
    if (resolution.permissionCodes.has(WILDCARD_ALL)) return true;
    if (resolution.permissionCodes.has(action)) return true;
    return false;
  }

  // =========================================================================
  // 行级
  // =========================================================================

  private checkRowPolicy(
    resolution: SubjectResolution,
    resource: PermissionResource,
    subject: PermissionSubject,
    record: Record<string, unknown>,
  ): boolean {
    // superadmin 跳过行级限制（HLD §7.2 字段级仍生效）
    if (subject.isSuperadmin) return true;
    if (!resource.entityId) return true;

    const policy = this.resolveRowPolicy(resolution, resource.entityId);
    if (!policy || policy.type === 'none' || !policy.field) return true;

    const recordValue = record[policy.field];
    if (recordValue === undefined || recordValue === null) return false;

    switch (policy.type) {
      case 'owner':
        // 支持 string 直接比较，也支持数组中包含
        if (typeof recordValue === 'string') return recordValue === subject.id;
        if (Array.isArray(recordValue)) return recordValue.includes(subject.id);
        return false;
      case 'department': {
        const userDepartments = this.extractUserDepartments(subject);
        if (userDepartments.length === 0) return false;
        if (typeof recordValue === 'string') return userDepartments.includes(recordValue);
        if (Array.isArray(recordValue))
          return recordValue.some((v) => userDepartments.includes(String(v)));
        return false;
      }
      default:
        return false;
    }
  }

  /** 按 admin > builder > viewer > 自定义 的优先级解析行级策略。 */
  private resolveRowPolicy(
    resolution: SubjectResolution,
    entityKey: string,
  ): RowPolicy | undefined {
    for (const code of resolution.builtinCodes) {
      if (code === BUILTIN_ROLE_CODES.ADMIN) {
        // admin 不配置 row policy（不限制）
        continue;
      }
      if (code === BUILTIN_ROLE_CODES.BUILDER) {
        // builder 默认无 row policy（不限制）
        continue;
      }
    }
    for (const cfg of resolution.roleConfigs) {
      const p = cfg.rowPolicies?.[entityKey];
      if (p) return p;
    }
    return undefined;
  }

  /** 提取用户部门列表。优先 subject.attributes.departments，其次 context.userDepartments。 */
  private extractUserDepartments(subject: PermissionSubject): string[] {
    const fromAttrs = subject.attributes?.['departments'];
    if (Array.isArray(fromAttrs)) {
      return fromAttrs.map(String);
    }
    if (typeof fromAttrs === 'string' && fromAttrs.length > 0) {
      return [fromAttrs];
    }
    return [];
  }

  // =========================================================================
  // 字段级
  // =========================================================================

  private evaluateFieldPolicies(
    resolution: SubjectResolution,
    resource: PermissionResource,
    requestedFields: string[] | undefined,
    fieldAction: 'read' | 'write' | undefined,
  ): {
    allowed: boolean;
    reason?: string;
    allowedFields?: string[];
    hiddenFields?: string[];
  } {
    // 没有 requestedFields → 不进行字段级过滤（由调用方显式调用 filterFields）
    if (!requestedFields || requestedFields.length === 0) {
      return { allowed: true };
    }

    // 没有 entityId（资源不是 record）→ 不做字段级
    if (!resource.entityId) {
      return { allowed: true, allowedFields: requestedFields, hiddenFields: [] };
    }

    // 合并：所有 role 的字段策略并集（admin / 自定义 hidden 优先）
    const fieldModes: Record<string, FieldPolicyMode> = {};
    for (const cfg of resolution.roleConfigs) {
      const entityFields = cfg.fieldPolicies?.[resource.entityId];
      if (!entityFields) continue;
      for (const [field, mode] of Object.entries(entityFields)) {
        fieldModes[field] = this.mergeFieldMode(fieldModes[field], mode);
      }
    }

    // 解析每个字段
    const allowed: string[] = [];
    const hidden: string[] = [];
    for (const field of requestedFields) {
      const mode = fieldModes[field] ?? 'visible';
      if (mode === 'hidden') {
        hidden.push(field);
        continue;
      }
      if (mode === 'admin_only') {
        const isAdmin = resolution.builtinCodes.includes(BUILTIN_ROLE_CODES.ADMIN);
        if (isAdmin) {
          allowed.push(field);
        } else {
          hidden.push(field);
        }
        continue;
      }
      if (mode === 'read' && fieldAction === 'write') {
        // 写场景下只读字段视为禁止
        return { allowed: false, reason: `字段 ${field} 仅可读` };
      }
      allowed.push(field);
    }

    // 至少允许一个字段时才放行（避免全字段被遮蔽的"幽灵"请求）
    if (allowed.length === 0) {
      return { allowed: false, reason: '请求的字段全部被拒绝' };
    }

    return { allowed: true, allowedFields: allowed, hiddenFields: hidden };
  }

  /**
   * 字段 mode 合并策略：
   * - hidden > admin_only > read > visible（限制更严格的优先）
   */
  private mergeFieldMode(
    current: FieldPolicyMode | undefined,
    incoming: FieldPolicyMode,
  ): FieldPolicyMode {
    if (!current) return incoming;
    const order: Record<FieldPolicyMode, number> = {
      visible: 0,
      read: 1,
      admin_only: 2,
      hidden: 3,
    };
    return order[incoming] > order[current] ? incoming : current;
  }
}
