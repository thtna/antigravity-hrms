# ANTIGRAVITY MASTER PROJECT — RESTFUL API SPECIFICATION & DESIGN
**Kiến Trúc Giao Tiếp API Chuẩn Enterprise (Next.js App Router Route Handlers & Server Actions)**  
*Document Version: 1.0.0 | Status: APPROVED | Target: Next.js 14+ / 15 App Router*

---

## 1. NGUYÊN TẮC THIẾT KẾ KIẾN TRÚC API

1. **Chuẩn thiết kế RESTful**: Các tài nguyên được định danh rõ ràng qua danh từ số nhiều (e.g. `/api/v1/employees`, `/api/v1/attendance`).
2. **Cấu trúc phản hồi đồng nhất (Standard Response Envelope)**: Tất cả API endpoint đều trả về cấu trúc bọc chuẩn mực:
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;       // E.g., "UNAUTHORIZED", "VALIDATION_FAILED", "OUT_OF_GEOFENCE"
    message: string;    // Thông báo thân thiện cho người dùng
    details?: unknown;  // Chi tiết lỗi từ Zod validation hoặc diagnostics
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    timestamp: string;
  };
}
```
3. **Mã trạng thái HTTP chuẩn mực**:
   - `200 OK`: Truy vấn thành công, cập nhật thành công.
   - `201 Created`: Tạo mới tài nguyên thành công.
   - `400 Bad Request`: Sai định dạng cú pháp JSON hoặc thiếu tham số.
   - `401 Unauthorized`: Chưa đăng nhập hoặc JWT Token hết hạn.
   - `403 Forbidden`: Đã đăng nhập nhưng không có quyền thực hiện thao tác (RBAC).
   - `404 Not Found`: Không tìm thấy bản ghi.
   - `409 Conflict`: Vi phạm ràng buộc duy nhất hoặc trạng thái xung đột (ví dụ: đã check-in rồi, lịch ca trùng lặp).
   - `422 Unprocessable Entity`: Dữ liệu không vượt qua được kiểm định Zod Schema.
   - `500 Internal Server Error`: Lỗi máy chủ không mong muốn (kèm mã tracking ẩn danh, không lộ stack trace).

---

## 2. MA TRẬN CÁC ENDPOINT THEO PHÂN HỆ

### 2.1. Phân Hệ Xác Thực & Phiên Làm Việc (`/api/v1/auth`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Public | Đăng nhập bằng Email & Password, trả về Session HttpOnly Cookie |
| `POST` | `/api/v1/auth/logout` | Authenticated | Hủy phiên đăng nhập, thu hồi Token |
| `GET` | `/api/v1/auth/me` | Authenticated | Lấy thông tin tài khoản hiện hành, vai trò và danh sách quyền |
| `POST` | `/api/v1/auth/change-password` | Authenticated | Đổi mật khẩu cá nhân |
| `POST` | `/api/v1/auth/reset-password-request` | Public | Gửi link khôi phục mật khẩu qua email |

---

### 2.2. Phân Hệ Tổ Chức & Địa Điểm Làm Việc (`/api/v1/organization`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/organization/departments` | `dept:read` | Lấy danh sách cây phòng ban |
| `POST` | `/api/v1/organization/departments` | `dept:write` | Tạo phòng ban mới |
| `PUT` | `/api/v1/organization/departments/:id` | `dept:write` | Cập nhật thông tin phòng ban |
| `DELETE`| `/api/v1/organization/departments/:id` | `dept:delete`| Xóa mềm phòng ban (nếu không có nhân viên) |
| `GET` | `/api/v1/organization/positions` | `position:read`| Lấy danh mục chức vụ |
| `POST` | `/api/v1/organization/positions` | `position:write`| Tạo chức danh mới |
| `GET` | `/api/v1/organization/worksites` | `worksite:read`| Danh sách địa điểm văn phòng, tọa độ GPS & bán kính |
| `POST` | `/api/v1/organization/worksites` | `worksite:write`| Tạo mới địa điểm làm việc & thiết lập geofence |

---

### 2.3. Phân Hệ Quản Lý Hồ Sơ Nhân Viên (`/api/v1/employees`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/employees` | `employee:read` | Tìm kiếm, lọc và phân trang danh sách nhân viên |
| `POST` | `/api/v1/employees` | `employee:write` | Tiếp nhận nhân sự mới (Tạo user + profile + hợp đồng) |
| `GET` | `/api/v1/employees/:id` | `employee:read` | Lấy hồ sơ chi tiết một nhân viên |
| `PUT` | `/api/v1/employees/:id` | `employee:write` | Cập nhật hồ sơ nhân sự, chức danh, nơi làm việc |
| `PATCH`| `/api/v1/employees/:id/status`| `employee:write` | Thay đổi trạng thái công tác (Thử việc, Chính thức, Nghỉ việc) |
| `DELETE`| `/api/v1/employees/:id` | `employee:delete`| Xóa mềm hồ sơ nhân viên |

---

### 2.4. Phân Hệ Ca Làm Việc & Phân Lịch (`/api/v1/schedules`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/schedules/shifts` | `shift:read` | Danh mục ca làm việc tiêu chuẩn |
| `POST` | `/api/v1/schedules/shifts` | `shift:write` | Tạo ca làm việc mới |
| `GET` | `/api/v1/schedules/roster` | `schedule:read` | Lấy bảng lịch làm việc theo tháng/phòng ban |
| `POST` | `/api/v1/schedules/assign` | `schedule:write`| Xếp lịch ca hàng loạt cho nhân viên theo dải ngày |
| `POST` | `/api/v1/schedules/swap-request`| `schedule:swap` | Nhân viên gửi yêu cầu đổi ca cho đồng nghiệp |
| `PATCH`| `/api/v1/schedules/swap-request/:id/approve` | `schedule:approve` | Trưởng phòng duyệt đơn đổi ca |

---

### 2.5. Phân Hệ Động Cơ Chấm Công (`/api/v1/attendance`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/attendance/qr/active-token` | `attendance:kiosk` | Máy kiosk lấy Dynamic QR Token (làm mới mỗi 20s) |
| `POST` | `/api/v1/attendance/check-in/qr` | `attendance:checkin` | Nhân viên quét QR Code để chấm công vào |
| `POST` | `/api/v1/attendance/check-out/qr` | `attendance:checkin` | Nhân viên quét QR Code để chấm công ra |
| `POST` | `/api/v1/attendance/check-in/gps` | `attendance:checkin` | Chấm công vào qua GPS Geofence trên di động |
| `POST` | `/api/v1/attendance/check-out/gps` | `attendance:checkin` | Chấm công ra qua GPS Geofence trên di động |
| `GET` | `/api/v1/attendance/my-logs` | Authenticated | Nhân viên xem lịch sử chấm công cá nhân |
| `GET` | `/api/v1/attendance/daily-sheet` | `attendance:read_all` | Quản lý/HR xem bảng tổng hợp công theo ngày của toàn công ty |
| `POST` | `/api/v1/attendance/adjustments` | Authenticated | Nhân viên nộp đơn giải trình / khiếu nại công |
| `PATCH`| `/api/v1/attendance/adjustments/:id/review` | `attendance:adjust` | Trưởng phòng/HR phê duyệt điều chỉnh công |

---

### 2.6. Phân Hệ Đơn Nghỉ Phép (`/api/v1/leave`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/leave/types` | Authenticated | Lấy danh mục các loại nghỉ phép |
| `GET` | `/api/v1/leave/my-balance` | Authenticated | Xem số ngày phép năm còn lại của bản thân |
| `POST` | `/api/v1/leave/requests` | Authenticated | Tạo đơn xin nghỉ phép mới |
| `GET` | `/api/v1/leave/requests` | `leave:read` | Danh sách đơn xin nghỉ phép cần xét duyệt |
| `PATCH`| `/api/v1/leave/requests/:id/review` | `leave:approve` | Phê duyệt hoặc Từ chối đơn xin nghỉ phép |

---

### 2.7. Phân Hệ Đánh Giá Hiệu Suất KPI (`/api/v1/kpi`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/kpi/templates` | `kpi:read` | Thư viện chỉ số KPI tiêu chuẩn |
| `POST` | `/api/v1/kpi/templates` | `kpi:write` | Thêm mới chỉ số KPI |
| `POST` | `/api/v1/kpi/assign` | `kpi:write` | Gán chỉ số KPI cho nhân viên theo chu kỳ |
| `POST` | `/api/v1/kpi/self-review` | Authenticated | Nhân viên tự chấm điểm KPI kỳ hiện tại |
| `POST` | `/api/v1/kpi/manager-review` | `kpi:evaluate`| Quản lý đánh giá và chốt điểm số KPI nhân viên |
| `GET` | `/api/v1/kpi/summary` | `kpi:read` | Báo cáo kết quả hoàn thành KPI toàn phòng ban |

---

### 2.8. Phân Hệ Thưởng & Phạt (`/api/v1/rewards-penalties`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rewards-penalties` | `reward:read` | Danh sách quyết định thưởng/phạt theo kỳ |
| `POST` | `/api/v1/rewards-penalties` | `reward:write` | Tạo quyết định thưởng hoặc phạt nhân viên |
| `PATCH`| `/api/v1/rewards-penalties/:id/approve` | `reward:approve`| Cấp thẩm quyền duyệt quyết định áp dụng vào lương |

---

### 2.9. Phân Hệ Động Cơ Tính Lương & Phiếu Lương (`/api/v1/payroll`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/payroll/periods` | `payroll:read` | Danh sách các kỳ tính lương |
| `POST` | `/api/v1/payroll/periods` | `payroll:write`| Khởi tạo kỳ tính lương mới (mở kỳ) |
| `POST` | `/api/v1/payroll/periods/:id/calculate` | `payroll:calculate`| Kích hoạt thuật toán tính toán bảng lương tự động |
| `GET` | `/api/v1/payroll/periods/:id/summary` | `payroll:read` | Xem bảng tổng hợp lương của kỳ (Gross, Net, Thuế, Bảo hiểm) |
| `GET` | `/api/v1/payroll/periods/:id/employees/:empId` | `payroll:read` | Xem chi tiết cấu thành lương của 1 nhân viên |
| `POST` | `/api/v1/payroll/periods/:id/approvals` | `payroll:approve`| Thực hiện bước ký duyệt đa cấp (HR -> Kế toán -> CEO) |
| `POST` | `/api/v1/payroll/periods/:id/lock` | `payroll:lock` | Đóng sổ kỳ lương (Chuyển sang `LOCKED`), cấm mọi thay đổi |
| `GET` | `/api/v1/payroll/my-payslip/:periodId` | Authenticated | Nhân viên xem phiếu lương cá nhân của một kỳ |
| `GET` | `/api/v1/payroll/my-payslip/:periodId/pdf`| Authenticated | Tải phiếu lương định dạng PDF có mã xác thực |

---

### 2.10. Phân Hệ Báo Cáo, Kiểm Toán & Thông Báo (`/api/v1/analytics`, `/audit`, `/notifications`)

| Method | Endpoint | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/analytics/headcount` | `report:read` | Biểu đồ biến động nhân sự, phòng ban, độ tuổi |
| `GET` | `/api/v1/analytics/attendance` | `report:read` | Tỷ lệ đi làm đúng giờ, đi muộn về sớm, phân bổ OT |
| `GET` | `/api/v1/analytics/payroll-cost`| `report:read` | Thống kê cơ cấu chi phí quỹ lương và thuế |
| `GET` | `/api/v1/audit-logs` | `audit:read` | Tra cứu lịch sử thay đổi nhạy cảm (có bộ lọc đa trường) |
| `GET` | `/api/v1/notifications` | Authenticated | Danh sách thông báo của người dùng |
| `PATCH`| `/api/v1/notifications/:id/read`| Authenticated | Đánh dấu thông báo đã đọc |

---

## 3. ĐẶC TẢ REQUEST / RESPONSE MẪU (PAYLOAD CONTRACTS)

### Chấm công bằng GPS Geofence: `POST /api/v1/attendance/check-in/gps`

**Zod Request Schema:**
```typescript
import { z } from 'zod';

export const GpsCheckInSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().max(50, "Độ chính xác vị trí GPS quá thấp (> 50m)"),
  deviceFingerprint: z.string().min(10),
  clientTimestamp: z.string().datetime(),
});
```

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "attendanceId": "att-458f-b98a",
    "employeeId": "emp-2026-0012",
    "workDate": "2026-09-03",
    "checkInTime": "2026-09-03T08:05:12+07:00",
    "worksiteName": "Trụ Sở Chính - Tòa Nhà SkyTower",
    "distanceMeters": 24.5,
    "status": "PRESENT",
    "lateMinutes": 0,
    "message": "Check-in thành công! Chúc bạn một ngày làm việc hiệu quả."
  },
  "meta": {
    "timestamp": "2026-09-03T08:05:13+07:00"
  }
}
```

**Failure Response - Ngoài vùng phủ sóng (HTTP 422):**
```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_GEOFENCE",
    "message": "Bạn đang ở cách địa điểm làm việc 342 mét, vượt quá bán kính cho phép (100m).",
    "details": {
      "distanceMeters": 342,
      "allowedRadiusMeters": 100,
      "nearestWorksite": "Trụ Sở Chính - Tòa Nhà SkyTower"
    }
  },
  "meta": {
    "timestamp": "2026-09-03T08:05:13+07:00"
  }
}
```
