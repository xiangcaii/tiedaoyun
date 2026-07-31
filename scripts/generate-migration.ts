/**
 * 生成 Prisma migration 的辅助脚本（plan T6 / HLD §5.2）。
 *
 * 用法：
 *   pnpm db:migrate <name> [extra prisma migrate dev args...]
 *   例：pnpm db:migrate init_metadata
 *
 * 行为：
 * 1. 依次加载仓库根 `.env`、`apps/server/.env`（后者优先），合并进 process.env；
 * 2. 校验 DATABASE_URL 存在且为 PostgreSQL 连接串；
 * 3. 校验迁移名（字母开头，仅字母/数字/下划线）；
 * 4. 在 apps/server 下执行 `prisma migrate dev --name <name>`。
 *
 * 说明：业务实体（动态物理表）的迁移不走本脚本，由 data-model 模块在保存实体时
 * 生成并记录到 app_migrations 表（T11）；本脚本仅服务于元数据 schema 演化。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const SERVER_DIR = resolve(ROOT, 'apps/server');

/** 极简 .env 解析（KEY=VALUE，支持引号与注释），避免引入额外依赖 */
function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const result: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function fail(message: string): never {
  console.error(`[generate-migration] ${message}`);
  process.exit(1);
}

const name = process.argv[2];
if (!name) {
  fail('缺少迁移名。用法：pnpm db:migrate <name>（如 pnpm db:migrate init_metadata）');
}
if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
  fail(`迁移名 "${name}" 非法：需字母开头，仅含字母 / 数字 / 下划线。`);
}

const env: NodeJS.ProcessEnv = {
  ...process.env,
  ...loadEnvFile(resolve(ROOT, '.env')),
  ...loadEnvFile(resolve(SERVER_DIR, '.env')),
};

if (!env.DATABASE_URL || !/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
  fail(
    'DATABASE_URL 未配置或不是 PostgreSQL 连接串。请复制 .env.example 为 .env（仓库根或 apps/server/）后重试。',
  );
}

const extraArgs = process.argv.slice(3);
const args = ['exec', 'prisma', 'migrate', 'dev', '--name', name, ...extraArgs];

console.error(`[generate-migration] cwd=${SERVER_DIR}`);
console.error(`[generate-migration] pnpm ${args.join(' ')}`);

const child = spawnSync('pnpm', args, {
  cwd: SERVER_DIR,
  env,
  stdio: 'inherit',
  shell: true, // Windows 下 pnpm 为 .cmd，需要 shell
});

if (child.error) {
  fail(`执行失败：${child.error.message}`);
}
process.exit(child.status ?? 1);
