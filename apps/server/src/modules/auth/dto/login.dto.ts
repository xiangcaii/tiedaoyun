import { IsEmail, IsString } from 'class-validator';

/**
 * 登录请求体（HLD §7.1 账号密码登录）。
 */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
