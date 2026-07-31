/**
 * 内置角色策略（HLD §7.3 静态预置 + §7.2 三级权限）。
 *
 * 三个内置角色：
 * - admin：所有功能级权限（`__admin` 通配） + 无行/字段限制。
 * - builder：可设计器操作 + 业务数据 CRUD；不能管理成员/审计。
 * - viewer：仅业务数据 + 设计的 read。
 *
 * 策略在 PermissionService 启动时与用户自定义 Role.config 合并。
 * 自定义行/字段策略以"首个命中"为优先级：先看 admin，再看 builder，再看 viewer。
 */

import type { RoleConfig } from './permission.types';

/** 功能级权限通配符：拥有 `__admin` 即视为拥有所有 `xxx.read/create/update/delete`。 */
export const WILDCARD_ALL = '__admin';

/** 功能级权限前缀：内置 admin 通配。 */
export const ADMIN_PERMISSION = WILDCARD_ALL;

/** 内置角色 code（HLD §7.3）。 */
export const BUILTIN_ROLE_CODES = {
  ADMIN: 'admin',
  BUILDER: 'builder',
  VIEWER: 'viewer',
} as const;

/** 内置角色对应的功能级权限集合。 */
export const BUILTIN_ROLE_PERMISSIONS: Record<string, string[]> = {
  [BUILTIN_ROLE_CODES.ADMIN]: [ADMIN_PERMISSION],
  [BUILTIN_ROLE_CODES.BUILDER]: [
    'app.create',
    'app.read',
    'app.update',
    'entity.create',
    'entity.read',
    'entity.update',
    'form.create',
    'form.read',
    'form.update',
    'list.create',
    'list.read',
    'list.update',
    'page.create',
    'page.read',
    'page.update',
    'workflow.create',
    'workflow.read',
    'workflow.update',
    'workflow.start',
    'data.create',
    'data.read',
    'data.update',
    'data.delete',
  ],
  [BUILTIN_ROLE_CODES.VIEWER]: [
    'app.read',
    'entity.read',
    'form.read',
    'list.read',
    'page.read',
    'workflow.read',
    'data.read',
  ],
};

/**
 * 内置角色的行/字段级默认策略。
 *
 * 内置 admin：无任何行/字段限制（所有记录可见、字段全部 visible）。
 * 内置 builder：业务数据可 CRUD，字段全部 visible。
 * 内置 viewer：业务数据仅 read，字段全部 read。
 */
export const BUILTIN_ROLE_ROW_POLICIES: Record<string, RoleConfig['rowPolicies']> = {
  [BUILTIN_ROLE_CODES.ADMIN]: {},
  [BUILTIN_ROLE_CODES.BUILDER]: {},
  [BUILTIN_ROLE_CODES.VIEWER]: {},
};

/** 内置字段策略：MVP 阶段不限制（由用户在 Role.config 中按需添加）。 */
export const BUILTIN_ROLE_FIELD_POLICIES: Record<string, RoleConfig['fieldPolicies']> = {
  [BUILTIN_ROLE_CODES.ADMIN]: {},
  [BUILTIN_ROLE_CODES.BUILDER]: {},
  [BUILTIN_ROLE_CODES.VIEWER]: {},
};
