/**
 * Vitest 配置（apps/server）。
 *
 * NestJS 使用 CommonJS 模块，vitest 在此处配置 ts 转换
 * 以支持 TypeScript + decorator 元数据。
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: __dirname,
    watch: false,
    include: ['src/**/*.spec.ts'],
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
