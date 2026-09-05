# BÁO CÁO HOÀN THÀNH — PHASE 9: ATTENDANCE CORRECTION & EXCEPTIONS

## 1. TỔNG QUAN YÊU CẦU & KẾT QUẢ ĐẠT ĐƯỢC

Hệ thống Xử lý Ngoại lệ & Điều chỉnh Chấm công (Phase 9) đã được xây dựng hoàn chỉnh, đáp ứng đầy đủ và nghiêm ngặt mọi tiêu chí nghiệp vụ doanh nghiệp:

| Nghiệp vụ yêu cầu | Trạng thái | Giải pháp kỹ thuật |
|---|---|---|
| **Quên check-in** | ĐÃ HOÀN THÀNH | Loại `FORGOT_CHECKIN`: Cho phép bổ sung giờ vào ca làm việc |
| **Quên check-out** | ĐÃ HOÀN THÀNH | Loại `FORGOT_CHECKOUT`: Bổ sung giờ ra ca khi đã có giờ check-in hợp lệ |
| **Đi muộn (Late justification)** | ĐÃ HOÀN THÀNH | Loại `LATE_JUSTIFICATION`: Giải trình lý do khách quan, khi duyệt tự động miễn trừ phạt (`lateMinutes = 0`, trạng thái cập nhật `ON_TIME`) |
| **Về sớm (Early leave justification)** | ĐÃ HOÀN THÀNH | Loại `EARLY_LEAVE_JUSTIFICATION`: Giải trình lý do về sớm, khi duyệt tự động miễn trừ phạt (`earlyMinutes = 0`) |
| **Điều chỉnh cả ca (Full correction)** | ĐÃ HOÀN THÀNH | Loại `FULL_CORRECTION`: Điều chỉnh toàn bộ giờ vào và giờ ra ca làm việc |
| **Đề xuất tăng ca (Overtime request)** | ĐÃ HOÀN THÀNH | Loại `OVERTIME_REQUEST`: Đề xuất số phút làm thêm giờ (`overtimeMinutes`), khi duyệt cộng dồn chính xác vào `otHours` |
| **Bổ sung công tác / Thiếu cả ngày** | ĐÃ HOÀN THÀNH | Loại `MISSING_ATTENDANCE`: Tạo bản ghi công tác / bù công cho ngày không có dữ liệu máy chấm công |
| **Quy trình phê duyệt (Approval Workflow)** | ĐÃ HOÀN THÀNH | Employee tạo request $\rightarrow$ Manager duyệt theo phòng ban quản lý $\rightarrow$ HR/Admin có quyền toàn cơ quan |
| **Phân quyền chặt chẽ (RBAC)** | ĐÃ HOÀN THÀNH | Employee chỉ xem & hủy yêu cầu của mình; Manager chỉ duyệt nhân viên thuộc phòng ban mình quản lý, không được tự duyệt cho bản thân; HR/Admin toàn quyền |
| **Bảo toàn dữ liệu gốc (No Silent Overwrite)** | ĐÃ HOÀN THÀNH | **Bản ghi chấm công ban đầu không bao giờ bị ghi đè ngầm**. Khi tạo yêu cầu, dữ liệu gốc giữ nguyên 100%. Khi duyệt, hệ thống snapshot toàn bộ trạng thái cũ (`oldValues`) và trạng thái mới (`newValues`) lưu vào Audit Trail |
| **Audit Trail bất biến** | ĐÃ HOÀN THÀNH | Mọi hành động (`CREATE`, `APPROVE`, `REJECT`, `CANCEL`) đều được lưu vào bảng `audit_logs` với actorId, IP, User Agent, snapshot JSON dữ liệu trước và sau |

---

## 2. KIẾN TRÚC & CÁC THÀNH PHẦN ĐÃ XÂY DỰNG

### 2.1. CSDL & Schema Prisma (`prisma/schema.prisma`)
Cập nhật bảng `AttendanceAdjustment`:
- `workDate`: Ngày làm việc cần điều chỉnh (`@db.Date`)
- `correctionType`: Enum 7 loại yêu cầu
- `requestedCheckIn`, `requestedCheckOut`: Thời gian đề xuất từ nhân viên
- `overtimeMinutes`: Số phút tăng ca đề xuất
- `overrideCheckIn`, `overrideCheckOut`: Thời gian do cấp quản lý/HR thực duyệt ghi đè
- `reason`: Lý do chi tiết (tối thiểu 10 ký tự)
- `evidenceUrl`: Liên kết minh chứng đính kèm
- `approverId`: ID nhân viên cấp quản lý duyệt
- `status`: `PENDING` $\rightarrow$ `APPROVED` \| `REJECTED` \| `CANCELLED`
- `approvalNotes`: Ghi chú khi xét duyệt
- `processedAt`: Thời điểm xử lý

### 2.2. Validation Schemas (`src/lib/validations/attendance-correction.ts`)
- `CreateCorrectionSchema`: Kiểm tra ràng buộc chéo (ví dụ: check-in bắt buộc cho `FORGOT_CHECKIN`, check-out bắt buộc cho `FORGOT_CHECKOUT`, check-out phải sau check-in, số phút tăng ca hợp lệ, thời gian không được ở tương lai, không quá 90 ngày trong quá khứ).
- `ProcessCorrectionSchema`: Xác thực quyết định (`APPROVED` \| `REJECTED`), ghi chú bắt buộc khi từ chối, thời gian ghi đè hợp lệ.
- `CancelCorrectionSchema`: Xác thực hủy yêu cầu từ nhân viên.
- `CorrectionQuerySchema`: Lọc phân trang theo phòng ban, trạng thái, loại điều chỉnh, khoảng ngày.

### 2.3. Service Layer (`src/lib/services/attendance-correction.service.ts`)
- `createCorrection`: Xác thực quyền, kiểm tra tồn tại bản ghi, chống tạo yêu cầu trùng lặp (`409 Conflict`), tạo bản ghi `AttendanceAdjustment` ở trạng thái `PENDING` và ghi audit log. **Không sửa đổi bản ghi Attendance gốc**.
- `processCorrection`: RBAC kiểm tra quyền duyệt của Manager/HR/Admin.
  - Khi `REJECTED`: Cập nhật trạng thái yêu cầu sang `REJECTED`, ghi audit log. Bản ghi chấm công gốc hoàn toàn không bị ảnh hưởng.
  - Khi `APPROVED`: Chạy giao dịch `$transaction`, lưu snapshot `oldValues` của chấm công ban đầu, tính toán lại số giờ công/giờ muộn/sớm/OT bằng `AttendanceService.calculateAttendanceMetrics`, cập nhật bản ghi chấm công sang phương thức `CORRECTED`, ghi log kiểm toán đầy đủ `oldValues` & `newValues`.
- `cancelCorrection`: Nhân viên tự hủy yêu cầu PENDING của mình.
- `listCorrections`: Truy vấn danh sách phân quyền theo vai trò người dùng (Employee chỉ thấy của mình, Manager thấy phòng ban quản lý, HR/Admin thấy toàn bộ).
- `getCorrectionById`: Chi tiết yêu cầu với kiểm tra bảo mật.
- `getCorrectionAuditTrail`: Lấy toàn bộ lịch sử kiểm toán của yêu cầu.

### 2.4. REST API Endpoints
- `POST /api/v1/attendance/corrections`: Nhân viên tạo yêu cầu điều chỉnh.
- `GET /api/v1/attendance/corrections`: Danh sách yêu cầu (phân quyền tự động).
- `GET /api/v1/attendance/corrections/[id]`: Chi tiết yêu cầu.
- `PATCH /api/v1/attendance/corrections/[id]/process`: Manager/HR duyệt hoặc từ chối.
- `PATCH /api/v1/attendance/corrections/[id]/cancel`: Hủy yêu cầu PENDING.
- `GET /api/v1/attendance/corrections/[id]/audit`: Xem lịch sử kiểm toán của yêu cầu.

### 2.5. UI Components & Giao Diện Người Dùng
- `CorrectionRequestModal.tsx`: Hộp thoại tạo yêu cầu trực quan cho nhân viên, tự động chuyển đổi các trường nhập liệu theo loại điều chỉnh.
- `CorrectionProcessModal.tsx`: Hộp thoại xét duyệt cho Quản lý/HR so sánh trực quan thời gian đề xuất vs thời gian gốc, hỗ trợ ghi đè giờ và ghi chú lý do.
- `CorrectionAuditTrailModal.tsx`: Timeline hiển thị nhật ký kiểm toán bất biến, xem diff JSON dữ liệu trước và sau thay đổi.
- Tích hợp vào `src/app/attendance/page.tsx`:
  - Thêm tab **"Yêu Cầu & Duyệt Bù Công"** với thanh lọc trạng thái, loại yêu cầu, bộ đếm badge cảnh báo số yêu cầu đang chờ duyệt.
  - Thêm nút thao tác nhanh **"Sửa công"** trực tiếp trên từng dòng của bảng chấm công cá nhân.

---

## 3. KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (AUTOMATED TEST SUITE)

Hệ thống đã chạy toàn bộ 10 tệp kiểm thử tự động với **176/176 tests PASS 100%**:

```
✓ src/lib/services/__tests__/attendance.service.test.ts (20 tests)
✓ src/lib/services/__tests__/shift.service.test.ts (37 tests)
✓ src/lib/services/__tests__/employee.service.test.ts (18 tests)
✓ src/lib/services/__tests__/organization.service.test.ts (14 tests)
✓ src/lib/services/__tests__/qr-attendance.service.test.ts (13 tests)
✓ src/lib/services/__tests__/gps-attendance.service.test.ts (17 tests)
✓ src/lib/services/__tests__/worksite.service.test.ts (11 tests)
✓ src/lib/auth/__tests__/auth.test.ts (15 tests)
✓ src/lib/auth/__tests__/api_auth.test.ts (5 tests)
✓ src/lib/services/__tests__/attendance-correction.service.test.ts (26 tests)

Test Files: 10 passed (10)
Tests:      176 passed (176)
```
