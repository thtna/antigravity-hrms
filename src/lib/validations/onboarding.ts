import { z } from 'zod';

export const Step1BusinessSchema = z.object({
  name: z.string().min(2, 'Tên doanh nghiệp phải có ít nhất 2 ký tự'),
  taxCode: z.string().optional().nullable(),
  email: z.string().email('Email không đúng định dạng').optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

export const Step2BranchSchema = z.object({
  name: z.string().min(2, 'Tên chi nhánh phải có ít nhất 2 ký tự'),
  code: z.string().min(2, 'Mã chi nhánh phải có ít nhất 2 ký tự').max(20, 'Mã chi nhánh tối đa 20 ký tự'),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

export const Step3DepartmentSchema = z.object({
  name: z.string().min(2, 'Tên phòng ban phải có ít nhất 2 ký tự'),
  code: z.string().min(2, 'Mã phòng ban phải có ít nhất 2 ký tự').max(20, 'Mã phòng ban tối đa 20 ký tự'),
  description: z.string().optional().nullable(),
});

export const Step4PositionSchema = z.object({
  title: z.string().min(2, 'Chức danh phải có ít nhất 2 ký tự'),
  code: z.string().min(2, 'Mã chức danh phải có ít nhất 2 ký tự').max(20, 'Mã chức danh tối đa 20 ký tự'),
  description: z.string().optional().nullable(),
  baseSalaryGrade: z.coerce.number().min(0, 'Mức lương cơ bản không thể âm').default(0),
  minSalary: z.coerce.number().min(0, 'Lương tối thiểu không thể âm').default(0),
  maxSalary: z.coerce.number().min(0, 'Lương tối đa không thể âm').default(0),
});

export const Step5ShiftSchema = z.object({
  name: z.string().min(2, 'Tên ca làm việc phải có ít nhất 2 ký tự'),
  code: z.string().min(2, 'Mã ca phải có ít nhất 2 ký tự').max(20, 'Mã ca tối đa 20 ký tự'),
  description: z.string().optional().nullable(),
  shiftType: z.enum(['FIXED', 'FLEXIBLE']).default('FIXED'),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Thời gian bắt đầu không hợp lệ (HH:mm)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Thời gian kết thúc không hợp lệ (HH:mm)'),
  breakMinutes: z.coerce.number().min(0, 'Thời gian nghỉ không được âm').default(60),
  gracePeriodLate: z.coerce.number().min(0).default(15),
  gracePeriodEarly: z.coerce.number().min(0).default(15),
  standardWorkHours: z.coerce.number().min(1).max(24).default(8),
  effectiveFrom: z.string().optional(),
});

export const Step6EmployeeSchema = z.object({
  firstName: z.string().min(1, 'Tên không được để trống'),
  lastName: z.string().min(1, 'Họ đệm không được để trống'),
  employeeCode: z.string().min(2, 'Mã nhân viên phải có ít nhất 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  phoneNumber: z.string().min(8, 'Số điện thoại tối thiểu 8 chữ số'),
  departmentId: z.string().optional().nullable(),
  positionId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
  contractSalary: z.coerce.number().min(0).default(10000000),
  hireDate: z.string().optional(),
});

export const Step7AttendanceSchema = z.object({
  name: z.string().min(2, 'Tên địa điểm chấm công ít nhất 2 ký tự'),
  address: z.string().min(3, 'Địa chỉ ít nhất 3 ký tự'),
  latitude: z.coerce.number().min(-90).max(90).default(21.028511),
  longitude: z.coerce.number().min(-180).max(180).default(105.854444),
  radiusMeters: z.coerce.number().min(10).max(5000).default(150),
  branchId: z.string().optional().nullable(),
  enableQr: z.boolean().default(true),
  enableGps: z.boolean().default(true),
});

export const Step8PayrollSchema = z.object({
  ruleCode: z.string().min(2, 'Mã quy chế lương ít nhất 2 ký tự').default('VN_STATUTORY_2026'),
  ruleName: z.string().min(2, 'Tên quy chế lương ít nhất 2 ký tự').default('Quy chế tiền lương Việt Nam 2026'),
  standardWorkDays: z.coerce.number().min(15).max(31).default(22),
  useStatutoryVietnam: z.boolean().default(true),
});

export type Step1BusinessInput = z.infer<typeof Step1BusinessSchema>;
export type Step2BranchInput = z.infer<typeof Step2BranchSchema>;
export type Step3DepartmentInput = z.infer<typeof Step3DepartmentSchema>;
export type Step4PositionInput = z.infer<typeof Step4PositionSchema>;
export type Step5ShiftInput = z.infer<typeof Step5ShiftSchema>;
export type Step6EmployeeInput = z.infer<typeof Step6EmployeeSchema>;
export type Step7AttendanceInput = z.infer<typeof Step7AttendanceSchema>;
export type Step8PayrollInput = z.infer<typeof Step8PayrollSchema>;
