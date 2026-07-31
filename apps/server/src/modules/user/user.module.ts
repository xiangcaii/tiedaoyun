/**
 * 用户模块（HLD §4.1 modules/user）。
 *
 * 提供 UserService 供 Auth 等模块注入；不暴露独立 Controller（v0.1 阶段）。
 */
import { Module, Global } from '@nestjs/common';
import { UserService } from './user.service';

@Global()
@Module({
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
