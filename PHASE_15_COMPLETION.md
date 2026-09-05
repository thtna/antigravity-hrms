# 🧮 BÁO CÁO HOÀN THÀNH GIAI ĐOẠN 15 (PHASE 15 COMPLETION REPORT)
## ĐỘNG CƠ TÍNH LƯƠNG CHU KỲ (PAYROLL CALCULATION ENGINE)

---

### 1. Tổng Quan & Yêu Cầu Cốt Lõi
Theo chỉ đạo và prompt Phase 15:
> **Xây Payroll Calculation Engine.**
> 
> **Input:**
> * base salary
> * work days
> * actual work days
> * work hours
> * overtime hours
> * overtime pay
> * bonus
> * penalty
> * tax
> * insurance
> * deductions
> 
> **Output:**
> * gross salary
> * total bonus
> * total penalty
> * tax
> * insurance
> * net salary
> 
> **Ràng buộc:**
> * Engine phải **deterministic** (cùng input phải cho cùng output).
> * **Không tính payroll ở React component**.
> * Payroll phải **đọc dữ liệu chính thức từ database**.
> * **Chạy transaction** khi tạo payroll.
> * Viết **extensive unit tests**.
> 
> **Các ca kiểm thử bắt buộc:**
> * full month
> * missing day
> * unpaid leave
> * overtime
> * bonus
> * penalty
> * zero bonus
> * zero penalty
> * rounding
> * decimal values
> * employee termination/change
> * edge dates

---

### 2. Các Thành Phần Kiến Trúc Đã Xây Dựng

#### 2.1. Động Cơ Tính Toán Tất Định Thuần Túy (Pure Deterministic Calculation Engine)
- **File**: `src/lib/payroll/payroll-calculation-engine.ts`
- **Nguyên lý thiết kế**:
  - Pure function độc lập: `PayrollCalculationEngine.calculate(input)` không phụ thuộc vào thời gian hệ thống, không có biến trạng thái toàn cục biến đổi, không gọi random.
  - Toàn bộ phép tính tiền tệ sử dụng `decimal-math.ts` (độ chính xác 28 chữ số thập phân, `ROUND_HALF_UP`, tránh hoàn toàn lỗi trôi dấu phẩy động).
- **Hợp đồng đầu vào (Input Contract)**:
  - `baseSalary`: Mức lương hợp đồng cơ bản.
  - `workDays`: Số ngày làm việc chuẩn trong kỳ (mặc định 22).
  - `actualWorkDays`: Số ngày làm việc thực tế (hỗ trợ số thực lẻ như 21.5 ngày).
  - `workHours`: Tổng số giờ làm việc thực tế.
  - `overtimeHours`: Tổng số giờ làm thêm.
  - `overtimePay`: Tiền làm thêm (nếu truyền trực tiếp hoặc tự động tính theo hệ số ngày thường 150%, cuối tuần 200%, lễ tết 300%, đêm 30%).
  - `bonus`: Tổng tiền thưởng (KPI, dự án, hiệu suất).
  - `penalty`: Tổng tiền phạt (đi trễ, nghỉ không phép, kỷ luật).
  - `tax`: Thuế TNCN (hoặc tự động tính lũy tiến 7 bậc theo quy chế).
  - `insurance`: Bảo hiểm bắt buộc (hoặc tự động trích nộp theo trần/sàn quy chế).
  - `deductions`: Các khoản khấu trừ hợp pháp khác (đoàn phí, tạm ứng).
- **Hợp đồng đầu ra (Output Contract)**:
  - `grossSalary`: Tổng thu nhập gộp trước thuế và bảo hiểm.
  - `totalBonus`: Tổng tiền thưởng.
  - `totalPenalty`: Tổng tiền phạt.
  - `tax`: Thuế thu nhập cá nhân.
  - `insurance`: Bảo hiểm bắt buộc trích nộp phần người lao động.
  - `netSalary`: Lương thực nhận sau thuế, bảo hiểm, phạt và làm tròn.
  - Kèm chi tiết từng dòng phục vụ kiểm toán (`lineItems: PayrollLineItem[]`).

#### 2.2. Tầng Dịch Vụ Đọc Dữ Liệu Thực Tế & ACID Transaction
- **File**: `src/lib/services/payroll.service.ts`
- **Đọc dữ liệu chính thức từ PostgreSQL**:
  1. **Nhân viên (`Employee`)**: Lấy thông tin hợp đồng (`contractSalary`, `insuranceSalary`, `dependentsCount`, `hireDate`, `status`, `deletedAt`). Loại bỏ các nhân sự nghỉ việc trước kỳ; chia công chính xác cho nhân sự vào làm hoặc nghỉ việc giữa kỳ.
  2. **Chấm công (`Attendance`)**: Quét toàn bộ bản ghi hợp lệ trong khoảng `[startDate, endDate]`. Tính tổng số giờ làm việc, số ngày công (hỗ trợ ca đủ ngày $\ge 8h$, nửa ngày $\ge 4h$), và phân loại số giờ làm thêm (OT ngày thường vs OT ngày cuối tuần).
  3. **Nghỉ phép (`LeaveRequest`)**: Quét các đơn nghỉ đã duyệt (`APPROVED`) trong kỳ. Phân tách chính xác ngày nghỉ hưởng lương (`paidLeaveDays`) và ngày nghỉ không hưởng lương (`unpaidLeaveDays`).
  4. **Thưởng & Phạt (`EmployeeBonusPenalty`)**: Quét toàn bộ các khoản thưởng (`BONUS`) và phạt (`PENALTY`) đã được phê duyệt (`APPROVED`) trong kỳ lương.
  5. **Thưởng KPI (`EmployeeKpiResult`)**: Quét kết quả đánh giá KPI đạt chuẩn (`APPROVED`) trong kỳ.
  6. **Quy chế tiền lương (`PayrollRule`)**: Lấy quy chế gắn với kỳ (hoặc quy chế chuẩn Việt Nam mặc định).
- **Thực thi trong ACID Transaction (`prisma.$transaction`)**:
  - Cơ chế Idempotent: Xóa sạch các chi tiết bảng lương cũ nếu thực hiện tính lại kỳ lương.
  - Tạo mới bản ghi `Payroll` cho từng nhân viên.
  - Tạo mới các dòng chi tiết `PayrollDetail` cho từng mục thu nhập/khấu trừ.
  - Tự động cộng dồn và cập nhật `totalGrossPayout`, `totalNetPayout` lên `PayrollPeriod`.
  - Ghi nhận nhật ký kiểm toán `AuditLog` với đầy đủ thông tin định lượng.

#### 2.3. Bộ API RESTful
- `GET /api/v1/payroll/periods`: Danh sách kỳ tính lương kèm phân trang và tìm kiếm.
- `POST /api/v1/payroll/periods`: Tạo kỳ tính lương mới (mã kỳ, ngày bắt đầu, ngày kết thúc, số ngày công chuẩn).
- `GET /api/v1/payroll/periods/:id`: Lấy chi tiết kỳ tính lương kèm toàn bộ phiếu lương nhân viên.
- `PUT /api/v1/payroll/periods/:id`: Khóa kỳ tính lương (`status = 'CLOSED'`).
- `POST /api/v1/payroll/calculate`: Kích hoạt transaction tính toán bảng lương chu kỳ.
- `GET /api/v1/payroll/payslips/:id`: Lấy chi tiết phiếu lương của một nhân viên (có kiểm soát RBAC).

#### 2.4. Giao Diện Người Dùng (UI Dashboard & Payslip Modal)
- **Trang Quản Lý Bảng Lương**: `src/app/payroll/page.tsx`
  - Chọn kỳ tính lương hoặc tạo kỳ mới.
  - Thẻ thống kê tài chính: Tổng quỹ lương (Gross), Tổng thực chi (Net), Bảo hiểm, Thuế TNCN, Số lượng nhân sự.
  - Nút **"Tính Lương Chu Kỳ (Run Calculation)"** thực thi transaction backend với chỉ báo trạng thái trực quan.
  - Bảng danh sách phiếu lương: Mã NV, Họ tên, Lương cơ bản, Ngày công, Làm thêm giờ, Thưởng, Phạt, Bảo hiểm, Thuế, Lương thực nhận (Net).
- **Modal Chi Tiết Phiếu Lương**: `src/components/payroll/PayslipModal.tsx`
  - Bố cục 2 cột rõ ràng: Thu Nhập (Earnings) vs Khấu Trừ (Deductions).
  - Khối hiển thị Lương Thực Lĩnh (Net) nổi bật với chỉ báo làm tròn số học và thông tin tài khoản ngân hàng.
  - Bảng kê chi tiết từng dòng nghiệp vụ (`lineItems`).

---

### 3. Kết Quả Kiểm Thử Toàn Diện (100% Pass)

#### 3.1. Kiểm Tra Biên Dịch TypeScript
- Lệnh: `npx tsc --noEmit`
- Kết quả: **Thành công (0 lỗi)**.

#### 3.2. Bộ Kiểm Thử Độc Lập Cho Calculation Engine (`payroll-calculation-engine.test.ts`)
Bao phủ toàn bộ các trường hợp người dùng yêu cầu:
1. **Full Month**: Đi làm đủ 22/22 ngày công chuẩn $\rightarrow$ nhận 100% lương cơ bản, tính đúng thuế lũy tiến và bảo hiểm.
2. **Missing Day**: Thiếu 2 ngày công (20/22) $\rightarrow$ lương cơ bản trừ chính xác theo ngày công lẻ.
3. **Unpaid Leave**: Nghỉ không hưởng lương vs Nghỉ hưởng lương $\rightarrow$ so sánh đối chiếu chuẩn xác.
4. **Overtime**: Đa tầng OT (ngày thường 150%, cuối tuần 200%, lễ tết 300%, ca đêm 30%).
5. **Bonus**: Thưởng KPI và thưởng dự án được cộng gộp chính xác.
6. **Penalty**: Phạt trễ và kỷ luật được khấu trừ chuẩn xác vào Net.
7. **Zero Bonus**: Thưởng = 0 không phát sinh lỗi, không bị NaN.
8. **Zero Penalty**: Phạt = 0 không phát sinh lỗi, không bị NaN.
9. **Rounding**: Làm tròn tiền mặt theo quy chế (`ROUND_HALF_UP`, `FLOOR`, `CEIL` với đơn vị 1.000 VNĐ).
10. **Decimal Values**: Xử lý ngày công lẻ 21.5, OT lẻ 2.75 giờ, lương lẻ thập phân không bị sai số IEEE 754.
11. **Employee Termination / Change**: Nhân viên vào làm giữa tháng (10/22 ngày công) $\rightarrow$ chia tỷ lệ chính xác.
12. **Edge Dates**: Tháng 2 năm nhuận 29 ngày, tháng 31 ngày, chuyển giao kỳ năm cũ sang năm mới.
13. **DETERMINISM GUARANTEE**: Thực thi lặp lại 1.000 lần trên cùng input và kiểm tra kết quả luôn đồng nhất 100%.
14. **Direct Injection**: Hỗ trợ truyền trực tiếp số thuế, bảo hiểm, làm thêm giờ đã tính toán từ trước.

#### 3.3. Bộ Kiểm Thử Dịch Vụ & Transaction (`payroll.service.test.ts`)
- Kiểm tra tạo kỳ tính lương và ghi nhận `AuditLog`.
- Kiểm tra toàn vẹn transaction `prisma.$transaction` khi tính bảng lương từ dữ liệu thực tế.
- Kiểm tra tính idempotent (xóa bảng cũ và ghi mới an toàn).
- Kiểm tra phân quyền truy cập phiếu lương (RBAC).

#### 3.4. Toàn Bộ Test Suite Dự Án (All 15 Phases)
- Lệnh: `npx vitest run`
- Kết quả: **20/20 test files PASS, 341/341 tests PASS (100%)**.

#### 3.5. Kiểm Tra Tuyến Web Trực Tiếp
- Route: `http://localhost:3000/payroll` $\rightarrow$ **200 OK**, giao diện hiển thị mượt mà.
- Route: `http://localhost:3000/` $\rightarrow$ Nút điều hướng "Bảng Lương (Payroll)" hoạt động trơn tru.
