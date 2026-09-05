import { z, ZodError, ZodSchema } from 'zod';
import { ApiError } from '@/lib/errors';

/**
 * Validates any payload against a Zod schema
 * Throws ApiError with 422 Unprocessable Entity on failure
 */
export async function validateRequest<T>(
  schema: ZodSchema<T>,
  data: unknown
): Promise<T> {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedErrors = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      throw ApiError.validationFailed(
        'Dữ liệu yêu cầu không vượt qua kiểm định schema',
        formattedErrors
      );
    }
    throw ApiError.badRequest('Dữ liệu không đúng định dạng');
  }
}

/**
 * Common Reusable Validation Schemas
 */
export const CommonSchemas = {
  uuid: z.string().uuid('ID phải là định dạng UUID hợp lệ'),
  email: z.string().email('Email không đúng định dạng'),
  phone: z
    .string()
    .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ tại Việt Nam'),
  password: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất 1 chữ hoa')
    .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 chữ số'),
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
  dateString: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng ngày phải là YYYY-MM-DD'),
};

export * from './worksite';
export * from './gps-attendance';
