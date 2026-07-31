import { IsString } from 'class-validator';

/**
 * Token 刷新请求体。
 */
export class RefreshTokenDto {
  @IsString()
  refreshToken!: string;
}
