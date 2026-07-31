import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

/**
 * 创建用户输入（供 T41 初始化向导 / 管理员创建使用）。
 */
export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
