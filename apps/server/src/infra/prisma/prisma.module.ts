/**
 * PrismaModule：全局模块，所有业务模块可直接注入 PrismaService
 * 而无需重复 import（HLD §4.1 infra/prisma）。
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
