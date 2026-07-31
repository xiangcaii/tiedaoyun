/**
 * 全局异常过滤器（HLD §4.1 common/filters、§6.1 统一错误响应）。
 *
 * 统一所有未捕获异常的 JSON 输出形状：
 * {
 *   "statusCode": number,
 *   "code": string,            // 业务/错误码，默认 "INTERNAL_ERROR"
 *   "message": string,         // 面向调用方的简短描述
 *   "errors"?: unknown,        // 校验类异常携带的字段级明细
 *   "timestamp": string,       // ISO8601 UTC
 *   "path": string             // 请求路径
 * }
 *
 * - HttpException 及其子类（含 ValidationPipe 抛出的 BadRequestException）
 *   按其声明的 status 与 message 透传。
 * - 其它异常统一 500，message 在非 production 下附带 error.name，
 *   生产环境只暴露 "Internal server error" 以避免泄漏堆栈。
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Request, Response } from 'express';
import { nowISO } from '@tiedaoyun/utils';

export interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  errors?: unknown;
  timestamp: string;
  path: string;
}

/** 将 HttpException 的 response 归一化为 { message, code?, errors? } */
function normalizeHttpExceptionResponse(response: unknown): {
  message: string;
  code?: string;
  errors?: unknown;
} {
  if (typeof response === 'string') {
    return { message: response };
  }
  if (response && typeof response === 'object') {
    const obj = response as Record<string, unknown>;
    const message =
      typeof obj.message === 'string'
        ? obj.message
        : Array.isArray(obj.message)
          ? obj.message.join(', ')
          : 'Http exception';
    const code = typeof obj.code === 'string' ? obj.code : undefined;
    const errors = obj.error ?? (Array.isArray(obj.message) ? obj.message : undefined);
    return { message, code, errors };
  }
  return { message: 'Http exception' };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost?: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, code, errors } = isHttp
      ? normalizeHttpExceptionResponse(exception.getResponse())
      : {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
          errors: undefined,
        };

    // 非 HttpException 一律按错误记录堆栈，便于排查（HLD §11.2 可观测）。
    if (!isHttp) {
      const err = exception as Error;
      this.logger.error(
        `未处理异常: ${err?.name ?? typeof exception} ${err?.message ?? ''}`,
        err?.stack,
      );
    }

    const envelope: ErrorEnvelope = {
      statusCode,
      code: code ?? this.defaultCodeFor(statusCode),
      message,
      timestamp: nowISO(),
      path: request?.url ?? '',
    };
    if (errors !== undefined) {
      envelope.errors = errors;
    }

    // 兼容非 Express 适配器：优先用 HttpAdapter 写响应。
    if (this.httpAdapterHost?.httpAdapter) {
      this.httpAdapterHost.httpAdapter.reply(response, envelope, statusCode);
    } else {
      response.status(statusCode).json(envelope);
    }
  }

  private defaultCodeFor(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
