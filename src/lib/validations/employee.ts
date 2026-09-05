import { z } from 'zod';

export const EmployeeDocumentSchema = z.object({
  id: z.string().uuid().default(() => crypto.randomUUID()),
  name: z.string().min(1, 'Tên tài liệu không được để trống'),
  type: z.enum(['CONTRACT', 'ID_CARD', 'RESUME', 'CERTIFICATE', 'OTHER']).default('OTHER'),
  url: z.string().min(1, 'Đường dẫn tài liệu không được để trống'),
  size: z.number().nonnegative().default(0),
  uploadedAt: z.string().default(() => new Date().toISOString()),
});

export type EmployeeDocument = z.infer<typeof EmployeeDocumentSchema>;

export const CreateEmployeeSchema = z.object({
  employeeCode: z
    .string()
    .min(3, 'Mã nhân viên phải có ít nhất 3 ký tự')
    .max(30, 'Mã nhân viên tối đa 30 ký tự')
    .regex(/^[A-Z0-9_-]+$/i, 'Mã nhân viên chỉ gồm chữ cái, số, gạch nối'),
  firstName: z.string().min(1, 'Tên không được để trống').max(50),
  lastName: z.string().min(1, 'Họ và tên đệm không được để trống').max(100),
  email: z.string().email('Email không đúng định dạng'),
  phoneNumber: z
    .string()
    .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, 'Số điện thoại không hợp lệ tại Việt Nam'),
  avatarUrl: z.string().url('Đường dẫn ảnh đại diện không hợp lệ').optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).default('MALE'),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh định dạng YYYY-MM-DD').optional(),
  identityCard: z.string().min(9, 'Số CCCD/Hộ chiếu tối thiểu 9 ký tự').max(20).optional().or(z.literal('')),
  departmentId: z.string().min(1, 'Vui lòng chọn phòng ban'),
  positionId: z.string().min(1, 'Vui lòng chọn chức vụ'),
  worksiteId: z.string().optional().or(z.literal('')),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày tuyển dụng định dạng YYYY-MM-DD').default(() => new Date().toISOString().split('T')[0]),
  contractType: z.enum(['PROBATION', 'FIXED_TERM', 'INDEFINITE']).default('PROBATION'),
  contractSalary: z.coerce.number().min(0, 'Lương cơ bản không được âm').default(0),
  hourlyRate: z.coerce.number().min(0, 'Lương theo giờ không được âm').default(0),
  insuranceSalary: z.coerce.number().min(0).default(0),
  taxCode: z.string().optional().or(z.literal('')),
  dependentsCount: z.coerce.number().int().min(0).default(0),
  bankAccountNo: z.string().optional().or(z.literal('')),
  bankName: z.string().optional().or(z.literal('')),
  documents: z.array(EmployeeDocumentSchema).default([]),
  status: z.enum(['ACTIVE', 'PROBATION', 'ON_LEAVE', 'TERMINATED']).default('ACTIVE'),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

export const EmployeeQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  departmentId: z.string().optional(),
  positionId: z.string().optional(),
  status: z.enum(['ACTIVE', 'PROBATION', 'ON_LEAVE', 'TERMINATED', 'ALL']).optional(),
  sortBy: z.enum(['employeeCode', 'lastName', 'hireDate', 'contractSalary', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type EmployeeQueryParams = z.infer<typeof EmployeeQuerySchema>;
