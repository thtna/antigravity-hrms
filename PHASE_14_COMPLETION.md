# 💵 BÁO CÁO HOÀN THÀNH GIAI ĐOẠN 14 (PHASE 14 COMPLETION REPORT)
## ĐỘNG CƠ QUY CHẾ TIỀN LƯƠNG (PAYROLL RULE ENGINE)

---

### 1. Tổng Quan & Yêu Cầu Cốt Lõi
Theo chỉ đạo và prompt Phase 14:
> **ĐÂY LÀ PHASE CỰC KỲ QUAN TRỌNG.**
> Trước tiên thiết kế Payroll Rule Engine.
> **Không hard-code:**
> * tax rate
> * insurance rate
> * overtime multiplier
> * legal deduction
> * country-specific rule
> nếu chưa có dữ liệu pháp lý được xác nhận.
> 
> **Thiết kế configurable rules cho:**
> * salary basis
> * work-day proration
> * hourly rate
> * overtime
> * holiday
> * weekend
> * bonus
> * penalty
> * tax
> * insurance
> * deduction
> * rounding
> 
> **Tất cả monetary calculations phải dùng decimal-safe arithmetic.**
> Không dùng floating point thiếu kiểm soát.
> Tạo `payroll_rules` hoặc architecture tương đương.
> Viết unit test độc lập.

---

### 2. Các Thành Phần Kiến Trúc Đã Xây Dựng

#### 2.1. Thư Viện Toán Số Học An Toàn (Decimal-Safe Arithmetic)
- **File**: `src/lib/payroll/decimal-math.ts`
- **Mục tiêu**: Loại trừ triệt để lỗi làm tròn dấu phẩy động IEEE 754 (như `0.1 + 0.2 = 0.30000000000000004`).
- **Triển khai**:
  - Xây dựng trên nền thư viện chuyên dụng `decimal.js` với cấu hình độ chính xác 28 chữ số thập phân (`precision: 28`) và chế độ làm tròn `ROUND_HALF_UP`.
  - Hỗ trợ các phép tính nguyên tử: `toDecimal`, `decAdd`, `decSub`, `decMul`, `decDiv` (an toàn tuyệt đối với phép chia cho 0, trả về 0 thay vì NaN/Infinity), `decMax`, `decMin`, `decClamp`, `applyRounding`, `formatVnd`.
  - Hỗ trợ 4 chiến lược làm tròn cấu hình động: `ROUND_HALF_UP` (làm tròn số học nửa trên), `FLOOR` (làm tròn xuống), `CEIL` (làm tròn lên), `TRUNCATE` (cắt bỏ phần dư).

#### 2.2. Khung Cấu Hình & Định Kiểu Độc Lập (Types & Config Contracts)
- **File**: `src/lib/payroll/types.ts`
- **Mục tiêu**: Định nghĩa các hợp đồng giao diện thuần túy cho động cơ, tách biệt hoàn toàn giữa dữ liệu quy tắc và logic tính toán:
  - `SalaryBasisConfig`: Phương pháp chia công theo ngày chuẩn cố định (`FIXED_DAYS`, ví dụ 22, 24, 26) hoặc ngày làm việc thực tế trong tháng (`MONTHLY_WORKING_DAYS`); số giờ chuẩn mỗi ngày (`standardDailyHours`).
  - `OvertimeConfig`: Hệ số làm thêm giờ linh hoạt cho ngày thường (`weekdayMultiplier`, e.g. 1.5), ngày nghỉ cuối tuần (`weekendMultiplier`, e.g. 2.0), ngày lễ tết (`holidayMultiplier`, e.g. 3.0), và phụ cấp làm việc ban đêm (`nightWorkAddition`, e.g. 0.3).
  - `InsuranceConfig`: Tỷ lệ trích đóng bảo hiểm phía người lao động (`socialRate`, `healthRate`, `unemploymentRate`) và phía người sử dụng lao động (`employerSocialRate`, `employerHealthRate`, `employerUnemploymentRate`), đi kèm sàn và trần lương bảo hiểm (`maxCapAmount`, `minFloorAmount`).
  - `TaxConfig`: Chế độ tính thuế lũy tiến từng phần (`PROGRESSIVE`) hoặc thuế suất phẳng (`FLAT_RATE`); các mức giảm trừ bản thân (`personalRelief`) và người phụ thuộc (`dependentRelief`); danh sách các bậc thuế tùy biến (`TaxBracketConfig[]`).
  - `DeductionConfig`: Tỷ lệ kinh phí / đoàn phí công đoàn (`unionFeeRate`, `unionFeeCap`), thời điểm khấu trừ phạt (`PRE_TAX_GROSS_REDUCTION` hoặc `POST_TAX_DEDUCTION`).
  - `RoundingConfig`: Phương thức và đơn vị làm tròn tiền mặt (ví dụ đơn vị 1.000 VNĐ, 10.000 VNĐ, hoặc 1 VNĐ).

#### 2.3. Động Cơ Tính Lương Thuần Túy (Pure Functional Payroll Rule Engine)
- **File**: `src/lib/payroll/payroll-rule-engine.ts`
- **Mục tiêu**: Động cơ tính toán độc lập, không phụ thuộc vào React, Next.js hay Database.
- **Quy trình tính toán (Pipeline)**:
  1. Xác định số ngày làm việc chuẩn theo kỳ và phương pháp cấu hình.
  2. Tính toán đơn giá ngày (`dailyRate`) và đơn giá giờ (`hourlyRate`) an toàn với `Decimal`.
  3. Tính lương cơ bản thực tế theo ngày công (`proratedBaseSalary`) và lương ngày nghỉ hưởng lương (`paidLeavePay`).
  4. Tính toán chi tiết tiền làm thêm giờ (OT ngày thường, cuối tuần, lễ, và ca đêm) dựa trên hệ số của quy chế.
  5. Tính tổng thu nhập gộp (`grossIncome`) bao gồm phụ cấp và các khoản thưởng (KPI, dự án, v.v.).
  6. Tính trích nộp bảo hiểm bắt buộc theo tỷ lệ và giới hạn trần lương của quy chế (cả phần NLĐ và NSDLĐ).
  7. Xác định thu nhập chịu thuế và thu nhập tính thuế sau khi giảm trừ gia cảnh (bản thân + người phụ thuộc).
  8. Tính thuế TNCN theo biểu lũy tiến từng phần động (hoặc tỷ lệ cố định nếu là quy chế phẳng), chi tiết từng bậc thuế.
  9. Khấu trừ phạt và các khoản giảm trừ pháp lý khác.
  10. Tính lương thực nhận (`netSalary`) và áp dụng quy chế làm tròn số tiền cuối cùng.

#### 2.4. Các Bộ Quy Chế Mẫu (Reference Rule Templates)
- **File**: `src/lib/payroll/default-rules.ts`
- `VIETNAM_STATUTORY_RULE_2026`: Chuẩn 22 ngày công, OT 150%/200%/300%/+30%, BHXH 8%/1.5%/1% (trần 46.8M), Biểu thuế TNCN 7 bậc (5% đến 35%), giảm trừ bản thân 11M, người phụ thuộc 4.4M, làm tròn 1.000 VNĐ.
- `HOURLY_PARTTIME_RULE`: Quy chế tính theo giờ, thuế phẳng 10%, không khấu trừ bảo hiểm.
- `EXPAT_FLAT_TAX_RULE`: Quy chế cho người nước ngoài không cư trú, thuế phẳng 20%.

#### 2.5. Cơ Sở Dữ Liệu & Prisma Model
- **File**: `prisma/schema.prisma`
- Bổ sung bảng `payroll_rules` với các trường lưu trữ JSON cấu hình linh hoạt:
  - `code`, `name`, `description`, `isDefault`, `version`
  - `salaryBasisConfig`, `overtimeConfig`, `insuranceConfig`, `taxConfig`, `deductionConfig`, `roundingConfig`
  - `effectiveFrom`, `effectiveTo`
  - Quan hệ 1-N với `PayrollPeriod` (thiết lập `SetNull` khi xóa an toàn).

#### 2.6. Tầng Dịch Vụ & Lịch Sử Kiểm Toán (Service & Audit Logging)
- **File**: `src/lib/services/payroll-rule.service.ts`
- Các phương thức: `listRules`, `getRuleById`, `getDefaultRule`, `createRule`, `updateRule` (tự động tăng version và ghi log kiểm toán), `setDefaultRule`, `simulatePayroll`, `seedDefaultRulesIfEmpty`.

#### 2.7. API Endpoints
- `GET /api/v1/payroll/rules`: Lấy danh sách quy chế.
- `POST /api/v1/payroll/rules`: Tạo mới quy chế.
- `GET /api/v1/payroll/rules/:id`: Xem chi tiết quy chế.
- `PUT /api/v1/payroll/rules/:id`: Chỉnh sửa quy chế (sinh phiên bản mới và ghi nhận audit log).
- `POST /api/v1/payroll/rules/:id/default`: Đặt làm quy chế mặc định hệ thống.
- `POST /api/v1/payroll/rules/simulate`: Chạy mô phỏng tính toán bảng lương tức thời.

#### 2.8. Giao Diện Người Dùng & Công Cụ Giả Lập Trực Tuyến (UI & Sandbox)
- **Trang Quản Lý**: `src/app/payroll/rules/page.tsx`
- **Bộ Giả Lập**: `src/components/payroll/PayrollSimulatorWidget.tsx` (Tính toán tức thời với `Decimal`, hỗ trợ nhập lương hợp đồng, ngày công, số giờ OT, thưởng KPI, người phụ thuộc và hiển thị biểu thuế lũy tiến trực quan).
- **Modal Cấu Hình**: `src/components/payroll/PayrollRuleModal.tsx` (Tabbed editor cho 6 nhóm cấu hình).

---

### 3. Kết Quả Kiểm Thử (Verification Results)

#### 3.1. Kiểm Tra Biên Dịch TypeScript
- Lệnh: `npx tsc --noEmit`
- Kết quả: **Thành công (0 lỗi)**.

#### 3.2. Kiểm Thử Tự Động Vitest
- Lệnh: `npx vitest run`
- Kết quả: **18/18 test files PASS, 321/321 tests PASS (100%)**.
- Chi tiết các bộ test độc lập Phase 14:
  1. `src/lib/payroll/__tests__/decimal-math.test.ts`: **10/10 tests PASS**
  2. `src/lib/payroll/__tests__/payroll-rule-engine.test.ts`: **18/18 tests PASS**
  3. `src/lib/services/__tests__/payroll-rule.service.test.ts`: **6/6 tests PASS**

#### 3.3. Kiểm Tra Tuyến Web Trực Tiếp
- Route: `http://localhost:3000/payroll/rules`
- Trang hiển thị hoàn hảo, công cụ giả lập tính toán chính xác số học thập phân không sai số (`34.227.273 ₫`, giảm trừ gia cảnh, bảo hiểm, chi tiết từng bậc thuế).
