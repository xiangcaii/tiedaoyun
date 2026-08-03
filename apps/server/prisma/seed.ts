/**
 * 开发种子用户脚本（仅本地联调用，勿在生产执行）。
 *
 * 用法：
 *   pnpm -F @tiedaoyun/server exec tsx prisma/seed.ts
 *
 * 行为：upsert 一个开发管理员账号，密码用 bcrypt cost 12 哈希
 * （与 AuthService.BCRYPT_COST 对齐）。重复执行幂等。
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;

const DEV_USER = {
  email: 'admin@tiedaoyun.local',
  name: '开发管理员',
  password: 'Admin@123456',
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(DEV_USER.password, BCRYPT_COST);
    const user = await prisma.user.upsert({
      where: { email: DEV_USER.email },
      update: { passwordHash, name: DEV_USER.name, status: 'ACTIVE' },
      create: {
        email: DEV_USER.email,
        name: DEV_USER.name,
        passwordHash,
        status: 'ACTIVE',
        isSuperadmin: true,
      },
    });
    console.log('✅ 种子用户已就绪：');
    console.log(`   email    : ${user.email}`);
    console.log(`   name     : ${user.name}`);
    console.log(`   password : ${DEV_USER.password}`);
    console.log(`   id       : ${user.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ 种子用户创建失败：', err);
  process.exit(1);
});
