/**
 * 数据模型契约（plan T10 / HLD §5.3 实体/字段/关系元数据）。
 *
 * 本文件由前后端共用，定义：
 * - 字段类型词汇表（FieldType，可扩展）
 * - 各类型专属配置（FieldConfig：判别联合）
 * - 关系类型（RelationType，与 Prisma enum 一致）
 * - 实体/字段/关系的元数据 schema
 *
 * 设计原则：
 * - 字段 type / relation.type 在 DB 中以小写字符串存储，
 *   应用层校验交给 class-validator / 服务层。
 * - FieldConfig 使用判别联合（discriminated union by `type`），
 *   描述每种类型可携带的选项（精度、枚举、关联目标等）。
 * - 校验规则、索引、字段权限等扩展点以 JSONB 形式存在 Field.config
 *   与 Entity.config（暂不引入独立表，与 HLD §5.1 一致）。
 */

/* ===================== 字段类型词汇表 ===================== */

/**
 * 字段类型（HLD §5.3 / PRD §7.2.1）。
 *
 * - 基础类型：string / number / boolean / date / datetime / text
 * - 标识：uuid
 * - 结构化：json
 * - 业务：enum（单选/多选）/ ref（关联）/ formula（公式，运行时计算）
 * - 业务扩展：attachment（附件）/ location（地理位置）/ signature（签名）
 *             / image（图片）/ subtable（子表占位，PRD §7.2.1 一对多）
 *
 * 注：数据库 type 列为 String，可承载未来新增类型而不需迁移。
 */
export enum FieldType {
  String = 'string',
  Text = 'text',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  DateTime = 'datetime',
  Uuid = 'uuid',
  Json = 'json',
  Enum = 'enum',
  Ref = 'ref',
  Formula = 'formula',
  Attachment = 'attachment',
  Location = 'location',
  Signature = 'signature',
  Image = 'image',
  SubTable = 'subtable',
}

/** FieldType 集合，便于遍历（如前端下拉） */
export const FIELD_TYPES: readonly FieldType[] = Object.values(FieldType);

/** 文本类字段：string / text */
export const TEXT_LIKE_FIELD_TYPES: readonly FieldType[] = [FieldType.String, FieldType.Text];

/** 数字类字段：number */
export const NUMERIC_FIELD_TYPES: readonly FieldType[] = [FieldType.Number];

/** 时间类字段：date / datetime */
export const DATE_LIKE_FIELD_TYPES: readonly FieldType[] = [FieldType.Date, FieldType.DateTime];

/* ===================== 字段配置（type → options 判别联合） ===================== */

/** 文本类（string / text）配置：长度约束、是否多行 */
export interface TextFieldConfig {
  type: FieldType.String | FieldType.Text;
  /** 最小长度。默认 0。 */
  minLength?: number;
  /** 最大长度。string 默认 200、text 默认 2000（PRD §7.2.1）。 */
  maxLength?: number;
  /** 是否多行（仅 text 有意义） */
  multiline?: boolean;
  /** 正则表达式（可选，提交时校验） */
  pattern?: string;
  /** 占位提示 */
  placeholder?: string;
}

/** 数字类（number）配置：精度、区间 */
export interface NumberFieldConfig {
  type: FieldType.Number;
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
  /** 小数位数（PRD §7.2.1 最多 4 位） */
  precision?: number;
  /** 是否允许负数，默认 true */
  allowNegative?: boolean;
  /** 单位（如 "元"、"kg"） */
  unit?: string;
}

/** 布尔类配置 */
export interface BooleanFieldConfig {
  type: FieldType.Boolean;
  /** 显示文案 */
  trueLabel?: string;
  falseLabel?: string;
}

/** 日期 / 日期时间配置 */
export interface DateFieldConfig {
  type: FieldType.Date | FieldType.DateTime;
  /** 是否可为空（默认 true） */
  nullable?: boolean;
  /** 默认值：now / today / custom */
  defaultKind?: 'now' | 'today' | 'custom';
  /** 自定义默认值（ISO8601） */
  defaultValue?: string;
  /** 占位提示 */
  placeholder?: string;
}

/** UUID 配置 */
export interface UuidFieldConfig {
  type: FieldType.Uuid;
  /** 生成策略：auto（创建时自动生成）/ manual（用户输入） */
  generated?: 'auto' | 'manual';
}

/** JSON 配置：声明内部结构（仅提示，不强制 schema 校验） */
export interface JsonFieldConfig {
  type: FieldType.Json;
  /** 内部结构示例（仅前端展示用） */
  sample?: Record<string, unknown>;
}

/** 枚举配置：单选/多选 + 选项列表 */
export interface EnumOption {
  /** 选项值（业务值，DB 中存储） */
  value: string;
  /** 选项标签（UI 展示） */
  label: string;
  /** 选项颜色（可选，前端按需渲染） */
  color?: string;
}

export interface EnumFieldConfig {
  type: FieldType.Enum;
  /** 选项列表 */
  options: EnumOption[];
  /** 是否多选 */
  multiple?: boolean;
}

/** 关联配置：指向目标实体 */
export interface RefFieldConfig {
  type: FieldType.Ref;
  /** 目标实体 ID（必填，PRD §7.2.1 关联字段必须选择目标实体） */
  targetEntityId: string;
  /** 目标实体的展示字段（必填） */
  displayField: string;
  /** 是否多选（多对多语义） */
  multiple?: boolean;
  /** 引用约束 */
  onDelete?: 'restrict' | 'cascade' | 'set_null';
}

/** 公式配置：不可手填，由运行时计算 */
export interface FormulaFieldConfig {
  type: FieldType.Formula;
  /** 表达式（如 "amount * price"，前端展示与运行时计算） */
  expression: string;
  /** 返回类型（number / string / date） */
  returnType: 'number' | 'string' | 'date';
  /** 是否可写（默认 false） */
  writable?: boolean;
}

/** 附件 / 图片 配置 */
export interface MediaFieldConfig {
  type: FieldType.Attachment | FieldType.Image;
  /** 最大文件数（attachment 才有意义） */
  maxCount?: number;
  /** 单文件大小上限（字节） */
  maxSize?: number;
  /** 允许的 MIME 白名单（如 ["image/png","image/jpeg"]） */
  acceptMime?: string[];
}

/** 地理位置配置 */
export interface LocationFieldConfig {
  type: FieldType.Location;
  /** 是否仅取经纬度 / 是否采集地址 */
  captureAddress?: boolean;
}

/** 签名配置（图片形式的签名） */
export interface SignatureFieldConfig {
  type: FieldType.Signature;
  /** 画布宽度 */
  width?: number;
  /** 画布高度 */
  height?: number;
}

/** 子表占位（PRD §7.2.1 一对多，主子表独立物理表） */
export interface SubTableFieldConfig {
  type: FieldType.SubTable;
  /** 子表对应的目标实体 ID（独立物理表） */
  targetEntityId: string;
  /** 子表最小行数 */
  minRows?: number;
  /** 子表最大行数（PRD §7.2.1 表单子表最多 50 行） */
  maxRows?: number;
}

/** FieldConfig 判别联合 */
export type FieldConfig =
  | TextFieldConfig
  | NumberFieldConfig
  | BooleanFieldConfig
  | DateFieldConfig
  | UuidFieldConfig
  | JsonFieldConfig
  | EnumFieldConfig
  | RefFieldConfig
  | FormulaFieldConfig
  | MediaFieldConfig
  | LocationFieldConfig
  | SignatureFieldConfig
  | SubTableFieldConfig;

/* ===================== 校验规则（Field.config 内的扩展段） ===================== */

/** 单条校验规则（HLD §5.3 fields.config JSONB）。 */
export interface FieldValidationRule {
  /** 规则类型：required / min / max / regex / custom */
  kind: 'required' | 'min' | 'max' | 'regex' | 'custom';
  /** 规则值（kind=custom 时为函数名） */
  value?: unknown;
  /** 失败时的提示文案 */
  message?: string;
}

/* ===================== 索引（Field.config 内的扩展段） ===================== */

/** 索引定义（v0.1：单字段索引；联合索引由 HLD §13 性能基线部分覆盖）。 */
export interface FieldIndex {
  /** 唯一索引 */
  unique?: boolean;
  /** 是否为 BTree 索引（默认 BTree） */
  kind?: 'btree' | 'gin' | 'gist';
  /** 索引名（可选，自动生成） */
  name?: string;
}

/* ===================== 实体 / 字段 / 关系 schema ===================== */

/** 关系类型（与 Prisma RelationType enum 一致，DB 中以小写字符串存储） */
export enum RelationType {
  OneToOne = 'one_to_one',
  OneToMany = 'one_to_many',
  ManyToOne = 'many_to_one',
  ManyToMany = 'many_to_many',
}

/** RelationType 集合（DTO 校验用） */
export const RELATION_TYPE_VALUES: readonly RelationType[] = Object.values(RelationType);

/** 关系级联策略 */
export type RelationOnDelete = 'restrict' | 'cascade' | 'set_null';

/** 字段元数据 schema（与 DB fields 表一一对应）。 */
export interface FieldSchema {
  id: string;
  entityId: string;
  /** 列名（字母/数字/下划线，最长 64，PRD §7.2.1） */
  name: string;
  /** 展示名（中文、UI 用） */
  label: string;
  type: FieldType;
  /** 类型相关选项，判别联合 */
  config?: FieldConfig;
  /** 必填 */
  required?: boolean;
  /** 唯一（联合唯一需在 config.index 中声明） */
  unique?: boolean;
  /** 默认值（字符串形式） */
  defaultValue?: string | null;
  /** 是否系统字段（如 created_at，禁删） */
  isSystem?: boolean;
  /** 是否已软删（PRD 7.2.1 字段被引用时默认软删） */
  deprecated?: boolean;
  /** 字段在表中的显示顺序 */
  sortOrder?: number;
  /** 描述（管理员可见） */
  description?: string;
  /** 校验规则（业务侧，与 class-validator 解耦） */
  validations?: FieldValidationRule[];
  /** 索引（v0.1 单字段索引） */
  index?: FieldIndex;
}

/** 关系元数据 schema（与 DB relations 表一一对应）。 */
export interface RelationSchema {
  id: string;
  appId: string;
  /** 关系名（展示用，描述语义） */
  name: string;
  type: RelationType;
  /** 源实体 ID */
  sourceEntityId: string;
  /** 源字段 ID（多对多时可空） */
  sourceFieldId?: string | null;
  /** 目标实体 ID */
  targetEntityId: string;
  /** 多对多中间表名（自动生成：e_<a>__<b>__rel） */
  junctionTable?: string | null;
  /** 级联策略 */
  onDelete?: RelationOnDelete;
}

/** 实体元数据 schema（与 DB entities 表一一对应）。 */
export interface EntitySchema {
  id: string;
  appId: string;
  /** 展示名（中文，UI 用） */
  name: string;
  /** 实体标识（英文 slug，应用内唯一） */
  slug: string;
  /** 物理表名（HLD §5.1：e_<app_slug>__<entity_slug>） */
  tableName: string;
  description?: string;
  /** active / archived（保留位，MVP 仅用 active） */
  status?: 'active' | 'archived';
  /** 字段列表（可选加载，列表 API 默认不返回） */
  fields?: FieldSchema[];
  /** 关系列表（可选加载） */
  relations?: RelationSchema[];
}

/* ===================== 辅助工具 ===================== */

/** 物理表名生成（HLD §5.1：e_<app_slug>__<entity_slug>）。 */
export function entityTableName(appSlug: string, entitySlug: string): string {
  return `e_${slugifyAppSlug(appSlug)}__${slugifyEntitySlug(entitySlug)}`;
}

/** 多对多中间表名（e_<a_slug>__<b_slug>__rel，按字母序排列避免重复）。 */
export function junctionTableName(aSlug: string, bSlug: string): string {
  const [x, y] = [aSlug, bSlug].sort();
  return `e_${slugifyEntitySlug(x)}__${slugifyEntitySlug(y)}__rel`;
}

/** 实体 slug 规则：仅小写字母、数字、下划线，1–64 字符。 */
const ENTITY_SLUG_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** 应用 slug 规则：仅小写字母、数字、连字符，1–64 字符。 */
const APP_SLUG_RE = /^[a-z][a-z0-9-]{0,63}$/;

/** 字段名规则：字母/数字/下划线，1–64 字符（PRD §7.2.1）。 */
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export function isValidEntitySlug(slug: string): boolean {
  return typeof slug === 'string' && ENTITY_SLUG_RE.test(slug);
}

export function isValidAppSlug(slug: string): boolean {
  return typeof slug === 'string' && APP_SLUG_RE.test(slug);
}

export function isValidFieldName(name: string): boolean {
  return typeof name === 'string' && FIELD_NAME_RE.test(name);
}

function slugifyAppSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugifyEntitySlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
