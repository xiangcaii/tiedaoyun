/**
 * 铁道云低代码平台 — 共享工具函数
 *
 * 前后端共用的纯函数工具，不依赖任何特定运行时环境（HLD §4.3）。
 */

/** 应用版本号，与根 package.json 保持一致 */
export const APP_VERSION = '0.1.0';

/**
 * 将任意字符串转为 URL / 表名友好的 slug。
 * 中文会被保留（HLD §5.1 物理表命名 e_<app_slug>__<entity_slug>）。
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 生成 UUID v4。优先使用原生 crypto.randomUUID（Node 19+ / 现代浏览器），
 * 否则回退到基于 Math.random 的兜底实现（仅用于非安全场景）。
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 当前时间的 ISO8601 UTC 字符串（HLD §6.1 时间统一 ISO8601 + UTC） */
export function nowISO(): string {
  return new Date().toISOString();
}

/** 动态物理表名生成（HLD §5.1：e_<app_slug>__<entity_slug>） */
export function physicalTableName(appSlug: string, entitySlug: string): string {
  return `e_${slugify(appSlug)}__${slugify(entitySlug)}`;
}

/** 安全解析 JSON，失败时返回 fallback */
export function safeJSONParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** 简单的 sleep，便于测试与异步流程编排 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
