/**
 * 铁道云低代码平台 — 共享 Schema 类型定义
 *
 * 本包提供数据模型 / 表单 / 列表 / 页面 / 流程的 TypeScript 类型，
 * 前后端共用，确保元数据契约一致（HLD §4.3）。
 *
 * 当前为骨架版本，具体 schema 将在 T10 / T14 / T15 / T16 / T17 中补全，
 * 届时会拆分为 entity.ts / form.ts / list.ts / page.ts / workflow.ts 并补 Zod 校验。
 */

/* ===================== 数据模型（entity / field / relation） ===================== */

/** 字段类型枚举（HLD §5.3 fields 表） */
export enum FieldType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  DateTime = 'datetime',
  Text = 'text',
  Uuid = 'uuid',
  Json = 'json',
  Ref = 'ref',
}

/** 实体字段定义 */
export interface FieldSchema {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  /** 关系字段：指向目标实体 ID */
  refEntityId?: string;
}

/** 实体关系类型 */
export enum RelationType {
  OneToOne = 'one-to-one',
  OneToMany = 'one-to-many',
  ManyToOne = 'many-to-one',
  ManyToMany = 'many-to-many',
}

/** 实体关系定义 */
export interface RelationSchema {
  id: string;
  name: string;
  type: RelationType;
  sourceEntityId: string;
  targetEntityId: string;
}

/** 实体定义 */
export interface EntitySchema {
  id: string;
  name: string;
  label: string;
  appId: string;
  fields: FieldSchema[];
  relations: RelationSchema[];
}

/* ===================== 表单（form，HLD §9.1） ===================== */

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

/* ===================== 列表（list，HLD §9.1） ===================== */

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

/* ===================== 页面（page，HLD §9.1） ===================== */

/** 页面 schema（HLD §9.1） */
export interface PageSchema {
  id: string;
  appId: string;
  layout: unknown;
  components: ComponentSchema[];
  dataSources?: unknown[];
  actions?: unknown[];
}

/* ===================== 流程（workflow，HLD §8） ===================== */

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
