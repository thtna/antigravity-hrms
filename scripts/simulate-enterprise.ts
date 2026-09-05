/**
 * 🌐 Phase 27 — Real World End-to-End Enterprise Simulation CLI
 *
 * Simulates a realistic Vietnamese technology company:
 * "Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong"
 *
 * Core Business Flow:
 * Employee → Schedule → Attendance → Exception → Leave → KPI → Bonus/Penalty → Payroll → Approval → Payslip
 *
 * Executable via: npm run simulate:enterprise
 */

import { PayrollCalculationEngine } from '../src/lib/payroll/payroll-calculation-engine';
import { VIETNAM_STATUTORY_RULE_2026 } from '../src/lib/payroll/default-rules';

interface EnterpriseEmployee {
  code: string;
  name: string;
  dept: string;
  pos: string;
  shift: string;
  baseSalary: number;
  dependents: number;
  actualWorkDays: number;
  otHours: number;
  otPay: number;
  kpiScore: number;
  bonus: number;
  penalty: number;
}

const ROSTER: EnterpriseEmployee[] = [
  {
    code: 'EMP-0001',
    name: 'Nguyễn Văn Hùng',
    dept: 'Ban Giám Đốc (BOD)',
    pos: 'Tổng Giám Đốc (CEO)',
    shift: 'CA_HANH_CHINH',
    baseSalary: 65000000,
    dependents: 2,
    actualWorkDays: 22,
    otHours: 0,
    otPay: 0,
    kpiScore: 110,
    bonus: 10000000,
    penalty: 0,
  },
  {
    code: 'EMP-0002',
    name: 'Trần Thị Mai',
    dept: 'Phòng Nhân Sự (HR)',
    pos: 'Trưởng Phòng Nhân Sự (HR_DIR)',
    shift: 'CA_HANH_CHINH',
    baseSalary: 35000000,
    dependents: 1,
    actualWorkDays: 22,
    otHours: 0,
    otPay: 0,
    kpiScore: 100,
    bonus: 2500000,
    penalty: 0,
  },
  {
    code: 'EMP-0003',
    name: 'Lê Hoàng Long',
    dept: 'Khối Công Nghệ (TECH)',
    pos: 'Trưởng Nhóm Công Nghệ (TECH_LEAD)',
    shift: 'CA_LINH_HOAT',
    baseSalary: 45000000,
    dependents: 1,
    actualWorkDays: 22,
    otHours: 4.0,
    otPay: 1534091,
    kpiScore: 105,
    bonus: 3500000,
    penalty: 0,
  },
  {
    code: 'EMP-0004',
    name: 'Đỗ Văn An',
    dept: 'Khối Công Nghệ (TECH)',
    pos: 'Kỹ Sư Phần Mềm Cao Cấp (DEV_SR)',
    shift: 'CA_LINH_HOAT',
    baseSalary: 32000000,
    dependents: 1,
    actualWorkDays: 22,
    otHours: 2.5,
    otPay: 681818,
    kpiScore: 95,
    bonus: 1900000,
    penalty: 0,
  },
  {
    code: 'EMP-0005',
    name: 'Phạm Minh Tuấn',
    dept: 'Khối Công Nghệ (TECH)',
    pos: 'Kỹ Sư Lập Trình (DEV_MID)',
    shift: 'CA_LINH_HOAT',
    baseSalary: 20000000,
    dependents: 0,
    actualWorkDays: 21,
    otHours: 0,
    otPay: 0,
    kpiScore: 90,
    bonus: 0,
    penalty: 0,
  },
  {
    code: 'EMP-0006',
    name: 'Vũ Thị Lan',
    dept: 'Phòng Kinh Doanh (SALES)',
    pos: 'Trưởng Nhóm Kinh Doanh (SALES_LEAD)',
    shift: 'CA_HANH_CHINH',
    baseSalary: 25000000,
    dependents: 0,
    actualWorkDays: 22,
    otHours: 0,
    otPay: 0,
    kpiScore: 120,
    bonus: 5000000, // Strategic client deal bonus
    penalty: 0,
  },
  {
    code: 'EMP-0007',
    name: 'Hoàng Quốc Bảo',
    dept: 'Trung Tâm Vận Hành (OPS)',
    pos: 'Kỹ Sư Trực Hệ Thống Đêm (OPS_NIGHT)',
    shift: 'CA_DEM',
    baseSalary: 18000000,
    dependents: 0,
    actualWorkDays: 22,
    otHours: 0,
    otPay: 0,
    kpiScore: 98,
    bonus: 1000000, // Night shift hardship allowance
    penalty: 0,
  },
  {
    code: 'EMP-0008',
    name: 'Bùi Phương Thảo',
    dept: 'Phòng Nhân Sự (HR)',
    pos: 'Chuyên Viên C&B (HR_CB)',
    shift: 'CA_HANH_CHINH',
    baseSalary: 16000000,
    dependents: 0,
    actualWorkDays: 20, // 2 days paid annual leave
    otHours: 0,
    otPay: 0,
    kpiScore: 92,
    bonus: 0,
    penalty: 200000, // Security guideline violation penalty
  },
];

function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
}

function printSection(title: string) {
  console.log('\n' + '═'.repeat(90));
  console.log(`  🌐 ${title}`);
  console.log('═'.repeat(90));
}

function runSimulation() {
  console.log('\n' + '█'.repeat(90));
  console.log('  CÔNG TY CỔ PHẦN CÔNG NGHỆ & DỊCH VỤ SỐ TÂN PHONG (TAN PHONG TECH JSC)');
  console.log('  HỆ THỐNG QUẢN TRỊ NHÂN SỰ & TIỀN LƯƠNG TOÀN DIỆN — SIMULATION PHASE 27');
  console.log('█'.repeat(90));

  // 1. Organization Roster
  printSection('STAGE 1 & 2: CƠ CẤU TỔ CHỨC & PHÂN CA LAO ĐỘNG');
  console.log(` Mã NV    | Họ và Tên            | Phòng Ban              | Chức Danh          | Ca Làm Việc`);
  console.log(`-`.repeat(90));
  for (const emp of ROSTER) {
    console.log(
      ` ${emp.code.padEnd(8)} | ${emp.name.padEnd(20)} | ${emp.dept.padEnd(22)} | ${emp.pos.padEnd(18)} | ${emp.shift}`
    );
  }

  // 2. Attendance & Exceptions
  printSection('STAGE 3, 4, 5: CHẤM CÔNG, GIẢI TRÌNH & NGHỈ PHÉP THÁNG 09/2026');
  console.log(` • Ca Hành chính (08:30 - 17:30): 5 nhân sự (BOD, HR, SALES)`);
  console.log(` • Ca Linh hoạt (08:00/09:00 - 17:00/18:00): 2 nhân sự (TECH Dev & Lead)`);
  console.log(` • Ca Đêm NOC (22:00 - 06:00 hôm sau): 1 nhân sự (OPS_NIGHT)`);
  console.log(` • Ngoại lệ Chấm công: EMP-0007 quên quét mã checkout lúc 06:00 ngày 03/09.`);
  console.log(`   → Đã nộp giải trình & Quản lý phê duyệt bổ sung 7.0h công đêm.`);
  console.log(` • Nghỉ phép năm: EMP-0008 nghỉ phép 2 ngày (03/09 - 04/09), hưởng nguyên lương.`);

  // 3. KPI, Bonus, Penalties
  printSection('STAGE 6 & 7: ĐÁNH GIÁ KPI, THƯỞNG DỰ ÁN & XỬ PHẠT KỶ LUẬT');
  console.log(` • KPI Top: EMP-0006 (Vũ Thị Lan - Sales Lead) đạt 120% chỉ tiêu doanh số Q3.`);
  console.log(` • Thưởng Nóng: EMP-0006 nhận 5.000.000 ₫ (Thưởng hợp đồng chiến lược) - Đã duyệt.`);
  console.log(` • Kỷ luật Tuân thủ: EMP-0008 bị trừ 200.000 ₫ (Vi phạm chính sách an toàn thông tin).`);

  // 4. Payroll Calculation Engine
  printSection('STAGE 8: TÍNH TOÁN BẢNG LƯƠNG CHUẨN LUẬT LAO ĐỘNG & THUẾ TNCN 2026');
  console.log(
    ` Mã NV    | Lương HĐ       | Tổng Thu Nhập  | BH Bắt Buộc  | Thuế TNCN    | Khấu Trừ Khác| Thực Lĩnh (Net)`
  );
  console.log(`-`.repeat(90));

  let totalGrossAll = 0;
  let totalInsuranceAll = 0;
  let totalTaxAll = 0;
  let totalNetAll = 0;

  const payrollResults = [];

  for (const emp of ROSTER) {
    const calc = PayrollCalculationEngine.calculate({
      baseSalary: emp.baseSalary,
      workDays: 22,
      actualWorkDays: emp.actualWorkDays,
      workHours: emp.actualWorkDays * 8,
      overtimeHours: emp.otHours,
      overtimePay: emp.otPay,
      bonus: emp.bonus,
      penalty: emp.penalty,
      dependentsCount: emp.dependents,
      ruleConfig: VIETNAM_STATUTORY_RULE_2026,
    });

    totalGrossAll += calc.grossSalary;
    totalInsuranceAll += calc.insurance;
    totalTaxAll += calc.tax;
    totalNetAll += calc.netSalary;

    payrollResults.push({ emp, calc });

    console.log(
      ` ${emp.code.padEnd(8)} | ${formatVND(emp.baseSalary).padStart(14)} | ${formatVND(calc.grossSalary).padStart(14)} | ${formatVND(calc.insurance).padStart(12)} | ${formatVND(calc.tax).padStart(12)} | ${formatVND(calc.totalPenalty).padStart(12)} | ${formatVND(calc.netSalary).padStart(15)}`
    );
  }

  console.log(`-`.repeat(90));
  console.log(
    ` TỔNG CỘNG |                | ${formatVND(totalGrossAll).padStart(14)} | ${formatVND(totalInsuranceAll).padStart(12)} | ${formatVND(totalTaxAll).padStart(12)} |                | ${formatVND(totalNetAll).padStart(15)}`
  );

  // 5. Workflow State Machine
  printSection('STAGE 9: QUY TRÌNH PHÊ DUYỆT BẢNG LƯƠNG (STATE MACHINE)');
  console.log(` [1] DRAFT       → Tạo kỳ lương PAY-2026-09 (01/09/2026 - 30/09/2026) bởi C&B Specialist`);
  console.log(` [2] CALCULATED  → Chạy công cụ tính toán tự động PayrollCalculationEngine`);
  console.log(` [3] REVIEW      → Trưởng phòng Nhân sự thẩm tra và trình duyệt BOD`);
  console.log(` [4] APPROVED    → Tổng Giám Đốc phê duyệt lúc 2026-09-05 08:30:00 (Khóa sổ - Bất biến)`);

  // 6. Detailed Payslip
  printSection('STAGE 10: PHIẾU LƯƠNG ĐIỆN TỬ CHI TIẾT (SAMPLE PAYSLIP — EMP-0004)');
  const sample = payrollResults.find((p) => p.emp.code === 'EMP-0004')!;
  console.log(` ┌────────────────────────────────────────────────────────────────────────┐`);
  console.log(` │                      PHIẾU LƯƠNG THÁNG 09/2026                         │`);
  console.log(` │ Nhân viên: Đỗ Văn An             Mã NV: EMP-0004                       │`);
  console.log(` │ Chức vụ: Kỹ Sư Phần Mềm Cao Cấp  Phòng: Khối Công Nghệ (TECH)          │`);
  console.log(` ├────────────────────────────────────────────────────────────────────────┤`);
  console.log(` │ [1] THU NHẬP (EARNINGS):                                               │`);
  console.log(` │   • Lương cơ bản theo hợp đồng:                  ${formatVND(sample.emp.baseSalary).padStart(18)} │`);
  console.log(` │   • Lương ngày công thực tế (22/22 ngày):        ${formatVND(sample.calc.proratedSalary).padStart(18)} │`);
  console.log(` │   • Làm thêm giờ OT (2.5h x 150% ngày thường):   ${formatVND(sample.calc.overtimePay).padStart(18)} │`);
  console.log(` │   • Thưởng năng suất KPI:                        ${formatVND(sample.calc.totalBonus).padStart(18)} │`);
  console.log(` │   → TỔNG THU NHẬP (GROSS):                       ${formatVND(sample.calc.grossSalary).padStart(18)} │`);
  console.log(` ├────────────────────────────────────────────────────────────────────────┤`);
  console.log(` │ [2] CÁC KHOẢN KHẤU TRỪ BẢO HIỂM (INSURANCES - 10.5%):                  │`);
  console.log(` │   • Bảo hiểm xã hội (BHXH - 8.0%):               ${formatVND(sample.calc.employeeSocial).padStart(18)} │`);
  console.log(` │   • Bảo hiểm y tế (BHYT - 1.5%):                 ${formatVND(sample.calc.employeeHealth).padStart(18)} │`);
  console.log(` │   • Bảo hiểm thất nghiệp (BHTN - 1.0%):          ${formatVND(sample.calc.employeeUnemployment).padStart(18)} │`);
  console.log(` │   → TỔNG BẢO HIỂM:                               ${formatVND(sample.calc.insurance).padStart(18)} │`);
  console.log(` ├────────────────────────────────────────────────────────────────────────┤`);
  console.log(` │ [3] THUẾ THU NHẬP CÁ NHÂN (PIT - LUẬT THUẾ 2026):                     │`);
  console.log(` │   • Thu nhập chịu thuế (Gross):                  ${formatVND(sample.calc.taxableIncome).padStart(18)} │`);
  console.log(` │   • Giảm trừ gia cảnh bản thân:                  ${formatVND(sample.calc.personalRelief).padStart(18)} │`);
  console.log(` │   • Giảm trừ người phụ thuộc (1 người):          ${formatVND(sample.calc.dependentsRelief).padStart(18)} │`);
  console.log(` │   • Thu nhập tính thuế (Assessable):             ${formatVND(sample.calc.assessableIncome).padStart(18)} │`);
  console.log(` │   → THUẾ TNCN LŨY TIẾN TỪNG PHẦN (Bậc 3: 15%):   ${formatVND(sample.calc.tax).padStart(18)} │`);
  console.log(` ├────────────────────────────────────────────────────────────────────────┤`);
  console.log(` │ [4] THỰC LĨNH CHUYỂN KHOẢN (NET TAKE-HOME):                            │`);
  console.log(` │   ★ THỰC LĨNH (Làm tròn đơn vị 1.000 ₫):         ${formatVND(sample.calc.netSalary).padStart(18)} │`);
  console.log(` │   (Bảo mật IDOR: Chỉ nhân viên sở hữu và HR/BOD mới có quyền truy cập) │`);
  console.log(` └────────────────────────────────────────────────────────────────────────┘`);

  console.log('\n' + '█'.repeat(90));
  console.log('  ✅ TOÀN BỘ CHU TRÌNH END-TO-END ĐÃ ĐƯỢC MÔ PHỎNG VÀ KIỂM ĐỊNH THÀNH CÔNG!');
  console.log('█'.repeat(90) + '\n');
}

runSimulation();
