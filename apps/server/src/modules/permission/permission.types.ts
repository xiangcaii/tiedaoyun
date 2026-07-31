/**
 * Permission 模块类型定义（HLD §7.2 权限模型）。
 *
 * 权限分三层（plan T9）：
 * - 功能级（function）：`role → permissions[]`，用 Permission.code 匹配
 *   （如 `app.create` / `entity.read` / `workflow.approve`）。
 * - 数据级（row）：策略 DSL，限定单条记录是否对当前用户可见。
 *   内置两种策略：`owner`（记录.字段 == currentUser.id）、
 *   `department`（记录.字段 in currentUser.departments）。
 *   任何角色都没配置 row policy 时，记录默认对所有成员可见。
 * - 字段级（field）：白名单 + 角色映射，默认拒绝。
 *   内置 4 个模式：`visible`（读 + 写） / `read`（只读） /
 *   `admin_only`（仅 admin 可见） / `hidden`（任何角色都不可见）。
 *
 * 整体原则：默认拒绝。任何"未显式允许"均视为拒绝。
 */

/** 功能级权限点。Permission.code 的子集（设计器只关心大类）。 */
export type PermissionAction =
  | 'app.create'
  | 'app.read'
  | 'app.update'
  | 'app.delete'
  | 'app.publish'
  | 'entity.create'
  | 'entity.read'
  | 'entity.update'
  | 'entity.delete'
  | 'form.create'
  | 'form.read'
  | 'form.update'
  | 'form.delete'
  | 'list.create'
  | 'list.read'
  | 'list.update'
  | 'list.delete'
  | 'page.create'
  | 'page.read'
  | 'page.update'
  | 'page.delete'
  | 'workflow.create'
  | 'workflow.read'
  | 'workflow.update'
  | 'workflow.delete'
  | 'workflow.start'
  | 'workflow.approve'
  | 'data.create'
  | 'data.read'
  | 'data.update'
  | 'data.delete'
  | 'role.manage'
  | 'member.manage'
  | 'connector.manage'
  | 'audit.read'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {}); // 允许扩展（保持 IDE 自动补全已知字面量，又不限制扩展）

/** 受保护资源类型（HLD §7.2）。 */
export type PermissionResourceType =
  | 'app'
  | 'entity'
  | 'record' // 动态表记录（行级 + 字段级）
  | 'form'
  | 'list'
  | 'page'
  | 'workflow'
  | 'role'
  | 'member'
  | 'connector'
  | 'audit';

/** 受保护资源。id 在列表/详情场景可选（用于行级匹配时省略具体记录）。 */
export interface PermissionResource {
  type: PermissionResourceType;
  id?: string;
  /** 资源所属工作空间。superadmin 可省略。 */
  workspaceId?: string;
  /** 数据权限使用的实体标识（id 或 slug），仅 type=record 时需要。 */
  entityId?: string;
}

/** 调用方上下文。用于行级 / 字段级策略。 */
export interface PermissionContext {
  /** 当前操作的记录快照（用于行级判断）。 */
  record?: Record<string, unknown>;
  /** 目标记录集合（用于批量行级过滤）。 */
  records?: Array<Record<string, unknown>>;
  /** 请求中涉及的字段名列表（用于字段级过滤）。 */
  requestedFields?: string[];
  /** 当前用户所属部门列表（来自 user_profile 等扩展点；MVP 阶段可为空）。 */
  userDepartments?: string[];
  /** 调用方显式声明的字段写入动作，默认 read。 */
  fieldAction?: 'read' | 'write';
}

/** 当前用户主体。 */
export interface PermissionSubject {
  id: string;
  /** 当前工作空间；超级管理员可省略。 */
  workspaceId?: string;
  /** 用户所属角色 ID 列表（同一用户多角色时取并集）。 */
  roleIds: string[];
  /** 用户所属角色的 code 列表（用于内置角色策略命中）。 */
  roleCodes: string[];
  /** 平台超级管理员（绕过所有检查，但行/字段级默认策略仍生效）。 */
  isSuperadmin?: boolean;
  /** 扩展属性：用户的额外属性（如 department），用于行级策略。 */
  attributes?: Record<string, unknown>;
}

/** evaluate 统一返回。 */
export interface PermissionResult {
  allowed: boolean;
  /** 拒绝时的简短原因（前端可提示）。 */
  reason?: string;
  /** 字段级过滤后允许的字段名列表。 */
  allowedFields?: string[];
  /** 字段级过滤后被隐藏的字段名列表。 */
  hiddenFields?: string[];
  /** 行级过滤后保留的记录（仅当 context.records 存在时填充）。 */
  filteredRecords?: Array<Record<string, unknown>>;
}

/** Role.config.rowPolicies 单条策略。 */
export interface RowPolicy {
  /** 策略类型。owner/department/custom。custom 留作后续扩展。 */
  type: 'owner' | 'department' | 'none';
  /** 记录上的字段名（如 owner_id / department_id）。type=none 时可省略。 */
  field?: string;
}

/** Role.config.fieldPolicies 单条规则。 */
export type FieldPolicyMode = 'visible' | 'read' | 'admin_only' | 'hidden';

/** Role.config 整体结构。 */
export interface RoleConfig {
  /** 行级策略：key 为 entityIdOrSlug。 */
  rowPolicies?: Record<string, RowPolicy>;
  /** 字段级策略：key 为 entityIdOrSlug，value 为 { fieldName: mode }。 */
  fieldPolicies?: Record<string, Record<string, FieldPolicyMode>>;
}
