/**
 * 用户服务（HLD §4.1 modules/user）。
 *
 * 职责：用户查询、创建、状态管理。
 * 密码哈希与验证由 AuthService 负责，本服务只存取 passwordHash。
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  /** 按 id 查询用户（排除已软删的） */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /** 按 email 查询用户（排除已软删的） */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
    });
  }

  /** 创建用户 */
  async create(data: { email: string; name: string; passwordHash: string }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase().trim(),
        name: data.name,
        passwordHash: data.passwordHash,
      },
    });
  }

  /** 更新最后登录时间 */
  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }
}
