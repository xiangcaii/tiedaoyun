/**
 * 铁道云低代码平台 — 共享 Schema 类型定义
 *
 * 本包提供数据模型 / 表单 / 列表 / 页面 / 流程的 TypeScript 类型，
 * 前后端共用，确保元数据契约一致（HLD §4.3）。
 *
 * 拆分：
 * - entity.ts  — 数据模型（实体 / 字段 / 关系 / 校验 / 索引），plan T10
 * - form.ts    — 表单（HLD §9.1 / PRD §7.2.2），plan T14
 * - list.ts    — 列表（HLD §9.1 / PRD §7.2.3），plan T15
 * - page.ts    — 页面（HLD §9.1 / PRD §7.2.5），plan T16
 * - workflow.ts — 流程（HLD §8.1），plan T17
 */

/* ===================== 数据模型 ===================== */
export {
  // 枚举
  FieldType,
  RelationType,
  // 常量
  FIELD_TYPES,
  RELATION_TYPE_VALUES,
  TEXT_LIKE_FIELD_TYPES,
  NUMERIC_FIELD_TYPES,
  DATE_LIKE_FIELD_TYPES,
  // 校验函数
  isValidEntitySlug,
  isValidAppSlug,
  isValidFieldName,
  entityTableName,
  junctionTableName,
  // 类型
  type TextFieldConfig,
  type NumberFieldConfig,
  type BooleanFieldConfig,
  type DateFieldConfig,
  type UuidFieldConfig,
  type JsonFieldConfig,
  type EnumOption,
  type EnumFieldConfig,
  type RefFieldConfig,
  type FormulaFieldConfig,
  type MediaFieldConfig,
  type LocationFieldConfig,
  type SignatureFieldConfig,
  type SubTableFieldConfig,
  type FieldConfig,
  type FieldValidationRule,
  type FieldIndex,
  type FieldSchema,
  type RelationSchema,
  type RelationOnDelete,
  type EntitySchema,
} from './entity';

/* ===================== 表单（HLD §9.1） ===================== */

/** 表单字段绑定模式 */
export type FieldBindMode = 'read' | 'write' | 'hidden';

/** 通用组件 schema（HLD §9.1 ComponentSchema） */
export interface ComponentSchema {
  id: string;
  type: string;
  props: Record<string, unknown>;
  events?: Record<string, string>;
  children?: ComponentSchema[];
  bind?: { entity: string; field: string; mode: FieldBindMode };
}

/** 表单 schema（HLD §9.1） */
export interface FormSchema {
  id: string;
  appId: string;
  entityId: string;
  components: ComponentSchema[];
  rules?: unknown[];
  fieldPerms?: Record<string, FieldBindMode>;
}

/* ===================== 列表（HLD §9.1） ===================== */

/** 列表视图类型（v0.1 先实现 table + kanban，PRD §7.2.3） */
export type ListViewType = 'table' | 'kanban' | 'calendar' | 'gantt' | 'tree';

/** 列表列定义 */
export interface ListColumn {
  field: string;
  label: string;
  width?: number;
  sortable?: boolean;
}

/** 列表 schema（HLD §9.1） */
export interface ListSchema {
  id: string;
  appId: string;
  entityId: string;
  columns: ListColumn[];
  filters?: unknown[];
  sorts?: { field: string; order: 'asc' | 'desc' }[];
  viewType: ListViewType;
  pageSize: number;
}

/* ===================== 页面（HLD §9.1） ===================== */

/** 页面 schema（HLD §9.1） */
export interface PageSchema {
  id: string;
  appId: string;
  layout: unknown;
  components: ComponentSchema[];
  dataSources?: unknown[];
  actions?: unknown[];
}

/* ===================== 流程（HLD §8） ===================== */

/** 流程节点类型（HLD §8.1） */
export enum WorkflowNodeType {
  Start = 'start',
  Approval = 'approval',
  Cc = 'cc',
  Branch = 'branch',
  ParallelGateway = 'parallel-gateway',
  SubProcess = 'sub-process',
  Timer = 'timer',
  Connector = 'connector',
  End = 'end',
}

/** 流程节点定义 */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  props?: Record<string, unknown>;
}

/** 流程边定义（含流转条件表达式 DSL） */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

/** 流程触发器 */
export interface WorkflowTrigger {
  type: 'manual' | 'create' | 'update' | 'delete' | 'schedule' | 'webhook';
  config?: Record<string, unknown>;
}

/** 流程定义（HLD §8.1） */
export interface WorkflowDefinition {
  id: string;
  appId: string;
  name: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: WorkflowTrigger[];
}

/** 流程实例状态（HLD §8.2） */
export type WorkflowInstanceState = 'running' | 'suspended' | 'completed' | 'terminated';

/* ===================== 通用响应包装（HLD §6.1） ===================== */

/** 统一响应包装：{ code, data, message, traceId } */
export interface ApiResponse<T = unknown> {
  code: string;
  data: T;
  message: string;
  traceId: string;
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
