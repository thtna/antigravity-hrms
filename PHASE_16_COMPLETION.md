# ✅ BÁO CÁO HOÀN THÀNH GIAI ĐOẠN 16 (PHASE 16 COMPLETION REPORT)
## QUY TRÌNH PHÊ DUYỆT & KHÓA KỲ LƯƠNG (PAYROLL WORKFLOW)

---

### 1. Tổng Quan & Yêu Cầu Cốt Lõi
Theo chỉ đạo và prompt Phase 16:
> **Xây trạng thái:**
> `DRAFT` $\rightarrow$ `CALCULATED` $\rightarrow$ `REVIEW` $\rightarrow$ `APPROVED` $\rightarrow$ `PAID`
> 
> * **Chỉ role phù hợp** mới được chuyển trạng thái.
> * **Approved payroll không được sửa trực tiếp**.
> * **Paid payroll không được sửa trực tiếp**.
> * **Nếu correction: tạo adjustment/revision workflow**.
> * **Tạo approval history**.
> * **Mọi thay đổi phải audit**.

---

### 2. Các Thành Phần Kiến Trúc Đã Triển Khai

#### 2.1. Cỗ Máy Trạng Thái Bảng Lương (Payroll State Machine) & RBAC Guard
- **File**: `src/lib/services/payroll-workflow.service.ts`
- **Vòng đời chuyển đổi trạng thái**:
  1. **`DRAFT` $\rightarrow$ `CALCULATED`**: Thực thi bởi `hr`, `admin` thông qua việc chạy động cơ tính lương từ dữ liệu chấm công, nghỉ phép và thưởng phạt đã duyệt.
  2. **`CALCULATED` $\rightarrow$ `REVIEW`**: Thực thi bởi `hr`, `admin` (`action: SUBMIT_REVIEW`) để trình bảng lương lên cấp quản lý / ban giám đốc thẩm định.
  3. **`REVIEW` $\rightarrow$ `APPROVED`**: Thực thi bởi `admin`, `manager` (`action: APPROVE`) để chốt duyệt số liệu tài chính kỳ lương.
  4. **`REVIEW` $\rightarrow$ `CALCULATED`**: Thực thi bởi `admin`, `manager`, `hr` (`action: REJECT_TO_CALCULATED`) khi phát hiện sai sót, trả về kèm ý kiến giải trình yêu cầu tính toán lại.
  5. **`APPROVED` $\rightarrow$ `PAID`**: Thực thi bởi `admin`, `hr` (hoặc Kế toán trưởng) (`action: CONFIRM_PAID`) sau khi thực hiện lệnh chuyển khoản qua ngân hàng. Toàn bộ phiếu lương của nhân viên được chuyển sang `paymentStatus = 'PAID'` và kỳ tính lương được đóng dấu `closedAt`.
- **Phân quyền vai trò (RBAC Guard)**: Kiểm soát chặt chẽ vai trò người dùng (`session.roles`), mọi hành vi chuyển trạng thái trái thẩm quyền hoặc nhảy cóc đều bị chặn với mã lỗi `403 Forbidden` hoặc `400 Bad Request`.

#### 2.2. Cơ Chế Bất Biến Tuyệt Đối (Immutability Enforcement)
- **Phương thức bảo vệ**: `PayrollWorkflowService.assertPeriodIsMutable(periodStatus, periodCode)`.
- **Ngăn chặn chỉnh sửa trực tiếp**:
  - Khi kỳ lương ở trạng thái `APPROVED` hoặc `PAID`, hệ thống cấm tuyệt đối mọi hành vi gọi hàm `calculatePeriodPayroll` hoặc sửa đổi thủ công các dòng chi tiết `Payroll` / `PayrollDetail`.
  - Trên giao diện, nút **"Tính Lương Chu Kỳ"** tự động chuyển sang chế độ vô hiệu hóa với huy hiệu khóa màu hổ phách: `[Khóa] Đã Khóa Số Liệu (APPROVED/PAID)`.

#### 2.3. Quy Trình Điều Chỉnh / Hồi Tố (Adjustment / Revision Workflow)
- **Model**: `PayrollAdjustment` (`payroll_adjustments` trong PostgreSQL).
- **Mục tiêu**: Khi phát hiện sai lệch sau khi bảng lương đã `APPROVED` hoặc `PAID`, tuân thủ nguyên tắc kế toán không sửa trực tiếp quá khứ mà tạo một đề xuất điều chỉnh độc lập:
  - `periodId`: Kỳ lương phát sinh sai sót.
  - `employeeId`: Nhân viên thụ hưởng hoặc bị truy thu.
  - `adjustmentType`: `OT_CORRECTION` (bổ sung giờ OT), `BONUS_ADJUSTMENT` (điều chỉnh thưởng), `PENALTY_REFUND` (hoàn trả phạt sai), `SALARY_RETROACTIVE` (truy lĩnh lương), `DEDUCTION_CORRECTION` (khấu trừ khác).
  - `direction`: `ADDITION` (truy lĩnh / cộng tiền) hoặc `DEDUCTION` (truy thu / trừ tiền).
  - `amount`: Số tiền điều chỉnh.
  - `reason`: Căn cứ giải trình.
  - `status`: `PENDING` $\rightarrow$ `APPROVED` hoặc `REJECTED`.
- Cấp quản lý/HR thẩm định và phê duyệt hoặc từ chối đề xuất điều chỉnh thông qua API và giao diện chuyên dụng.

#### 2.4. Lưu Vết Lịch Sử Phê Duyệt & Kiểm Toán (Approval History & AuditLog)
- **Lịch sử phê duyệt (`PayrollApproval`)**: Mỗi lần chuyển đổi trạng thái (`SUBMIT_REVIEW`, `APPROVE`, `REJECT_TO_CALCULATED`, `CONFIRM_PAID`) đều tự động tạo một bản ghi lưu lại: giai đoạn chuyển đổi (`stage`), quyết định (`decision`), người phê duyệt (`reviewerId`, `actorEmail`), ý kiến chỉ đạo (`comments`), và thời điểm (`actionAt`).
- **Nhật ký kiểm toán (`AuditLog`)**: Toàn bộ thao tác chuyển trạng thái quy trình và xử lý điều chỉnh đều được ghi vết đồng thời vào `AuditLog` với giá trị cũ (`oldValues`) và giá trị mới (`newValues`).

#### 2.5. Bộ API RESTful Mới
- `POST /api/v1/payroll/workflow/transition`: Chuyển trạng thái kỳ lương trong ACID transaction.
- `GET /api/v1/payroll/workflow/history/:periodId`: Lấy toàn bộ dòng thời gian phê duyệt của kỳ lương.
- `GET /api/v1/payroll/workflow/adjustments?periodId=...`: Lấy danh sách đề xuất điều chỉnh.
- `POST /api/v1/payroll/workflow/adjustments`: Tạo đề xuất điều chỉnh mới.
- `PUT /api/v1/payroll/workflow/adjustments/:id`: Phê duyệt hoặc từ chối đề xuất điều chỉnh.

#### 2.6. Giao Diện Người Dùng (UI Workflow Stepper & Modals)
- **Component**: `src/components/payroll/PayrollWorkflowStepper.tsx`
  - Thanh tiến trình 5 bước trực quan (`DRAFT` $\rightarrow$ `CALCULATED` $\rightarrow$ `REVIEW` $\rightarrow$ `APPROVED` $\rightarrow$ `PAID`).
  - Nút hành động tương tác theo ngữ cảnh: "Trình Duyệt (Submit Review)", "Phê Duyệt Chốt (Approve)", "Yêu Cầu Tính Lại (Reject)", "Xác Nhận Chi Trả (Confirm Paid)".
  - Modal xác nhận chuyển trạng thái kèm ô nhập ý kiến/ghi chú phê duyệt.
  - Modal xem Lịch Sử Phê Duyệt & Kiểm Toán theo dòng thời gian.
  - Modal tạo Đề Xuất Điều Chỉnh / Hồi Tố cho nhân viên.

---

### 3. Kết Quả Kiểm Thử & Xác Minh (100% Pass)

#### 3.1. Kiểm Tra Biên Dịch TypeScript
- Lệnh: `npx tsc --noEmit`
- Kết quả: **Thành công (0 lỗi)**.

#### 3.2. Bộ Kiểm Thử Độc Lập Cho Workflow Service (`payroll-workflow.service.test.ts`)
Bao phủ 12/12 ca kiểm thử trọng tâm:
1. `assertPeriodIsMutable`: Chặn đứng hành vi chỉnh sửa đối với kỳ `APPROVED` và `PAID`.
2. Cho phép kỳ `DRAFT` và `CALCULATED` được chỉnh sửa bình thường.
3. `SUBMIT_REVIEW`: Cho phép HR/Admin chuyển `CALCULATED` $\rightarrow$ `REVIEW` kèm ghi chú lưu vết.
4. Chặn nhân viên thông thường thực hiện `SUBMIT_REVIEW`.
5. `APPROVE`: Cho phép Manager hoặc Admin phê duyệt chốt kỳ lương `REVIEW` $\rightarrow$ `APPROVED`.
6. `REJECT_TO_CALCULATED`: Cho phép trả về `CALCULATED` từ `REVIEW` kèm lý do giải trình.
7. `CONFIRM_PAID`: Chuyển `APPROVED` $\rightarrow$ `PAID`, tự động cập nhật toàn bộ phiếu lương sang `paymentStatus = 'PAID'` và đóng kỳ lương.
8. Chặn chuyển đổi trạng thái nhảy cóc bất hợp lệ (như `DRAFT` $\rightarrow$ `PAID`).
9. Tạo đề xuất điều chỉnh hồi tố trên bảng lương đã chốt kèm ghi nhận `AuditLog`.
10. Phê duyệt đề xuất điều chỉnh (`APPROVED`).
11. Chặn xử lý lại các đề xuất điều chỉnh đã hoàn tất.
12. Truy vấn lịch sử phê duyệt sắp xếp theo thứ tự thời gian.

#### 3.3. Toàn Bộ Test Suite Hệ Thống (All 16 Phases)
- Lệnh: `npx vitest run`
- Kết quả: **21/21 test files PASS, 353/353 tests PASS (100%)**.

#### 3.4. Kiểm Tra Tuyến Web Trực Tiếp
- Route: `http://localhost:3000/payroll` $\rightarrow$ **200 OK**, tích hợp đầy đủ thanh tiến trình Workflow Stepper, phân quyền nút hành động và các modal phê duyệt.
