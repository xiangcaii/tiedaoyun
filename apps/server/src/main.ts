/**
 * 铁道云后端服务入口（骨架）。
 *
 * 当前为 T4 阶段的最小骨架，仅验证对 @tiedaoyun/utils 的引用通过类型检查。
 * T5 将在此基础接入 NestJS（main.ts / app.module.ts / config / common）。
 */

import { APP_VERSION, nowISO, physicalTableName, slugify } from '@tiedaoyun/utils';

/** 服务版本，来自共享 utils */
export const SERVER_VERSION: string = APP_VERSION;

/** 默认应用 slug（启动自检示例用） */
export const DEFAULT_APP_SLUG: string = slugify('tiedaoyun');

/** 示例：物理表名生成（HLD §5.1），证明 utils 引用可用 */
export const DEMO_TABLE_NAME: string = physicalTableName(DEFAULT_APP_SLUG, 'employee');

/** 启动时间戳（ISO8601 UTC，HLD §6.1） */
export const BOOT_TIME: string = nowISO();
