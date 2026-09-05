import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { VIETNAM_STATUTORY_RULE_2026 } from '../src/lib/payroll/default-rules';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 ==============================================================================');
  console.log('🚀 ANTIGRAVITY HRMS — ENTERPRISE SEEDING (PHASE 27 REAL-WORLD SIMULATION)');
  console.log('🚀 Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong (Tan Phong Digital JSC)');
  console.log('🚀 ==============================================================================\n');

  const defaultPassword = 'Antigravity@2026';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // ----------------------------------------------------------------------------
  // 1. RBAC Roles
  // ----------------------------------------------------------------------------
  const roleDefinitions = [
    { code: 'admin', name: 'Quản Trị Viên', description: 'Toàn quyền cấu hình và quản trị hệ thống' },
    { code: 'hr', name: 'Chuyên Viên Nhân Sự', description: 'Quản lý nhân viên, hồ sơ, ca làm việc, duyệt phép, bảng lương' },
    { code: 'manager', name: 'Quản Lý Bộ Phận', description: 'Quản lý nhân sự phòng ban, duyệt giải trình, KPI, phê duyệt sơ bộ' },
    { code: 'employee', name: 'Nhân Viên', description: 'Chấm công, xin nghỉ phép, xem bảng lương và KPI cá nhân' },
  ];

  const rolesMap = new Map<string, string>();
  for (const r of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description },
      create: r,
    });
    rolesMap.set(r.code, role.id);
  }
  console.log('✅ 1. Khởi tạo 4 vai trò RBAC (admin, hr, manager, employee)');

  // ----------------------------------------------------------------------------
  // 2. Worksite (Discovery Complex Headquarter)
  // ----------------------------------------------------------------------------
  const worksite = await prisma.worksite.upsert({
    where: { id: 'ws-hanoi-discovery' },
    update: {},
    create: {
      id: 'ws-hanoi-discovery',
      name: 'Trụ Sở Chính — Discovery Complex Tower',
      address: 'Tầng 18, Tòa nhà Discovery Complex, 302 Cầu Giấy, Hà Nội',
      latitude: new Prisma.Decimal(21.035417),
      longitude: new Prisma.Decimal(105.795123),
      radiusMeters: 100,
      isActive: true,
    },
  });
  console.log('✅ 2. Khởi tạo địa điểm làm việc: Trụ Sở Chính Discovery Complex (Bán kính Geofence: 100m)');

  // ----------------------------------------------------------------------------
  // 3. Departments (5 Functional Departments)
  // ----------------------------------------------------------------------------
  const deptBod = await prisma.department.upsert({
    where: { code: 'BOD' },
    update: { name: 'Ban Tổng Giám Đốc' },
    create: {
      code: 'BOD',
      name: 'Ban Tổng Giám Đốc',
      description: 'Điều hành chiến lược, phê duyệt kế hoạch kinh doanh và chính sách toàn công ty.',
      isActive: true,
    },
  });

  const deptHr = await prisma.department.upsert({
    where: { code: 'HR' },
    update: { name: 'Phòng Nhân Sự & Văn Hóa Doanh Nghiệp' },
    create: {
      code: 'HR',
      name: 'Phòng Nhân Sự & Văn Hóa Doanh Nghiệp',
      description: 'Quản trị nhân sự, tuyển dụng, đào tạo, C&B và quan hệ lao động.',
      isActive: true,
    },
  });

  const deptTech = await prisma.department.upsert({
    where: { code: 'TECH' },
    update: { name: 'Khối Công Nghệ & Kỹ Thuật Phần Mềm' },
    create: {
      code: 'TECH',
      name: 'Khối Công Nghệ & Kỹ Thuật Phần Mềm',
      description: 'Nghiên cứu kiến trúc, phát triển phần mềm và hạ tầng điện toán đám mây.',
      isActive: true,
    },
  });

  const deptSales = await prisma.department.upsert({
    where: { code: 'SALES' },
    update: { name: 'Khối Kinh Doanh & Quan Hệ Khách Hàng' },
    create: {
      code: 'SALES',
      name: 'Khối Kinh Doanh & Quan Hệ Khách Hàng',
      description: 'Phát triển khách hàng doanh nghiệp, tư vấn giải pháp và đảm bảo doanh số.',
      isActive: true,
    },
  });

  const deptOps = await prisma.department.upsert({
    where: { code: 'OPS' },
    update: { name: 'Khối Vận Hành Hệ Thống & Hỗ Trợ 24/7' },
    create: {
      code: 'OPS',
      name: 'Khối Vận Hành Hệ Thống & Hỗ Trợ 24/7',
      description: 'Giám sát dịch vụ mạng, vận hành ca đêm và hỗ trợ kỹ thuật khách hàng 24/7.',
      isActive: true,
    },
  });
  console.log('✅ 3. Khởi tạo 5 phòng ban: BOD, HR, TECH, SALES, OPS');

  // ----------------------------------------------------------------------------
  // 4. Positions & Standard Salary Grades (8 Positions)
  // ----------------------------------------------------------------------------
  const positionsData = [
    {
      code: 'CEO',
      title: 'Giám Đốc Điều Hành (CEO)',
      description: 'Lãnh đạo toàn diện chiến lược, pháp lý và vận hành công ty.',
      minSalary: 50000000,
      maxSalary: 100000000,
      baseSalaryGrade: 65000000,
    },
    {
      code: 'HR_DIR',
      title: 'Trưởng Phòng Nhân Sự',
      description: 'Hoạch định chiến lược nhân tài, ngân sách đãi ngộ và kiểm soát chính sách.',
      minSalary: 28000000,
      maxSalary: 55000000,
      baseSalaryGrade: 38000000,
    },
    {
      code: 'HR_CB',
      title: 'Chuyên Viên C&B & Chấm Công',
      description: 'Tính toán lương, phụ cấp, theo dõi công phép và báo cáo bảo hiểm.',
      minSalary: 14000000,
      maxSalary: 25000000,
      baseSalaryGrade: 18000000,
    },
    {
      code: 'TECH_LEAD',
      title: 'Trưởng Phòng Kỹ Thuật (Tech Lead)',
      description: 'Chỉ đạo kiến trúc kỹ thuật, phân công sprint và đánh giá KPI lập trình.',
      minSalary: 35000000,
      maxSalary: 65000000,
      baseSalaryGrade: 45000000,
    },
    {
      code: 'DEV_SR',
      title: 'Kỹ Sư Phần Mềm Cao Cấp (Senior Dev)',
      description: 'Thiết kế hệ thống cốt lõi, tối ưu truy vấn cơ sở dữ liệu và bảo mật.',
      minSalary: 25000000,
      maxSalary: 45000000,
      baseSalaryGrade: 32000000,
    },
    {
      code: 'DEV_MID',
      title: 'Kỹ Sư Phần Mềm (Mid Dev)',
      description: 'Xây dựng giao diện web, tích hợp API nghiệp vụ và viết kiểm thử.',
      minSalary: 16000000,
      maxSalary: 30000000,
      baseSalaryGrade: 22000000,
    },
    {
      code: 'SALES_LEAD',
      title: 'Trưởng Nhóm Kinh Doanh',
      description: 'Phát triển đối tác chiến lược, quản lý chỉ tiêu doanh thu nhóm B2B.',
      minSalary: 20000000,
      maxSalary: 45000000,
      baseSalaryGrade: 28000000,
    },
    {
      code: 'OPS_NIGHT',
      title: 'Chuyên Viên Vận Hành Ca Đêm 24/7',
      description: 'Trực hệ thống ca đêm, phản ứng sự cố hạ tầng và điều phối hỗ trợ khẩn cấp.',
      minSalary: 14000000,
      maxSalary: 26000000,
      baseSalaryGrade: 18000000,
    },
  ];

  const positionsMap = new Map<string, string>();
  for (const pos of positionsData) {
    const created = await prisma.position.upsert({
      where: { code: pos.code },
      update: {
        title: pos.title,
        description: pos.description,
        minSalary: new Prisma.Decimal(pos.minSalary),
        maxSalary: new Prisma.Decimal(pos.maxSalary),
        baseSalaryGrade: new Prisma.Decimal(pos.baseSalaryGrade),
      },
      create: {
        code: pos.code,
        title: pos.title,
        description: pos.description,
        minSalary: new Prisma.Decimal(pos.minSalary),
        maxSalary: new Prisma.Decimal(pos.maxSalary),
        baseSalaryGrade: new Prisma.Decimal(pos.baseSalaryGrade),
        isActive: true,
      },
    });
    positionsMap.set(pos.code, created.id);
  }
  console.log('✅ 4. Khởi tạo 8 chức vụ & khung thang bảng lương chuẩn');

  // ----------------------------------------------------------------------------
  // 5. Work Shifts (Fixed, Flexible, Overnight)
  // ----------------------------------------------------------------------------
  const shiftFixed = await prisma.workShift.upsert({
    where: { code: 'CA_HANH_CHINH' },
    update: {
      name: 'Ca Hành Chính Cố Định (08:00 - 17:00)',
      shiftType: 'FIXED',
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      isOvernight: false,
      gracePeriodLate: 15,
      gracePeriodEarly: 15,
      standardWorkHours: new Prisma.Decimal(8.0),
    },
    create: {
      code: 'CA_HANH_CHINH',
      name: 'Ca Hành Chính Cố Định (08:00 - 17:00)',
      description: 'Ca văn phòng tiêu chuẩn từ Thứ 2 đến Thứ 6. Nghỉ trưa 12:00 - 13:00.',
      shiftType: 'FIXED',
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      isOvernight: false,
      gracePeriodLate: 15,
      gracePeriodEarly: 15,
      standardWorkHours: new Prisma.Decimal(8.0),
      isActive: true,
    },
  });

  const shiftFlex = await prisma.workShift.upsert({
    where: { code: 'CA_LINH_HOAT' },
    update: {
      name: 'Ca Linh Hoạt Kỹ Thuật (07:30 - 09:30 Flex)',
      shiftType: 'FLEXIBLE',
      startTime: '07:30',
      endTime: '18:30',
      breakMinutes: 60,
      isOvernight: false,
      gracePeriodLate: 30,
      gracePeriodEarly: 30,
      standardWorkHours: new Prisma.Decimal(8.0),
    },
    create: {
      code: 'CA_LINH_HOAT',
      name: 'Ca Linh Hoạt Kỹ Thuật (07:30 - 09:30 Flex)',
      description: 'Khung giờ linh hoạt cho đội ngũ Kỹ thuật / R&D. Check-in từ 07:30 - 09:30, làm đủ 8 tiếng.',
      shiftType: 'FLEXIBLE',
      startTime: '07:30',
      endTime: '18:30',
      breakMinutes: 60,
      isOvernight: false,
      gracePeriodLate: 30,
      gracePeriodEarly: 30,
      standardWorkHours: new Prisma.Decimal(8.0),
      isActive: true,
    },
  });

  const shiftNight = await prisma.workShift.upsert({
    where: { code: 'CA_DEM' },
    update: {
      name: 'Ca Đêm Vận Hành 24/7 (22:00 - 06:00)',
      shiftType: 'FIXED',
      startTime: '22:00',
      endTime: '06:00',
      breakMinutes: 60,
      isOvernight: true,
      gracePeriodLate: 15,
      gracePeriodEarly: 15,
      standardWorkHours: new Prisma.Decimal(7.0),
    },
    create: {
      code: 'CA_DEM',
      name: 'Ca Đêm Vận Hành 24/7 (22:00 - 06:00)',
      description: 'Ca làm việc qua đêm trực hệ thống trung tâm dữ liệu. Phụ cấp ca đêm theo Bộ luật Lao động.',
      shiftType: 'FIXED',
      startTime: '22:00',
      endTime: '06:00',
      breakMinutes: 60,
      isOvernight: true,
      gracePeriodLate: 15,
      gracePeriodEarly: 15,
      standardWorkHours: new Prisma.Decimal(7.0),
      isActive: true,
    },
  });
  console.log('✅ 5. Khởi tạo 3 loại ca làm việc: CA_HANH_CHINH, CA_LINH_HOAT, CA_DEM (Overnight)');

  // ----------------------------------------------------------------------------
  // 6. Leave Types & Holidays
  // ----------------------------------------------------------------------------
  const leaveAnnual = await prisma.leaveType.upsert({
    where: { code: 'ANNUAL' },
    update: { name: 'Nghỉ Phép Năm Hưởng Nguyên Lương', isPaid: true, deductFromAllowance: true },
    create: { code: 'ANNUAL', name: 'Nghỉ Phép Năm Hưởng Nguyên Lương', isPaid: true, deductFromAllowance: true },
  });

  await prisma.leaveType.upsert({
    where: { code: 'SICK' },
    update: { name: 'Nghỉ Ốm Hưởng Trợ Cấp BHXH', isPaid: false, deductFromAllowance: false },
    create: { code: 'SICK', name: 'Nghỉ Ốm Hưởng Trợ Cấp BHXH', isPaid: false, deductFromAllowance: false },
  });

  await prisma.leaveType.upsert({
    where: { code: 'UNPAID' },
    update: { name: 'Nghỉ Không Lương', isPaid: false, deductFromAllowance: false },
    create: { code: 'UNPAID', name: 'Nghỉ Không Lương', isPaid: false, deductFromAllowance: false },
  });
  console.log('✅ 6. Khởi tạo loại ngày nghỉ: ANNUAL, SICK, UNPAID');

  // ----------------------------------------------------------------------------
  // 7. Statutory Payroll Rule 2026
  // ----------------------------------------------------------------------------
  await prisma.payrollRule.upsert({
    where: { code: VIETNAM_STATUTORY_RULE_2026.ruleCode },
    update: {
      name: VIETNAM_STATUTORY_RULE_2026.ruleName,
      isDefault: true,
      isActive: true,
      salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
      overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
      insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
      taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
      deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
      roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
    },
    create: {
      code: VIETNAM_STATUTORY_RULE_2026.ruleCode || 'VN_STATUTORY_2026',
      name: VIETNAM_STATUTORY_RULE_2026.ruleName || 'Quy chuẩn Tiền Lương Việt Nam 2026',
      isDefault: true,
      isActive: true,
      salaryBasisConfig: VIETNAM_STATUTORY_RULE_2026.salaryBasis as any,
      overtimeConfig: VIETNAM_STATUTORY_RULE_2026.overtime as any,
      insuranceConfig: VIETNAM_STATUTORY_RULE_2026.insurance as any,
      taxConfig: VIETNAM_STATUTORY_RULE_2026.tax as any,
      deductionConfig: VIETNAM_STATUTORY_RULE_2026.deduction as any,
      roundingConfig: VIETNAM_STATUTORY_RULE_2026.rounding as any,
      effectiveFrom: new Date('2026-01-01'),
    },
  });
  console.log('✅ 7. Khởi tạo Quy chế tiền lương chuẩn Luật Lao Động 2026 (PIT 7 bậc + BHXH 8%/1.5%/1%)');

  // ----------------------------------------------------------------------------
  // 8. 8 Realistic Fictional Vietnamese Personas (No real PII)
  // ----------------------------------------------------------------------------
  async function seedEmployeeRecord(data: {
    email: string;
    roleCode: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    gender: string;
    dob: string;
    phoneNumber: string;
    departmentId: string;
    positionId: string;
    contractSalary: number;
    contractType: string;
    insuranceSalary: number;
    dependentsCount: number;
    taxCode: string;
    bankAccountNo: string;
    bankName: string;
  }) {
    let user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          isActive: true,
          userRoles: {
            create: { roleId: rolesMap.get(data.roleCode)! },
          },
        },
      });
    }

    const hourlyRate = Math.round(data.contractSalary / (22 * 8));
    const emp = await prisma.employee.upsert({
      where: { employeeCode: data.employeeCode },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        departmentId: data.departmentId,
        positionId: data.positionId,
        contractSalary: new Prisma.Decimal(data.contractSalary),
        insuranceSalary: new Prisma.Decimal(data.insuranceSalary),
        hourlyRate: new Prisma.Decimal(hourlyRate),
        dependentsCount: data.dependentsCount,
        taxCode: data.taxCode,
        bankAccountNo: data.bankAccountNo,
        bankName: data.bankName,
      },
      create: {
        userId: user.id,
        employeeCode: data.employeeCode,
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        dob: new Date(data.dob),
        phoneNumber: data.phoneNumber,
        departmentId: data.departmentId,
        positionId: data.positionId,
        worksiteId: worksite.id,
        contractType: data.contractType,
        contractSalary: new Prisma.Decimal(data.contractSalary),
        hourlyRate: new Prisma.Decimal(hourlyRate),
        insuranceSalary: new Prisma.Decimal(data.insuranceSalary),
        dependentsCount: data.dependentsCount,
        taxCode: data.taxCode,
        bankAccountNo: data.bankAccountNo,
        bankName: data.bankName,
        status: 'ACTIVE',
      },
    });

    return emp;
  }

  // 1. CEO / Admin (Nguyễn Minh Tuấn)
  const empCeo = await seedEmployeeRecord({
    email: 'admin@antigravity.internal',
    roleCode: 'admin',
    employeeCode: 'EMP-0001',
    firstName: 'Minh Tuấn',
    lastName: 'Nguyễn',
    gender: 'MALE',
    dob: '1982-05-14',
    phoneNumber: '0901000001',
    departmentId: deptBod.id,
    positionId: positionsMap.get('CEO')!,
    contractSalary: 65000000,
    contractType: 'INDEFINITE',
    insuranceSalary: 46800000, // Max cap
    dependentsCount: 2,
    taxCode: '8001000001',
    bankAccountNo: '0011004567890',
    bankName: 'Vietcombank',
  });

  // 2. HR Manager (Trần Thị Mai Hương)
  const empHrDir = await seedEmployeeRecord({
    email: 'hr@antigravity.internal',
    roleCode: 'hr',
    employeeCode: 'EMP-0002',
    firstName: 'Mai Hương',
    lastName: 'Trần Thị',
    gender: 'FEMALE',
    dob: '1988-11-20',
    phoneNumber: '0901000002',
    departmentId: deptHr.id,
    positionId: positionsMap.get('HR_DIR')!,
    contractSalary: 38000000,
    contractType: 'INDEFINITE',
    insuranceSalary: 38000000,
    dependentsCount: 1,
    taxCode: '8001000002',
    bankAccountNo: '19034567890123',
    bankName: 'Techcombank',
  });

  // 3. Tech Lead (Lê Hoàng Nam)
  const empTechLead = await seedEmployeeRecord({
    email: 'manager.tech@antigravity.internal',
    roleCode: 'manager',
    employeeCode: 'EMP-0003',
    firstName: 'Hoàng Nam',
    lastName: 'Lê',
    gender: 'MALE',
    dob: '1989-08-15',
    phoneNumber: '0901000003',
    departmentId: deptTech.id,
    positionId: positionsMap.get('TECH_LEAD')!,
    contractSalary: 45000000,
    contractType: 'INDEFINITE',
    insuranceSalary: 45000000,
    dependentsCount: 0,
    taxCode: '8001000003',
    bankAccountNo: '0451000332211',
    bankName: 'Vietcombank',
  });

  // 4. Senior Dev (Phạm Văn An)
  const empSeniorDev = await seedEmployeeRecord({
    email: 'dev.an@antigravity.internal',
    roleCode: 'employee',
    employeeCode: 'EMP-0004',
    firstName: 'Văn An',
    lastName: 'Phạm',
    gender: 'MALE',
    dob: '1993-03-12',
    phoneNumber: '0901000004',
    departmentId: deptTech.id,
    positionId: positionsMap.get('DEV_SR')!,
    contractSalary: 32000000,
    contractType: 'INDEFINITE',
    insuranceSalary: 32000000,
    dependentsCount: 1,
    taxCode: '8001000004',
    bankAccountNo: '0681000889977',
    bankName: 'MB Bank',
  });

  // 5. Mid Dev (Vũ Quốc Cường)
  const empMidDev = await seedEmployeeRecord({
    email: 'dev.cuong@antigravity.internal',
    roleCode: 'employee',
    employeeCode: 'EMP-0005',
    firstName: 'Quốc Cường',
    lastName: 'Vũ',
    gender: 'MALE',
    dob: '1997-09-25',
    phoneNumber: '0901000005',
    departmentId: deptTech.id,
    positionId: positionsMap.get('DEV_MID')!,
    contractSalary: 22000000,
    contractType: 'FIXED_TERM',
    insuranceSalary: 22000000,
    dependentsCount: 0,
    taxCode: '8001000005',
    bankAccountNo: '102876543210',
    bankName: 'VietinBank',
  });

  // 6. Sales Lead (Đặng Minh Châu)
  const empSalesLead = await seedEmployeeRecord({
    email: 'sales.chau@antigravity.internal',
    roleCode: 'employee',
    employeeCode: 'EMP-0006',
    firstName: 'Minh Châu',
    lastName: 'Đặng',
    gender: 'FEMALE',
    dob: '1994-06-18',
    phoneNumber: '0901000006',
    departmentId: deptSales.id,
    positionId: positionsMap.get('SALES_LEAD')!,
    contractSalary: 28000000,
    contractType: 'FIXED_TERM',
    insuranceSalary: 28000000,
    dependentsCount: 0,
    taxCode: '8001000006',
    bankAccountNo: '19022334455667',
    bankName: 'Techcombank',
  });

  // 7. Night Ops Agent (Bùi Quang Huy)
  const empNightOps = await seedEmployeeRecord({
    email: 'ops.huy@antigravity.internal',
    roleCode: 'employee',
    employeeCode: 'EMP-0007',
    firstName: 'Quang Huy',
    lastName: 'Bùi',
    gender: 'MALE',
    dob: '1998-12-04',
    phoneNumber: '0901000007',
    departmentId: deptOps.id,
    positionId: positionsMap.get('OPS_NIGHT')!,
    contractSalary: 18000000,
    contractType: 'FIXED_TERM',
    insuranceSalary: 18000000,
    dependentsCount: 0,
    taxCode: '8001000007',
    bankAccountNo: '0341005566778',
    bankName: 'Vietcombank',
  });

  // 8. C&B Officer (Hoàng Ngọc Ánh)
  const empCb = await seedEmployeeRecord({
    email: 'hr.anh@antigravity.internal',
    roleCode: 'employee',
    employeeCode: 'EMP-0008',
    firstName: 'Ngọc Ánh',
    lastName: 'Hoàng',
    gender: 'FEMALE',
    dob: '2001-04-10',
    phoneNumber: '0901000008',
    departmentId: deptHr.id,
    positionId: positionsMap.get('HR_CB')!,
    contractSalary: 16000000,
    contractType: 'PROBATION',
    insuranceSalary: 16000000,
    dependentsCount: 0,
    taxCode: '8001000008',
    bankAccountNo: '0881000998877',
    bankName: 'ACB',
  });

  // Assign department managers
  await prisma.department.update({ where: { id: deptBod.id }, data: { managerId: empCeo.id } });
  await prisma.department.update({ where: { id: deptHr.id }, data: { managerId: empHrDir.id } });
  await prisma.department.update({ where: { id: deptTech.id }, data: { managerId: empTechLead.id } });
  await prisma.department.update({ where: { id: deptSales.id }, data: { managerId: empSalesLead.id } });
  await prisma.department.update({ where: { id: deptOps.id }, data: { managerId: empCeo.id } });
  console.log('✅ 8. Khởi tạo 8 nhân sự mẫu & bổ nhiệm Trưởng phòng phụ trách');

  // ----------------------------------------------------------------------------
  // 9. Schedules & Attendance History (14 Days)
  // ----------------------------------------------------------------------------
  const today = new Date();
  const simulatedEmployees = [
    { emp: empCeo, shift: shiftFixed, trait: 'NORMAL' },
    { emp: empHrDir, shift: shiftFixed, trait: 'NORMAL' },
    { emp: empTechLead, shift: shiftFlex, trait: 'NORMAL' },
    { emp: empSeniorDev, shift: shiftFlex, trait: 'OVERTIME' },
    { emp: empMidDev, shift: shiftFlex, trait: 'LATE_EARLY' },
    { emp: empSalesLead, shift: shiftFixed, trait: 'NORMAL' },
    { emp: empNightOps, shift: shiftNight, trait: 'OVERNIGHT_EXCEPTION' },
    { emp: empCb, shift: shiftFixed, trait: 'LEAVE_ABSENCE' },
  ];

  for (let i = 13; i >= 0; i--) {
    const workDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i, 0, 0, 0, 0));
    const dayOfWeek = workDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0) continue; // Skip Sunday

    for (const { emp, shift, trait } of simulatedEmployees) {
      // 1. Assign schedule
      const schedule = await prisma.employeeSchedule.upsert({
        where: {
          employeeId_workDate: {
            employeeId: emp.id,
            workDate,
          },
        },
        update: { shiftId: shift.id },
        create: {
          employeeId: emp.id,
          shiftId: shift.id,
          workDate,
          status: 'SCHEDULED',
        },
      });

      // 2. Generate Attendance according to Trait
      if (trait === 'LEAVE_ABSENCE' && (i === 3 || i === 4)) {
        // Leave days, skip check-in record
        continue;
      }

      let checkInTime: Date | null = null;
      let checkOutTime: Date | null = null;
      let lateMinutes = 0;
      let earlyMinutes = 0;
      let otHours = new Prisma.Decimal(0);
      let actualWorkHours = new Prisma.Decimal(8.0);
      let status = 'PRESENT';

      if (shift.isOvernight) {
        // Night shift: 22:00 -> 06:00
        checkInTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 22, 0, 0));
        if (trait === 'OVERNIGHT_EXCEPTION' && i === 2) {
          // Missing checkout on day 2!
          checkOutTime = null;
          status = 'PENDING';
          actualWorkHours = new Prisma.Decimal(0);
        } else {
          checkOutTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate() + 1, 6, 0, 0));
          actualWorkHours = new Prisma.Decimal(7.0);
        }
      } else if (trait === 'LATE_EARLY' && (i === 1 || i === 5)) {
        // Late 35 mins + Early 45 mins
        checkInTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 8, 35, 0));
        checkOutTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 16, 15, 0));
        lateMinutes = 35;
        earlyMinutes = 45;
        actualWorkHours = new Prisma.Decimal(6.67);
        status = 'LATE';
      } else if (trait === 'OVERTIME' && (i === 2 || i === 6)) {
        // Normal check-in + 2.5h overtime
        checkInTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 8, 0, 0));
        checkOutTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 19, 30, 0));
        otHours = new Prisma.Decimal(2.5);
        actualWorkHours = new Prisma.Decimal(10.5);
        status = 'PRESENT';
      } else {
        // Normal 8h
        checkInTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 8, 0, 0));
        checkOutTime = new Date(Date.UTC(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 17, 0, 0));
        actualWorkHours = new Prisma.Decimal(8.0);
        status = 'PRESENT';
      }

      await prisma.attendance.upsert({
        where: {
          employeeId_workDate: {
            employeeId: emp.id,
            workDate,
          },
        },
        update: {
          scheduleId: schedule.id,
          checkInTime,
          checkOutTime,
          checkInMethod: 'QR',
          checkOutMethod: checkOutTime ? 'QR' : null,
          lateMinutes,
          earlyMinutes,
          actualWorkHours,
          otHours,
          status,
        },
        create: {
          scheduleId: schedule.id,
          employeeId: emp.id,
          workDate,
          checkInTime,
          checkOutTime,
          checkInMethod: 'QR',
          checkOutMethod: checkOutTime ? 'QR' : null,
          lateMinutes,
          earlyMinutes,
          actualWorkHours,
          otHours,
          status,
        },
      });
    }
  }
  console.log('✅ 9. Khởi tạo lịch phân ca (Schedule) & 14 ngày dữ liệu chấm công thực tế (Đúng giờ, Đi muộn, Về sớm, OT, Ca đêm)');

  // ----------------------------------------------------------------------------
  // 10. Exception Handling: Missing Checkout & Attendance Adjustment
  // ----------------------------------------------------------------------------
  const missingDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 2, 0, 0, 0, 0));
  const missingAtt = await prisma.attendance.findUnique({
    where: {
      employeeId_workDate: {
        employeeId: empNightOps.id,
        workDate: missingDate,
      },
    },
  });

  if (missingAtt) {
    await prisma.attendanceAdjustment.create({
      data: {
        attendanceId: missingAtt.id,
        employeeId: empNightOps.id,
        workDate: missingDate,
        correctionType: 'FULL_CORRECTION',
        requestedCheckIn: new Date(Date.UTC(missingDate.getUTCFullYear(), missingDate.getUTCMonth(), missingDate.getUTCDate(), 22, 0, 0)),
        requestedCheckOut: new Date(Date.UTC(missingDate.getUTCFullYear(), missingDate.getUTCMonth(), missingDate.getUTCDate() + 1, 6, 0, 0)),
        reason: 'Quên bấm máy quét QR sau khi bàn giao ca trực máy chủ lúc 06:00 sáng',
        evidenceUrl: '/uploads/evidences/log_turnover_ops_02.png',
        status: 'APPROVED',
        approverId: empCeo.id,
        approvalNotes: 'Đã đối soát camera và sổ bàn giao ca trực. Phê duyệt bổ sung 7.0h công đêm.',
        overrideCheckIn: new Date(Date.UTC(missingDate.getUTCFullYear(), missingDate.getUTCMonth(), missingDate.getUTCDate(), 22, 0, 0)),
        overrideCheckOut: new Date(Date.UTC(missingDate.getUTCFullYear(), missingDate.getUTCMonth(), missingDate.getUTCDate() + 1, 6, 0, 0)),
        processedAt: new Date(),
      },
    });

    // Update the attendance record with approved hours
    await prisma.attendance.update({
      where: { id: missingAtt.id },
      data: {
        checkOutTime: new Date(Date.UTC(missingDate.getUTCFullYear(), missingDate.getUTCMonth(), missingDate.getUTCDate() + 1, 6, 0, 0)),
        checkOutMethod: 'MANUAL_OVERRIDE',
        actualWorkHours: new Prisma.Decimal(7.0),
        status: 'PRESENT',
        notes: 'Đã giải trình và phê duyệt bổ sung giờ check-out ca đêm',
      },
    });
  }
  console.log('✅ 10. Khởi tạo & xử lý hoàn tất quy trình Giải trình công (Attendance Adjustment Workflow)');

  // ----------------------------------------------------------------------------
  // 11. Leave Requests
  // ----------------------------------------------------------------------------
  const leaveStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 4));
  const leaveEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 3));

  await prisma.leaveRequest.create({
    data: {
      employeeId: empCb.id,
      leaveTypeId: leaveAnnual.id,
      requestType: 'LEAVE',
      startDate: leaveStart,
      endDate: leaveEnd,
      durationDays: new Prisma.Decimal(2.0),
      reason: 'Nghỉ giải quyết việc hiếu hỉ gia đình',
      status: 'APPROVED',
      approverId: empHrDir.id,
      approvalNotes: 'Đồng ý duyệt 2 ngày phép năm có hưởng lương.',
      approvedAt: new Date(),
    },
  });
  console.log('✅ 11. Khởi tạo đơn xin nghỉ phép năm 2 ngày & phê duyệt thành công');

  // ----------------------------------------------------------------------------
  // 12. KPIs & Results
  // ----------------------------------------------------------------------------
  const currentPeriod = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;

  const kpiVelocity = await prisma.kpi.upsert({
    where: { code: 'TECH_VELOCITY' },
    update: {},
    create: {
      code: 'TECH_VELOCITY',
      title: 'Tốc độ hoàn thành Sprint (Sprint Velocity)',
      description: 'Số điểm công việc (Story Points) hoàn thành đúng thời hạn trong tháng.',
      metricType: 'NUMERIC',
      targetValue: new Prisma.Decimal(40),
      unit: 'POINTS',
      period: 'MONTHLY',
      departmentId: deptTech.id,
      baseBonusAmount: new Prisma.Decimal(2000000),
      weight: new Prisma.Decimal(100),
      status: 'ACTIVE',
    },
  });

  const kpiSales = await prisma.kpi.upsert({
    where: { code: 'SALES_REVENUE' },
    update: {},
    create: {
      code: 'SALES_REVENUE',
      title: 'Chỉ tiêu Doanh thu Hợp đồng B2B',
      description: 'Tổng giá trị hợp đồng phần mềm & dịch vụ ký mới trong tháng.',
      metricType: 'NUMERIC',
      targetValue: new Prisma.Decimal(500000000),
      unit: 'VND',
      period: 'MONTHLY',
      departmentId: deptSales.id,
      baseBonusAmount: new Prisma.Decimal(3000000),
      weight: new Prisma.Decimal(100),
      status: 'ACTIVE',
    },
  });

  // Evaluate Dev An: 95% completion
  await prisma.employeeKpiResult.upsert({
    where: {
      employeeId_kpiId_period: {
        employeeId: empSeniorDev.id,
        kpiId: kpiVelocity.id,
        period: currentPeriod,
      },
    },
    update: {},
    create: {
      employeeId: empSeniorDev.id,
      kpiId: kpiVelocity.id,
      period: currentPeriod,
      targetValue: new Prisma.Decimal(40),
      actualValue: new Prisma.Decimal(38),
      completionRate: new Prisma.Decimal(95),
      score: new Prisma.Decimal(95),
      weightedScore: new Prisma.Decimal(95),
      bonusAmount: new Prisma.Decimal(1900000),
      managerComment: 'Hoàn thành tốt các tính năng nòng cốt của hệ thống HRMS.',
      status: 'APPROVED',
      evaluatorId: empTechLead.id,
      evaluatedAt: new Date(),
    },
  });

  // Evaluate Sales Chau: 115% completion
  await prisma.employeeKpiResult.upsert({
    where: {
      employeeId_kpiId_period: {
        employeeId: empSalesLead.id,
        kpiId: kpiSales.id,
        period: currentPeriod,
      },
    },
    update: {},
    create: {
      employeeId: empSalesLead.id,
      kpiId: kpiSales.id,
      period: currentPeriod,
      targetValue: new Prisma.Decimal(500000000),
      actualValue: new Prisma.Decimal(575000000),
      completionRate: new Prisma.Decimal(115),
      score: new Prisma.Decimal(115),
      weightedScore: new Prisma.Decimal(115),
      bonusAmount: new Prisma.Decimal(3500000),
      managerComment: 'Vượt 15% chỉ tiêu doanh số tháng nhờ ký kết 2 hợp đồng chiến lược.',
      status: 'APPROVED',
      evaluatorId: empCeo.id,
      evaluatedAt: new Date(),
    },
  });
  console.log('✅ 12. Khởi tạo mục tiêu KPI & phê duyệt kết quả đánh giá (Đạt 95% & Vượt 115%)');

  // ----------------------------------------------------------------------------
  // 13. Bonuses & Disciplinary Penalties
  // ----------------------------------------------------------------------------
  await prisma.employeeBonusPenalty.create({
    data: {
      employeeId: empSalesLead.id,
      type: 'BONUS',
      category: 'PROJECT',
      amount: new Prisma.Decimal(5000000),
      effectiveDate: new Date(),
      period: currentPeriod,
      reason: 'Thưởng nóng thành tích ký kết hợp đồng triển khai giải pháp ERP tập đoàn',
      status: 'APPROVED',
      approvedBy: empCeo.id,
      approvedAt: new Date(),
      approvalNotes: 'Ban Giám Đốc phê duyệt thưởng nóng.',
    },
  });

  await prisma.employeeBonusPenalty.create({
    data: {
      employeeId: empCb.id,
      type: 'PENALTY',
      category: 'OTHER',
      amount: new Prisma.Decimal(200000),
      effectiveDate: new Date(),
      period: currentPeriod,
      reason: 'Vi phạm quy định bảo mật: Quên khóa màn hình máy tính làm việc khi ra ngoài',
      status: 'APPROVED',
      approvedBy: empHrDir.id,
      approvedAt: new Date(),
      approvalNotes: 'Phạt cảnh cáo theo quy chế an toàn thông tin nội bộ.',
    },
  });
  console.log('✅ 13. Khởi tạo Thưởng dự án (+5.000.000 ₫) & Phạt kỷ luật bảo mật (-200.000 ₫)');

  // ----------------------------------------------------------------------------
  // 14. Monthly Payroll Period & Calculation Engine
  // ----------------------------------------------------------------------------
  const lastMonth = today.getUTCMonth() === 0 ? 12 : today.getUTCMonth();
  const lastMonthYear = today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
  const payPeriodCode = `PAY-${lastMonthYear}-${String(lastMonth).padStart(2, '0')}`;

  const rule = await prisma.payrollRule.findUnique({
    where: { code: VIETNAM_STATUTORY_RULE_2026.ruleCode },
  });

  const payrollPeriod = await prisma.payrollPeriod.upsert({
    where: { code: payPeriodCode },
    update: { status: 'APPROVED' },
    create: {
      code: payPeriodCode,
      name: `Bảng Lương Toàn Thể Tháng ${String(lastMonth).padStart(2, '0')}/${lastMonthYear}`,
      startDate: new Date(Date.UTC(lastMonthYear, lastMonth - 1, 1)),
      endDate: new Date(Date.UTC(lastMonthYear, lastMonth, 0)),
      standardWorkDays: 22,
      payrollRuleId: rule?.id,
      status: 'APPROVED',
      totalGrossPayout: new Prisma.Decimal(279900000),
      totalNetPayout: new Prisma.Decimal(238450000),
    },
  });

  // Payroll calculation rows for all 8 employees
  const payrollRows = [
    {
      emp: empCeo,
      contractSalary: 65000000,
      actualDays: 22,
      paidLeaveDays: 0,
      otPay: 0,
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 0,
      gross: 65000000,
      // Insurance cap 46.8M -> BHXH 3,744k, BHYT 702k, BHTN 468k = 4,914k
      si: 3744000,
      hi: 702000,
      ui: 468000,
      taxable: 60086000,
      // Personal relief 11M, 2 dependents 8.8M -> Assessable: 40,286,000 -> Bracket 5
      personalRelief: 11000000,
      depRelief: 8800000,
      pit: 6821500,
      net: 53264500,
    },
    {
      emp: empHrDir,
      contractSalary: 38000000,
      actualDays: 22,
      paidLeaveDays: 0,
      otPay: 0,
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 0,
      gross: 38000000,
      si: 3040000,
      hi: 570000,
      ui: 380000,
      taxable: 34010000,
      personalRelief: 11000000,
      depRelief: 4400000,
      pit: 2372000,
      net: 31638000,
    },
    {
      emp: empTechLead,
      contractSalary: 45000000,
      actualDays: 22,
      paidLeaveDays: 0,
      otPay: 0,
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 0,
      gross: 45000000,
      si: 3600000,
      hi: 675000,
      ui: 450000,
      taxable: 40275000,
      personalRelief: 11000000,
      depRelief: 0,
      pit: 4405000,
      net: 35870000,
    },
    {
      emp: empSeniorDev,
      contractSalary: 32000000,
      actualDays: 22,
      paidLeaveDays: 0,
      otPay: 1364000, // 5h OT
      kpiBonus: 1900000,
      otherBonuses: 0,
      penalties: 0,
      gross: 35264000,
      si: 2560000,
      hi: 480000,
      ui: 320000,
      taxable: 31904000,
      personalRelief: 11000000,
      depRelief: 4400000,
      pit: 1970800,
      net: 29933200,
    },
    {
      emp: empMidDev,
      contractSalary: 22000000,
      actualDays: 21.5,
      paidLeaveDays: 0,
      otPay: 0,
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 0,
      gross: 21500000,
      si: 1760000,
      hi: 330000,
      ui: 220000,
      taxable: 19190000,
      personalRelief: 11000000,
      depRelief: 0,
      pit: 569000,
      net: 18621000,
    },
    {
      emp: empSalesLead,
      contractSalary: 28000000,
      actualDays: 22,
      paidLeaveDays: 0,
      otPay: 0,
      kpiBonus: 3500000,
      otherBonuses: 5000000, // Project bonus
      penalties: 0,
      gross: 36500000,
      si: 2240000,
      hi: 420000,
      ui: 280000,
      taxable: 33560000,
      personalRelief: 11000000,
      depRelief: 0,
      pit: 3062000,
      net: 30498000,
    },
    {
      emp: empNightOps,
      contractSalary: 18000000,
      actualDays: 22,
      paidLeaveDays: 0,
      otPay: 1840000, // Night allowance
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 0,
      gross: 19840000,
      si: 1440000,
      hi: 270000,
      ui: 180000,
      taxable: 17950000,
      personalRelief: 11000000,
      depRelief: 0,
      pit: 445000,
      net: 17505000,
    },
    {
      emp: empCb,
      contractSalary: 16000000,
      actualDays: 20,
      paidLeaveDays: 2,
      otPay: 0,
      kpiBonus: 0,
      otherBonuses: 0,
      penalties: 200000,
      gross: 16000000,
      si: 1280000,
      hi: 240000,
      ui: 160000,
      taxable: 14320000,
      personalRelief: 11000000,
      depRelief: 0,
      pit: 166000,
      net: 13954000,
    },
  ];

  for (const row of payrollRows) {
    await prisma.payroll.upsert({
      where: {
        periodId_employeeId: {
          periodId: payrollPeriod.id,
          employeeId: row.emp.id,
        },
      },
      update: {
        contractSalary: new Prisma.Decimal(row.contractSalary),
        actualWorkDays: new Prisma.Decimal(row.actualDays),
        paidLeaveDays: new Prisma.Decimal(row.paidLeaveDays),
        proratedSalary: new Prisma.Decimal(row.contractSalary),
        otPay: new Prisma.Decimal(row.otPay),
        kpiBonus: new Prisma.Decimal(row.kpiBonus),
        otherBonuses: new Prisma.Decimal(row.otherBonuses),
        totalPenalties: new Prisma.Decimal(row.penalties),
        grossIncome: new Prisma.Decimal(row.gross),
        socialInsurance: new Prisma.Decimal(row.si),
        healthInsurance: new Prisma.Decimal(row.hi),
        unemploymentInsurance: new Prisma.Decimal(row.ui),
        taxableIncome: new Prisma.Decimal(row.taxable),
        personalRelief: new Prisma.Decimal(row.personalRelief),
        dependentsRelief: new Prisma.Decimal(row.depRelief),
        assessableIncome: new Prisma.Decimal(Math.max(0, row.taxable - row.personalRelief - row.depRelief)),
        pitTax: new Prisma.Decimal(row.pit),
        netSalary: new Prisma.Decimal(row.net),
        paymentStatus: 'PAID',
      },
      create: {
        periodId: payrollPeriod.id,
        employeeId: row.emp.id,
        contractSalary: new Prisma.Decimal(row.contractSalary),
        actualWorkDays: new Prisma.Decimal(row.actualDays),
        paidLeaveDays: new Prisma.Decimal(row.paidLeaveDays),
        proratedSalary: new Prisma.Decimal(row.contractSalary),
        otPay: new Prisma.Decimal(row.otPay),
        kpiBonus: new Prisma.Decimal(row.kpiBonus),
        otherBonuses: new Prisma.Decimal(row.otherBonuses),
        totalPenalties: new Prisma.Decimal(row.penalties),
        grossIncome: new Prisma.Decimal(row.gross),
        socialInsurance: new Prisma.Decimal(row.si),
        healthInsurance: new Prisma.Decimal(row.hi),
        unemploymentInsurance: new Prisma.Decimal(row.ui),
        taxableIncome: new Prisma.Decimal(row.taxable),
        personalRelief: new Prisma.Decimal(row.personalRelief),
        dependentsRelief: new Prisma.Decimal(row.depRelief),
        assessableIncome: new Prisma.Decimal(Math.max(0, row.taxable - row.personalRelief - row.depRelief)),
        pitTax: new Prisma.Decimal(row.pit),
        netSalary: new Prisma.Decimal(row.net),
        paymentStatus: 'PAID',
      },
    });
  }
  console.log('✅ 14. Khởi tạo kỳ tính lương chuẩn Luật Lao Động 2026 & bảng lương chi tiết cho 8 nhân sự');

  // ----------------------------------------------------------------------------
  // 15. Broadcast Notifications
  // ----------------------------------------------------------------------------
  const allUsers = await prisma.user.findMany();
  for (const u of allUsers) {
    await prisma.notification.create({
      data: {
        userId: u.id,
        title: 'Chào mừng đến với Antigravity HRMS Enterprise',
        message: 'Hệ thống Quản trị Doanh nghiệp & Chấm công Đa ca thế hệ mới đã được cấu hình hoàn thiện cho Công ty CP Công nghệ Tân Phong.',
        type: 'SYSTEM',
        actionUrl: '/dashboard',
        isRead: false,
      },
    });
  }
  console.log('✅ 15. Phát thông báo hệ thống tự động đến toàn bộ 8 tài khoản');

  console.log('\n🎉 ==============================================================================');
  console.log('🎉 DOANH NGHIỆP GIẢ LẬP ĐÃ SẴN SÀNG ĐỂ ĐĂNG NHẬP VÀ VẬN HÀNH:');
  console.log('------------------------------------------------------------------------------');
  console.log('Mật khẩu chung cho tất cả tài khoản: Antigravity@2026');
  console.log('1. CEO / Admin:      admin@antigravity.internal         (Nguyễn Minh Tuấn — Toàn quyền)');
  console.log('2. Trưởng Phòng HR:  hr@antigravity.internal            (Trần Thị Mai Hương — Duyệt phép & C&B)');
  console.log('3. Trưởng Phòng Tech:manager.tech@antigravity.internal  (Lê Hoàng Nam — Quản lý Tech & KPI)');
  console.log('4. Senior Developer: dev.an@antigravity.internal        (Phạm Văn An — Làm thêm giờ OT)');
  console.log('5. Mid Developer:    dev.cuong@antigravity.internal     (Vũ Quốc Cường — Đi muộn & Về sớm)');
  console.log('6. Trưởng Nhóm Sales:sales.chau@antigravity.internal     (Đặng Minh Châu — Vượt KPI & Thưởng)');
  console.log('7. Vận Hành Ca Đêm:  ops.huy@antigravity.internal       (Bùi Quang Huy — Ca đêm & Giải trình)');
  console.log('8. Chuyên Viên C&B:  hr.anh@antigravity.internal        (Hoàng Ngọc Ánh — Nghỉ phép & Phạt)');
  console.log('==============================================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi nạp dữ liệu mẫu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
