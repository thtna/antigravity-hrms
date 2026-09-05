import { NextResponse } from 'next/server';
import { ApiResponse } from '@/types';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_SERVER_ERROR'
  | 'OUT_OF_GEOFENCE'
  | 'QR_EXPIRED'
  | 'PAYROLL_LOCKED'
  | 'ROSTER_CONFLICT';

export class AppError extends Error {
  public readonly isOperational: boolean;

  constructor(message: string, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ApiError extends AppError {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    errorCode: ErrorCode,
    message: string,
    details?: unknown,
    isOperational = true
  ) {
    super(message, isOperational);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Yêu cầu xác thực tài khoản') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Bạn không có quyền thực hiện hành động này') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Không tìm thấy tài nguyên yêu cầu') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static validationFailed(message = 'Dữ liệu không hợp lệ', details?: unknown) {
    return new ApiError(422, 'VALIDATION_FAILED', message, details);
  }

  static internal(message = 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau') {
    return new ApiError(500, 'INTERNAL_SERVER_ERROR', message, undefined, false);
  }
}

export function handleApiError<T = never>(error: unknown): NextResponse<ApiResponse<T>> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
          details: error.details,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: error.statusCode }
    );
  }

  // Lỗi không xác định hoặc lỗi Runtime hệ thống
  console.error('[Unhandled System Error]:', error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng liên hệ quản trị viên.',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    },
    { status: 500 }
  );
}
