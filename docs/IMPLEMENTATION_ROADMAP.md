# ANTIGRAVITY MASTER PROJECT — PRODUCTION IMPLEMENTATION ROADMAP
**Lộ Trình Triển Khai Thực Chiến Toàn Diện (Phase 0 đến Phase 10)**  
*Document Version: 1.0.0 | Status: APPROVED | Target: Zero-Mocks, Production-Ready Modular Monolith*

---

## 1. NGUYÊN TẮC THI HÀNH LỘ TRÌNH (EXECUTION PRINCIPLES)

1. **Tuân thủ kỷ luật Phase-Gate**: Tuyệt đối không chuyển sang giai đoạn kế tiếp nếu giai đoạn hiện tại chưa vượt qua toàn bộ các kiểm thử:
   $$\text{Build Pass} \;\land\; \text{Migration Pass} \;\land\; \text{Lint Pass} \;\land\; \text{TypeCheck Pass} \;\land\; \text{Unit/Integration Tests Pass}$$
2. **Không Mock / Không Giả Lập**: Mọi API, schema, validation, tính toán tài chính, giao diện và nút bấm đều phải gắn với logic nghiệp vụ thực và cơ sở dữ liệu thật.
3. **Mỗi giai đoạn kết thúc bằng báo cáo nghiệm thu**: Tự động sinh file `PHASE_X_COMPLETION.md` với đầy đủ số liệu kiểm định thực tế.

---

## 2. LỘ TRÌNH TỪNG GIAI ĐOẠN (PHASE-BY-PHASE BREAKDOWN)

```
[Phase 0: Phân Tích & Thiết Kế Kiến Trúc Hệ Thống]
       |
       v
[Phase 1: Môi Trường, Docker, Prisma Schema & Database Seeding]
       |
       v
[Phase 2: IAM, Authentication, RBAC Guard & Audit Log Bất Biến]
       |
       v
[Phase 3: Cơ Cấu Tổ Chức & Quản Lý Hồ Sơ Nhân Sự Master]
       |
       v
[Phase 4: Ca Làm Việc & Lập Lịch Phân Ca Đổi Ca Linh Hoạt]
       |
       v
[Phase 5: Động Cơ Chấm Công QR Động & GPS Geofencing]
       |
       v
[Phase 6: Quản Lý Nghỉ Phép & Giải Trình Khiếu Nại Công]
       |
       v
[Phase 7: Quản Trị Mục Tiêu KPI & Đánh Giá Hiệu Suất Định Kỳ]
       |
       v
[Phase 8: Thưởng Phạt & Động Cơ Tính Lương Toàn Diện (Payroll Engine)]
       |
       v
[Phase 9: Dashboard BI Quản Trị, Phân Tích & Hệ Thống Thông Báo]
       |
       v
[Phase 10: Kiểm Thử E2E Toàn Trình, Gia Cố Bảo Mật & Đóng Gói Docker Production]
```

---

### Phase 0: Phân Tích & Thiết Kế Kiến Trúc Hệ Thống (HIỆN TẠI)
- **Mục tiêu**: Làm rõ toàn bộ yêu cầu chức năng, phi chức năng, ranh giới module, rủi ro cơ sở dữ liệu, bài toán tính lương, bảo mật và cơ chế phân quyền.
- **Sản phẩm bàn giao**:
  - `ARCHITECTURE.md`
  - `DATABASE_DESIGN.md`
  - `API_DESIGN.md`
  - `RBAC_MATRIX.md`
  - `PAYROLL_ARCHITECTURE.md`
  - `IMPLEMENTATION_ROADMAP.md`
  - `PHASE_0_COMPLETION.md`
- **Tiêu chuẩn nghiệm thu (Acceptance Criteria)**:
  - 100% tài liệu kiến trúc được xây dựng chi tiết, rõ ràng, không có khoảng trống mơ hồ.
  - Sơ đồ quan hệ thực thể (ERD), ma trận phân quyền, công thức tính toán tài chính được chuẩn hóa theo luật lao động.

---

### Phase 1: Môi Trường, Docker, Prisma Schema & Database Seeding
- **Mục tiêu**: Khởi tạo dự án Next.js 14/15 App Router với TypeScript, cấu hình Tailwind CSS, cấu hình Docker Compose (PostgreSQL 16 + Redis), viết schema Prisma hoàn chỉnh cho 20+ bảng dữ liệu, tạo migration đầu tiên và viết script seed dữ liệu mẫu đầy đủ.
- **Sản phẩm bàn giao**:
  - `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`
  - `docker-compose.yml` (PostgreSQL, Redis, Health checks)
  - `prisma/schema.prisma` (Chứa đầy đủ các quan hệ, indexes, constraints)
  - `prisma/migrations/*` (Migration sạch, không lỗi)
  - `prisma/seed.ts` (Tạo sẵn Super Admin, HR, Trưởng phòng, Nhân viên, Phòng ban, Ca làm việc, Địa điểm GPS, v.v.)
- **Tiêu chuẩn nghiệm thu**:
  - Chạy `docker compose up -d` và `npx prisma migrate dev` thành công 100%.
  - Chạy `npx prisma db seed` tạo dữ liệu chuẩn thành công.

---

### Phase 2: IAM, Authentication, RBAC Guard & Audit Log Bất Biến
- **Mục tiêu**: Xây dựng hệ thống đăng nhập an toàn (HttpOnly Secure Cookie, JWT Session/Database Session), Password Hashing bằng Argon2/bcrypt, Middleware phân quyền RBAC đa cấp (Role + Permission + Data Scoping), và Module Audit Log tự động ghi lại mọi thao tác quan trọng.
- **Sản phẩm bàn giao**:
  - `src/lib/auth/*` (Password hash, JWT sign/verify, Session manager)
  - `src/lib/auth/guard.ts` & `src/middleware.ts` (RBAC interceptor)
  - `src/lib/audit/logger.ts` (Tự động ghi vết IP, User-Agent, Old/New payload)
  - Màn hình Đăng nhập hiện đại (Luxury Dark/Light theme, form validation Zod)
  - Unit tests cho Auth, RBAC guards và Audit logger.
- **Tiêu chuẩn nghiệm thu**:
  - Đăng nhập đúng cấp quyền chính xác, đăng nhập sai bị khóa/báo lỗi rõ ràng.
  - Người dùng vai trò `EMPLOYEE` không thể truy cập API hay trang của `HR_ADMIN`.

---

### Phase 3: Cơ Cấu Tổ Chức & Quản Lý Hồ Sơ Nhân Sự Master
- **Mục tiêu**: Xây dựng toàn bộ giao diện và API quản lý Cây phòng ban, Danh mục chức vụ, Địa điểm làm việc (kèm bản đồ thiết lập tọa độ Geofence), và Hồ sơ nhân sự Master (Thêm, Sửa, Lọc nâng cao, Phân trang, Xem chi tiết, Đổi trạng thái).
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/organization/*`, `/api/v1/employees/*`
  - Components: `DepartmentTree`, `WorksiteMapPicker`, `EmployeeTable`, `EmployeeFormModal`, `EmployeeDetailDrawer`
  - Validation: Zod schemas cho thông tin cá nhân, CCCD, tài khoản ngân hàng, hợp đồng lao động.
- **Tiêu chuẩn nghiệm thu**:
  - Tạo mới nhân viên tự động cấp tài khoản User và gắn vai trò phù hợp.
  - Ràng buộc dữ liệu: Không thể xóa phòng ban đang có nhân sự trực thuộc.

---

### Phase 4: Ca Làm Việc & Lập Lịch Phân Ca Đổi Ca Linh Hoạt
- **Mục tiêu**: Quản lý danh mục Ca làm việc (hỗ trợ ca xuyên đêm, ân hạn đi muộn/về sớm), Bảng phân lịch làm việc trực quan theo tháng/tuần (Monthly Roster), và Quy trình gửi/duyệt đơn xin đổi ca làm việc giữa các nhân sự.
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/schedules/*`, `/api/v1/schedules/swap-request/*`
  - UI: `ShiftManager`, `RosterMonthlyGrid` (hỗ trợ xếp ca hàng loạt), `ShiftSwapModal`
  - Engine: Roster conflict detector (ngăn xếp 2 ca chồng chéo hoặc cách nhau dưới 8 tiếng).
- **Tiêu chuẩn nghiệm thu**:
  - Xếp lịch thành công cho 100 nhân viên trong 1 tháng mà không bị lỗi duplicate key.
  - Quy trình đổi ca cập nhật lịch làm việc của cả 2 nhân viên sau khi Quản lý phê duyệt.

---

### Phase 5: Động Cơ Chấm Công QR Động & GPS Geofencing
- **Mục tiêu**: Triển khai 2 phương thức chấm công hiện đại không thể làm giả: Màn hình Kiosk hiển thị Dynamic Rotating QR Code (thay đổi sau mỗi 20s) và Chấm công di động qua GPS Geofencing (tính khoảng cách Haversine). Xây dựng công cụ phân tích đi muộn, về sớm, tính giờ làm việc thực tế tự động.
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/attendance/qr/*`, `/api/v1/attendance/check-in/*`, `/api/v1/attendance/my-logs`
  - UI: `KioskQrDisplay` (WebSocket / Auto-refresh), `MobileCheckInButton` (kèm xác thực vị trí thời gian thực), `AttendanceLogTable`
  - Calculations: Thuật toán xác định trạng thái `PRESENT`, `LATE`, `EARLY`, `HALF_DAY`, `ABSENT`.
- **Tiêu chuẩn nghiệm thu**:
  - Mã QR hết hạn sau 20 giây sẽ bị từ chối với lỗi `QR_EXPIRED`.
  - Tọa độ GPS nằm ngoài bán kính cho phép của Worksite bị từ chối với lỗi `OUT_OF_GEOFENCE`.
  - Chấm công tính chính xác số phút đi muộn (đã bù trừ thời gian ân hạn).

---

### Phase 6: Quản Lý Nghỉ Phép & Giải Trình Khiếu Nại Công
- **Mục tiêu**: Quản lý quỹ phép năm cá nhân, quy trình tạo đơn xin nghỉ phép (nghỉ phép năm, ốm đau, việc riêng, thai sản), và quy trình nộp đơn giải trình chấm công kèm hình ảnh/bằng chứng khi gặp sự cố, có luồng phê duyệt từ Trưởng bộ phận.
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/leave/*`, `/api/v1/attendance/adjustments/*`
  - UI: `LeaveRequestForm`, `LeaveApprovalQueue`, `LeaveBalanceCard`, `AttendanceAdjustmentModal`
  - Business Logic: Tự động trừ số ngày phép trong quỹ khi đơn được duyệt; tự động cập nhật lại giờ công của bảng `attendance` khi giải trình được chấp thuận.
- **Tiêu chuẩn nghiệm thu**:
  - Nhân viên không thể nộp đơn xin nghỉ vượt quá số ngày phép còn lại (đối với phép năm).
  - Đơn giải trình được duyệt lập tức tính lại giờ làm việc và trạng thái ngày công tương ứng.

---

### Phase 7: Quản Trị Mục Tiêu KPI & Đánh Giá Hiệu Suất Định Kỳ
- **Mục tiêu**: Xây dựng thư viện chỉ số KPI, cơ chế gán KPI cho nhân viên theo chu kỳ tháng, giao diện tự chấm điểm (Self-review), giao diện Trưởng bộ phận chấm điểm và nhận xét (Manager review), tự động tính điểm tổng hợp theo trọng số (Weighted Score).
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/kpi/*`
  - UI: `KpiLibraryView`, `KpiAssignmentModal`, `KpiReviewForm`, `DepartmentKpiSummaryTable`
  - Logic: Kiểm tra tổng trọng số của một nhân sự bắt buộc phải bằng 100%.
- **Tiêu chuẩn nghiệm thu**:
  - Quy trình đánh giá 2 bước khép kín và tạo bản ghi điểm số cuối cùng để kết chuyển sang động cơ tính lương.

---

### Phase 8: Thưởng Phạt & Động Cơ Tính Lương Toàn Diện (Payroll Engine)
- **Mục tiêu**: Quản lý quyết định Thưởng/Phạt phát sinh, xây dựng Động cơ tính lương tự động (Batch Payroll Engine) đọc dữ liệu từ Công, Nghỉ phép, KPI, Thưởng phạt, Hợp đồng; tính toán chính xác Bảo hiểm và Thuế TNCN lũy tiến từng phần; quy trình phê duyệt bảng lương đa tầng; phát hành Phiếu lương điện tử (Payslip) và xuất PDF.
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/rewards-penalties/*`, `/api/v1/payroll/*`
  - Engine: `PayrollCalculationService` (Sử dụng `Decimal.js`, bọc trong transaction an toàn, bảo đảm tính Idempotent)
  - UI: `PayrollPeriodManager`, `PayrollMasterSheet`, `PayrollApprovalWorkflow`, `DigitalPayslipView`, `PayslipPdfRenderer`
- **Tiêu chuẩn nghiệm thu**:
  - Kiểm thử khớp 100% với kịch bản kế toán thực tế: Lương thời gian, BHXH 8%, BHYT 1.5%, BHTN 1%, giảm trừ gia cảnh 11M + 4.4M/người, biểu thuế 7 bậc chuẩn xác đến từng đồng VNĐ.
  - Kỳ lương khi đã `LOCKED` thì không thể sửa đổi.

---

### Phase 9: Dashboard BI Quản Trị, Phân Tích & Hệ Thống Thông Báo
- **Mục tiêu**: Xây dựng màn hình Dashboard tổng thể cho C-Level/HR với biểu đồ trực quan (Recharts): cơ cấu nhân sự, biến động quân số, tỷ lệ đi làm đúng giờ, chi phí quỹ lương theo phòng ban; tích hợp hệ thống thông báo In-app thời gian thực khi có đơn từ cần duyệt hoặc thông báo lương.
- **Sản phẩm bàn giao**:
  - API Routes: `/api/v1/analytics/*`, `/api/v1/notifications/*`
  - UI: `ExecutiveDashboard`, `AttendanceAnalyticsWidget`, `PayrollCostChart`, `NotificationBellDropdown`
- **Tiêu chuẩn nghiệm thu**:
  - Biểu đồ tải nhanh, phản ánh đúng dữ liệu thực từ PostgreSQL, có bộ lọc theo tháng và theo phòng ban.

---

### Phase 10: Kiểm Thử E2E Toàn Trình, Gia Cố Bảo Mật & Đóng Gói Docker Production
- **Mục tiêu**: Viết bộ kịch bản kiểm thử tích hợp E2E (Playwright), kiểm tra tải (Load test), rà soát bảo mật (Security audit: OWASP Top 10, SQLi, XSS, CSRF, Rate-limit, CORS), tối ưu hóa Build bundle, và hoàn thiện Dockerfile production nhiều tầng (Multi-stage build).
- **Sản phẩm bàn giao**:
  - E2E Test Suite: Kịch bản từ Tiếp nhận nhân sự -> Xếp ca -> Chấm công QR/GPS -> Duyệt phép -> Chấm KPI -> Tính lương -> Xem phiếu lương.
  - `Dockerfile.production`, `docker-compose.prod.yml`
  - CI/CD Configuration (`.github/workflows/ci.yml`)
- **Tiêu chuẩn nghiệm thu**:
  - 100% kịch bản E2E vượt qua thành công.
  - Ứng dụng khởi chạy hoàn hảo trong môi trường container với hiệu năng cao.
