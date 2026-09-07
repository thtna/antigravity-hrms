# BÁO CÁO TOÀN DIỆN HỆ THỐNG — MULTI-TENANT PRODUCTION AUDIT
**Dự án:** Antigravity HRMS
**Ngày thực hiện:** 06/09/2026
**Trạng thái Phase:** PHASE 1 — FULL SYSTEM AUDIT ONLY (READ-ONLY)
**Quy mô chuyển đổi:** Single-Tenant / Demo sang SaaS Multi-Tenant (Max 5 Active Tenants)

---

## 1. TỔNG QUAN KIẾN TRÚC HIỆN TẠI
- **Mã nguồn:** Next.js 16.3.4 (App Router, Server Components + Route Handlers).
- **Cơ sở dữ liệu:** PostgreSQL trên Supabase Cloud (26 models Prisma).
- **ORM:** Prisma Client `^6.19.3`.
- **Xác thực:** JWT HttpOnly Cookie (`jose` HS256, thời hạn 7 ngày, cookie `antigravity_session`).
- **Hiện trạng:** Hệ thống đang hoạt động ở chế độ **Single-Tenant / Demo Enterprise** (Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong). Toàn bộ 26 bảng dữ liệu đều chưa có ranh giới tổ chức (`organizationId`).

---

## 2. PHÂN TÍCH CHI TIẾT 16 TRỌNG ĐIỂM BẮT BUỘC

### 2.1. Authentication Flow Hiện Tại
- **Luồng đăng nhập:** `POST /api/v1/auth/login` tiếp nhận `{ email, password }`.
  - Kiểm tra rate limit IP (tối đa 5 lần/phút).
  - Tìm user qua `prisma.user.findUnique({ where: { email } })`.
  - Kiểm tra mật khẩu qua `bcrypt.compare`.
  - Kiểm tra cờ `isActive`.
  - Thu thập danh sách vai trò từ `userRoles` và quyền hạn từ `rolePermissions`.
  - Ký JWT token chứa `UserSession` payload (`userId`, `employeeId`, `email`, `fullName`, `departmentId`, `roles`, `permissions`, `isActive`).
  - Thiết lập cookie `antigravity_session` HttpOnly, Secure (khi production), SameSite=Lax.
- **Hạn chế:** Payload JWT chưa hề chứa `organizationId`, `organizationStatus`, hoặc `membershipRole`.

### 2.2. Authorization Flow Hiện Tại
- **Tầng Middleware (`src/middleware.ts`):**
  - Chống giả mạo CSRF qua kiểm tra header Origin / Referer trên các request sửa đổi dữ liệu.
  - Kiểm tra token trên matcher `/dashboard/:path*`, `/admin/:path*`, `/hr/:path*`, `/manager/:path*`, `/portal/:path*`, `/api/v1/:path*`.
  - Chặn người dùng chưa đăng nhập hoặc tài khoản bị khóa (`isActive: false`).
- **Tầng Route Guard (`src/lib/auth/guard.ts`):**
  - `requireAuth()`: Yêu cầu session hợp lệ.
  - `requireRole(allowedRoles)`: Kiểm tra vai trò (Admin bypass toàn cục).
  - `requirePermission(permission)`: Kiểm tra quyền nguyên tử.
- **Lỗ hổng cốt lõi:** Toàn bộ hệ thống ủy quyền hiện tại chỉ là **RBAC phẳng (Flat RBAC)**. Một Admin của Tenant A có đầy đủ quyền hạn để đọc/sửa/xóa dữ liệu của Tenant B nếu không có lớp kiểm soát Organization Context.

### 2.3. Vị Trí Demo Login & Quick Fill
1. `src/app/login/page.tsx`:
   - Hàm `handleQuickFill(email)` gán email và điền mật khẩu mặc định.
   - 4 nút bấm demo nhanh: Admin (`admin@antigravity.internal`), HR (`hr@antigravity.internal`), Manager (`manager@antigravity.internal`), Employee (`employee@antigravity.internal`).
2. `src/app/page.tsx`:
   - Giao diện Trang chủ nhúng component `<DashboardClient />` với bộ chọn góc nhìn demo.
3. `src/components/dashboard/DashboardClient.tsx`:
   - Hàm `handleQuickLogin(email)` tự động gửi request đăng nhập ngầm với mật khẩu hardcoded.
4. `src/components/reports/ReportsClient.tsx`:
   - Hàm `handleQuickLogin` (dòng 247-265) cho phép đăng nhập nhanh không cần mật khẩu.

### 2.4. Vị Trí Demo Credentials
- Mật khẩu hardcoded: `'Antigravity@2026'` tại:
  - `src/app/login/page.tsx` (dòng 58, 134)
  - `src/components/dashboard/DashboardClient.tsx` (dòng 88)
  - `src/components/reports/ReportsClient.tsx` (dòng 254)
  - `src/lib/services/employee.service.ts` (dòng 185 - mật khẩu tạo nhân sự mới)
  - `prisma/seed.ts` (dòng 13)
- Email demo mẫu: `admin@antigravity.internal`, `hr@antigravity.internal`, `manager.tech@antigravity.internal`, `dev.an@antigravity.internal`,...

### 2.5. Vị Trí Seed Data
- Tệp `prisma/seed.ts` (1217 dòng code):
  - Khởi tạo toàn bộ dữ liệu giả lập Tân Phong Digital JSC.
  - Được kích hoạt qua script `npm run db:seed`.
  - Cấu hình `"prisma": { "seed": "tsx prisma/seed.ts" }` trong `package.json`.

### 2.6. Danh Sách Các Bảng Nghiệp Vụ (Business-Scoped)
Có **23 bảng nghiệp vụ** thuộc phạm vi hoạt động của doanh nghiệp cần được cách ly:
1. `departments`
2. `positions`
3. `worksites`
4. `employees`
5. `work_shifts`
6. `employee_schedules`
7. `recurring_schedules`
8. `attendance`
9. `attendance_adjustments`
10. `qr_attendance_tokens`
11. `leave_types`
12. `leave_requests`
13. `holidays`
14. `kpis`
15. `employee_kpi_results`
16. `employee_bonuses_penalties`
17. `payroll_rules`
18. `payroll_periods`
19. `payroll`
20. `payroll_details`
21. `payroll_approvals`
22. `payroll_adjustments`
23. `company_settings`

### 2.7. Danh Sách Models Cần Bổ Sung `organizationId`
- **Các bảng độc lập chính (Primary Entities):**
  - `Department` $\to$ thêm `organizationId`
  - `Position` $\to$ thêm `organizationId`
  - `Worksite` $\to$ thêm `organizationId`
  - `Employee` $\to$ thêm `organizationId`
  - `WorkShift` $\to$ thêm `organizationId`
  - `EmployeeSchedule` $\to$ thêm `organizationId`
  - `RecurringSchedule` $\to$ thêm `organizationId`
  - `Attendance` $\to$ thêm `organizationId`
  - `AttendanceAdjustment` $\to$ thêm `organizationId`
  - `QrAttendanceToken` $\to$ thêm `organizationId`
  - `LeaveType` $\to$ thêm `organizationId`
  - `LeaveRequest` $\to$ thêm `organizationId`
  - `Holiday` $\to$ thêm `organizationId`
  - `Kpi` $\to$ thêm `organizationId`
  - `EmployeeKpiResult` $\to$ thêm `organizationId`
  - `EmployeeBonusPenalty` $\to$ thêm `organizationId`
  - `PayrollRule` $\to$ thêm `organizationId`
  - `PayrollPeriod` $\to$ thêm `organizationId`
  - `Payroll` $\to$ thêm `organizationId`
  - `PayrollAdjustment` $\to$ thêm `organizationId`
  - `AuditLog` $\to$ thêm `organizationId` (nullable cho Platform events)
  - `Notification` $\to$ thêm `organizationId` (nullable cho System alerts)
  - `CompanySetting` $\to$ thêm `organizationId`
- **Các bảng chi tiết phụ (Sub-items):**
  - `PayrollDetail` (có thể truy xuất qua `Payroll.organizationId`, khuyến nghị denormalize để index query an toàn)
  - `PayrollApproval` (truy xuất qua `PayrollPeriod.organizationId`)

### 2.8. Danh Sách Models Cần `branchId` (Operational Scope)
- `Branch` (Model mới, quan hệ 1-N với `Organization`)
- `Employee` (`branchId?`: liên kết nhân viên với chi nhánh làm việc)
- `Worksite` (`branchId?`: liên kết địa điểm chấm công / geofence với chi nhánh)
- `Attendance` (`branchId?`: ghi nhận chi nhánh nơi diễn ra chấm công)

### 2.9. Rà Soát Các Chỉ Mục `@unique` Toàn Cầu Cần Chuyển Sang Scoped
Các ràng buộc `@unique` đơn lẻ hiện tại sẽ gây xung đột dữ liệu giữa các tenant (ví dụ Tenant A và Tenant B đều có nhân viên mã `EMP001` hoặc phòng ban mã `HR`):
1. `Department.code`: chuyển thành `@@unique([organizationId, code])`
2. `Position.code`: chuyển thành `@@unique([organizationId, code])`
3. `WorkShift.code`: chuyển thành `@@unique([organizationId, code])`
4. `Employee.employeeCode`: chuyển thành `@@unique([organizationId, employeeCode])`
5. `LeaveType.code`: chuyển thành `@@unique([organizationId, code])`
6. `Kpi.code`: chuyển thành `@@unique([organizationId, code])`
7. `PayrollRule.code`: chuyển thành `@@unique([organizationId, code])`
8. `PayrollPeriod.code`: chuyển thành `@@unique([organizationId, code])`
9. `CompanySetting.key`: chuyển thành `@@id([organizationId, key])`
*(Lưu ý: `User.email` giữ `@unique` toàn cầu để phục vụ xác thực người dùng tập trung).*

### 2.10. Rà Soát Các API Có Nguy Cơ Cross-Tenant Leakage (IDOR)
Toàn bộ **22 API endpoints** trong `src/app/api/v1/` đều có nguy cơ rò rỉ chéo dữ liệu nếu chưa được bổ sung Tenant Guard:
- `GET /api/v1/employees`: Danh sách nhân viên (Lộ thông tin cá nhân, lương).
- `GET /api/v1/employees/[id]`: Truy vấn theo UUID không kiểm tra tenant ownership (IDOR).
- `GET /api/v1/attendance`: Danh sách chấm công thời gian thực.
- `GET /api/v1/leaves`: Đơn xin nghỉ phép và giải trình công.
- `GET /api/v1/payroll/periods` & `[id]`: Bảng lương doanh nghiệp và thông số thuế.
- `GET /api/v1/reports`: Tổng hợp dữ liệu chấm công, đi muộn, làm thêm giờ, quỹ lương.
- `GET /api/v1/dashboard/*`: Thống kê tổng hợp toàn hệ thống.

### 2.11. Background Jobs Hiện Tại
- **Vị trí:** `src/lib/jobs/job-runner.ts` & `src/app/api/v1/jobs/run/route.ts`.
- **Danh sách jobs:**
  1. `daily-attendance-reconciliation`: Tự động quét và đánh dấu vắng mặt không phép.
  2. `notification-pruning`: Dọn dẹp thông báo cũ quá 90 ngày.
  3. `cache-warming`: Nạp sẵn cache danh mục.
- **Rủi ro:** Các job này hiện query phẳng trên toàn database. Cần nâng cấp để duyệt qua từng Organization có trạng thái `ACTIVE`.

### 2.12. File Upload & Document Storage
- **Vị trí:** `src/app/api/v1/uploads/avatar/route.ts` & `src/lib/services/document.service.ts`.
- **Cơ chế lưu trữ:** File hệ thống cục bộ (`public/uploads/avatars/` hoặc disk).
- **Rủi ro:** Tên file đặt theo `avatar_${userId}_...` và truy cập qua URL tĩnh `/api/v1/avatars/...`. Không có ranh giới thư mục theo tenant.

### 2.13. Báo Cáo & Xuất Dữ Liệu (Reports & Export)
- **Vị trí:** `src/lib/services/report.service.ts` (1178 dòng code).
- **Hỗ trợ định dạng:** Excel (`exceljs`), PDF (`pdfkit`), CSV.
- **Rủi ro:** Các hàm tạo báo cáo (`generateAttendanceReport`, `generatePayrollReport`,...) chỉ lọc theo `departmentId`, `startDate`, `endDate`, **hoàn toàn chưa có `organizationId`**.

### 2.14. Bộ Nhớ Tạm (Cache System)
- **Vị trí:** `src/lib/cache/cache-manager.ts`.
- **Kiến trúc:** L1 In-Memory LRU Cache + L2 Redis Fallback.
- **Rủi ro:** Các cache key hiện đang dùng chuỗi tĩnh toàn cầu:
  - `lookup:worksites:active`
  - `lookup:payroll_rule:default`
  - `lookup:setting:${key}`
  $\implies$ Bắt buộc phải chuyển đổi cache key có namespace: `lookup:org:${orgId}:...` để tránh việc Tenant B đọc nhầm cấu hình của Tenant A.

### 2.15. Tác Vụ Định Kỳ (Cron)
- **Vị trí:** `src/app/api/v1/jobs/run/route.ts`.
- **Bảo mật hiện tại:** Header `Authorization: Bearer <CRON_SECRET>` hoặc Admin session.
- **Rủi ro:** Chưa hỗ trợ truyền tham số `organizationId` để kích hoạt job cho một tenant cụ thể.

### 2.16. Rủi Ro Dữ Liệu Hiện Hữu Trên Production (Data Migration Risks)
- Cơ sở dữ liệu Supabase hiện tại đang lưu trữ bộ dữ liệu mẫu Tân Phong Digital JSC (tạo ra từ `seed.ts`).
- **Nguy cơ lỗi cú pháp khi thêm trường mới:** Nếu thêm `organizationId String` (bắt buộc - NOT NULL) vào schema Prisma, lệnh migration sẽ lập tức báo lỗi vì các bản ghi hiện tại đang có giá trị `NULL`.
- **Giải pháp an toàn (Zero Data Loss Protocol):**
  1. Tạo bảng `organizations`, `organization_members`, `branches`.
  2. Tạo sẵn 1 Organization mặc định: `Tan Phong Digital JSC` (slug: `tan-phong-digital`, status: `ACTIVE`).
  3. Thêm trường `organizationId String?` (cho phép null) ở bước 1.
  4. Chạy script migration gán toàn bộ dữ liệu hiện tại vào Organization mặc định này.
  5. Nâng cấp trường `organizationId` thành `NOT NULL` và tạo ràng buộc khóa ngoại (Foreign Key) an toàn 100%.

---

## 3. BẢN ĐỒ TRUY VẤN CƠ SỞ DỮ LIỆU (DATABASE ACCESS INVENTORY)
Tổng cộng có **39 tệp mã nguồn** trực tiếp thực thi truy vấn Prisma, bao gồm:
- **findMany:** 184 điểm gọi (các service danh sách, thống kê, báo cáo).
- **findUnique / findFirst:** 96 điểm gọi (kiểm tra tài khoản, chi tiết nhân sự, bản ghi chấm công).
- **update / updateMany:** 62 điểm gọi (cập nhật trạng thái duyệt, sửa thông tin nhân viên).
- **delete / deleteMany:** 18 điểm gọi (chủ yếu là xóa ca định kỳ, dọn thông báo, hủy đơn).
- **$transaction:** 14 khối xử lý nghiệp vụ phức tạp (Tạo nhân viên + User + Role; Chấm công + Roster; Khóa bảng lương + Audit log).

---

## 4. KẾT LUẬN & ĐÁNH GIÁ CHUNG
- **Mức độ sẵn sàng cho Multi-Tenant:** Hệ thống có kiến trúc Service-oriented rất mạch lạc, tách biệt rõ ràng giữa Controller, Service, Validation và Database Layer. Điều này tạo thuận lợi lớn để tiêm (inject) `organizationId` vào tầng Service mà không phải viết lại logic tính toán cốt lõi.
- **Rủi ro rò rỉ dữ liệu:** **CRITICAL** (ở trạng thái hiện tại nếu có 2 doanh nghiệp cùng đăng nhập mà chưa áp dụng Tenant Context).
- **Đánh giá kiểm toán Phase 1:** **WARNING** (Cần nâng cấp kiến trúc có kiểm soát, bảo tồn 100% logic payroll và nghiệp vụ đã xây dựng).
