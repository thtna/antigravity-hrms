# BÁO CÁO HOÀN THÀNH GIAI ĐOẠN 13 (PHASE 13 COMPLETION REPORT)

## ⚠️ MODULE: PENALTY SYSTEM (HỆ THỐNG XỬ LÝ KỶ LUẬT & KHẤU TRỪ PHẠT)

---

### 1. TỔNG QUAN YÊU CẦU & KẾT QUẢ ĐẠT ĐƯỢC

Giai đoạn 13 đã hoàn thành xây dựng **Hệ Thống Xử Lý Kỷ Luật & Khấu Trừ Phạt (Penalty System)** cho Antigravity HRMS, song hành với hệ thống Khen thưởng (Phase 12) nhằm hoàn thiện trọn vẹn nghiệp vụ Thưởng - Phạt trước khi chuyển giao dữ liệu vào Động cơ Tính lương (Payroll Engine).

| Hạng mục yêu cầu | Hiện trạng | Ghi chú kỹ thuật |
|---|:---:|---|
| **4 Loại vi phạm kỷ luật (Penalty Types)** | ✅ Đạt | `LATE` (Đi muộn/về sớm), `UNAUTHORIZED_LEAVE` (Nghỉ không phép), `KPI_MISS` (Không đạt KPI tối thiểu), `OTHER` (Vi phạm quy chế khác). |
| **Quy trình lập biên bản (Create)** | ✅ Đạt | Khởi tạo biên bản ở trạng thái `PENDING`, tự động ghi vết khởi tạo vào `AuditLog`. |
| **Chặn nhân viên tự tạo phạt (No Self-Penalty)** | ✅ Đạt | **Strict Enforcement**: Nghiêm cấm bất kỳ nhân viên nào tự lập biên bản xử phạt cho chính mình (`session.employeeId === input.employeeId` bị từ chối 400 Bad Request). Chỉ Manager, HR, Admin mới có quyền lập biên bản. |
| **Khóa tài chính bất biến (Financial Lock)** | ✅ Đạt | **Strict Enforcement**: Tuyệt đối không cho phép sửa đổi biên bản xử phạt đã `APPROVED` hoặc `REJECTED`. Chỉ cho phép chỉnh sửa khi đang `PENDING`. Lưu snapshot `oldValues`/`newValues`. |
| **Phê duyệt & Bác bỏ (Approval / Rejection)** | ✅ Đạt | Phân quyền Quản lý theo phòng ban; **Chống tự duyệt (Self-Approval Guard)**: Quản lý không được tự duyệt/bác bỏ án phạt đối với bản thân; Bắt buộc có lý do giải trình khi từ chối. |
| **Số tiền & Ngày vi phạm (Amount & Date)** | ✅ Đạt | Số tiền phạt `Decimal(14, 2)` (VND), ngày phát sinh vi phạm (`effectiveDate`), kỳ khấu trừ lương (`period`). |
| **Kiểm toán tài chính (Auditable Financial Records)** | ✅ Đạt | Mọi thao tác lập, sửa đổi, phê duyệt, từ chối đều lưu vết bất biến trong `AuditLog` với actor và diff giá trị cũ/mới. |
| **Tách biệt Logic & Định dạng tiền tệ** | ✅ Đạt | Định dạng tiền VND qua helper `formatBonusVnd`, không hard-code công thức hay quy tắc trong components. |

---

### 2. CÁC THÀNH PHẦN KIẾN TRÚC ĐÃ TRIỂN KHAI

#### A. Database Schema (`prisma/schema.prisma`)
Tận dụng model `EmployeeBonusPenalty` (`type: 'PENALTY'`) đã bổ sung đầy đủ trường kiểm toán từ Phase 12:
- `type = 'PENALTY'`
- `category` in `['LATE', 'UNAUTHORIZED_LEAVE', 'KPI_MISS', 'OTHER']`
- `amount`: `Decimal(14, 2)`
- `effectiveDate`: `DateTime @db.Date` (Ngày phát sinh vi phạm)
- `period`: `String` (Kỳ khấu trừ lương: `YYYY-MM`, `YYYY-QX`, `YYYY`)
- `status`: `'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'`
- `approvedBy`, `approvedAt`, `approvalNotes`
- Quan hệ với `Employee` và `Approver`

#### B. Validation Layer (`src/lib/validations/penalty.ts`)
- `PenaltyCategoryEnum`: `['LATE', 'UNAUTHORIZED_LEAVE', 'KPI_MISS', 'OTHER']`
- `PenaltyStatusEnum`: `['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']`
- `CreatePenaltySchema`: Kiểm tra `employeeId`, `category`, `amount > 0` (tối đa 1 tỷ ₫), `effectiveDate`, `period`, `reason` (3-500 ký tự).
- `UpdatePenaltySchema`: Kiểm tra các trường cho phép chỉnh sửa trước khi duyệt.
- `ProcessPenaltySchema`: Bắt buộc nhập lý do giải trình `approvalNotes` (>= 3 ký tự) khi `decision === 'REJECTED'`.
- `PenaltyQuerySchema`: Hỗ trợ lọc theo phòng ban, nhân viên, kỳ, loại vi phạm, trạng thái và phân trang.

#### C. Business Logic Service (`src/lib/services/penalty.service.ts`)
- **`createPenalty`**:
  - Kiểm tra quyền: Chỉ `manager`, `hr`, `admin`. Nhân viên thường không được lập biên bản.
  - Chặn tự tạo phạt: `session.employeeId === input.employeeId` -> Ném `ApiError.badRequest('Không được phép tự tạo quyết định xử phạt cho chính mình.')`.
  - Quản lý (`manager`) chỉ được lập biên bản cho nhân viên thuộc phòng ban mình phụ trách.
  - Ghi bản ghi `EmployeeBonusPenalty` với `status: 'PENDING'`.
  - Lưu vết `AuditLog` với action `CREATE_PENALTY_RECORD`.
- **`updatePenalty` (Financial Lock)**:
  - Kiểm tra `existing.status !== 'PENDING'` -> Ném `ApiError.badRequest('Biên bản xử phạt đã ở trạng thái ${existing.status}, không thể chỉnh sửa.')`.
  - Lưu vết `AuditLog` với action `UPDATE_PENALTY_BEFORE_APPROVAL` kèm snapshot `oldValues` và `newValues`.
- **`processPenalty` (Approve / Reject)**:
  - Chặn tự duyệt (Self-Approval Guard): `session.employeeId === existing.employeeId` -> Ném `ApiError.forbidden('Không được phép tự phê duyệt/từ chối biên bản xử phạt của chính mình.')`.
  - Quản lý chỉ được duyệt nhân viên thuộc phòng ban mình phụ trách.
  - Cập nhật `status`, `approvedBy`, `approvedAt`, `approvalNotes`.
  - Lưu vết `AuditLog` với action `APPROVE_PENALTY` hoặc `REJECT_PENALTY`.
- **`listPenalties`**: Phân quyền RBAC scoping (Employee xem của mình; Manager xem phòng ban quản lý + bản thân; HR/Admin xem toàn bộ).
- **`getPenaltyById`**: Xem chi tiết biên bản phạt kèm kiểm tra quyền truy cập.
- **`getPenaltyAuditTrail`**: Trích xuất dòng thời gian bất biến (timeline) từ bảng `AuditLog`.
- **`getPenaltyDashboardSummary`**: Tính tổng tiền phạt theo 4 danh mục (`LATE`, `UNAUTHORIZED_LEAVE`, `KPI_MISS`, `OTHER`), tổng tiền phạt đã duyệt và số lượng đơn đang chờ xử lý trong kỳ.

#### D. RESTful API Routes (`src/app/api/v1/penalties/`)
- `GET /api/v1/penalties`: Danh sách biên bản xử phạt có phân quyền, lọc và phân trang.
- `POST /api/v1/penalties`: Khởi tạo biên bản xử phạt mới.
- `GET /api/v1/penalties/[id]`: Chi tiết biên bản xử phạt.
- `PUT /api/v1/penalties/[id]`: Chỉnh sửa trước khi duyệt (áp dụng Financial Lock).
- `PATCH /api/v1/penalties/[id]/process`: Phê duyệt hoặc bác bỏ biên bản kỷ luật.
- `GET /api/v1/penalties/[id]/audit`: Lấy nhật ký kiểm toán tài chính bất biến.
- `GET /api/v1/penalties/summary`: Thống kê tổng quan phục vụ dashboard.

#### E. Giao Diện Người Dùng Hiện Đại (`src/components/penalty/` & `src/app/penalties/`)
- **Metric Cards**: 4 thẻ danh mục vi phạm (`Đi Muộn / Về Sớm`, `Nghỉ Không Phép`, `Không Đạt KPI`, `Kỷ Luật Khác`) kèm thẻ tổng tiền phạt đã duyệt và số lượng chờ xử lý.
- **Thanh Công Cụ Bộ Lọc**: Lọc theo loại vi phạm, kỳ khấu trừ, trạng thái tabs (`Tất Cả`, `Chờ Duyệt`, `Đã Khấu Trừ`, `Đã Bác Bỏ`).
- **Bảng Dữ Liệu Chi Tiết**: Cột nhân viên vi phạm, loại vi phạm (badge màu riêng biệt), ngày vi phạm, kỳ, số tiền VND nổi bật màu đỏ rose (`-XXX.XXX ₫`), lý do, trạng thái, người duyệt/ngày duyệt, và các nút thao tác nhanh.
- **Modal Lập Biên Bản (`PenaltyCreateModal`)**: Lựa chọn nhân viên (loại trừ chính bản thân), chọn loại vi phạm, nhập số tiền xem trước VND, ngày phát sinh, lý do.
- **Modal Chỉnh Sửa (`PenaltyEditModal`)**: Hiển thị cảnh báo khóa tài chính khi không phải `PENDING`. Cho phép sửa đổi khi `PENDING`.
- **Modal Xét Duyệt (`PenaltyProcessModal`)**: Phê duyệt khấu trừ hoặc bác bỏ kèm giải trình bắt buộc, có cảnh báo chống tự duyệt.
- **Modal Kiểm Toán Tài Chính (`PenaltyAuditModal`)**: Trực quan hóa dòng thời gian kiểm toán, diff so sánh số tiền cũ/mới, actor và thời gian chính xác.

---

### 3. KẾT QUẢ KIỂM THỬ (VERIFICATION RESULTS)

#### A. Unit Tests (`penalty.service.test.ts`)
- **Tổng số tests**: 18 tests
- **Kết quả**: **18/18 PASSED (100%)**
- **Thời gian thực thi**: 47ms
- **Nội dung kiểm thử**:
  - `createPenalty`: Chặn nhân viên thường tự lập biên bản phạt.
  - `createPenalty` (Self-Penalty Block): Chặn nhân viên/quản lý tự lập biên bản phạt chính mình.
  - `createPenalty`: Chặn Quản lý phạt nhân viên ngoài phòng ban.
  - `createPenalty`: Cho phép Quản lý phạt nhân viên trong phòng ban và ghi vết `AuditLog`.
  - `createPenalty`: Cho phép HR/Admin lập biên bản phạt và ghi vết `AuditLog`.
  - `updatePenalty`: Sửa thành công khi `PENDING` và ghi nhận diff `oldValues`/`newValues`.
  - `updatePenalty` (Financial Lock): Chặn sửa biên bản đã `APPROVED`.
  - `updatePenalty` (Financial Lock): Chặn sửa biên bản đã `REJECTED`.
  - `processPenalty`: Phê duyệt thành công và cập nhật `approvedBy`, `approvedAt`.
  - `processPenalty` (Self-Approval Guard): Chặn Quản lý tự duyệt biên bản phạt của chính mình.
  - `processPenalty`: Chặn Quản lý duyệt nhân viên phòng ban khác.
  - `processPenalty`: Chặn duyệt biên bản đã qua xử lý.
  - `processPenalty`: Từ chối biên bản thành công kèm lý do giải trình.
  - `listPenalties`: Phân quyền RBAC chính xác cho Employee, Manager, Admin/HR.
  - `getPenaltyAuditTrail`: Lấy đúng lịch sử kiểm toán tài chính.
  - `getPenaltyDashboardSummary`: Thống kê chính xác số tiền theo danh mục vi phạm và hồ sơ chờ duyệt.

#### B. Kiểm Thử Toàn Bộ Dự Án (`npx vitest run`)
- **Tổng số test suites**: 15 suites
- **Tổng số tests**: 287 tests
- **Kết quả**: **287/287 PASSED (100%)**
- **Zero regressions** trên toàn bộ hệ thống.

#### C. Type Safety (`npx tsc --noEmit`)
- **Kết quả**: Exit code 0, 0 errors. Toàn bộ mã nguồn strictly typed.

#### D. End-to-End Route Verification
- `http://localhost:3000/penalties`: HTTP 200 OK — Render giao diện quản trị xử phạt hoàn chỉnh.
- `http://localhost:3000/`: HTTP 200 OK — Nút điều hướng "Kỷ Luật & Phạt (Penalties)" hoạt động chính xác.
