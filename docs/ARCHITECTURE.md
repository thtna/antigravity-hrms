# ANTIGRAVITY MASTER PROJECT — SYSTEM ARCHITECTURE SPECIFICATION
**Hệ Thống Quản Lý Chấm Công – Nhân Sự – KPI – Thưởng Phạt – Tính Lương**  
*Document Version: 1.0.0 | Status: APPROVED | Target: Production-Grade Modular Monolith*

---

## 1. TỔNG QUAN HỆ THỐNG & ĐẶC TẢ DỰ ÁN

Dự án **Antigravity HRMS** là giải pháp phần mềm quản trị nguồn nhân lực (Enterprise Human Resource Management System) toàn diện, khép kín, được thiết kế để vận hành thực tế tại các doanh nghiệp vừa và lớn. Hệ thống liên kết chặt chẽ chu trình từ **Thông tin nhân sự -> Xếp ca -> Chấm công thực địa (QR động & GPS Geofencing) -> Quản lý nghỉ phép -> Đánh giá KPI -> Ghi nhận thưởng/phạt -> Động cơ tính lương tự động (Payroll Engine) -> Phê duyệt đa tầng -> Phát hành phiếu lương (Payslip) -> Báo cáo quản trị BI**.

---

## 2. PHÂN TÍCH YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)

### 2.1. Quản Trị Tổ Chức & Hồ Sơ Nhân Sự (HR & Organization Core)
- **Cơ cấu tổ chức**: Quản lý phòng ban theo cây phân cấp (hierarchical departments), chức vụ/chức danh (positions) với bậc lương và mô tả công việc.
- **Địa điểm làm việc (Worksites)**: Quản lý danh sách chi nhánh/văn phòng/nhà máy kèm tọa độ GPS (kinh độ, vĩ độ) và bán kính cho phép chấm công (geofence radius in meters).
- **Hồ sơ nhân viên (Employee Master Record)**:
  - Mã nhân viên (duy nhất, tự sinh theo quy chuẩn công ty: ví dụ `EMP-YYYY-XXXX`).
  - Thông tin cá nhân, định danh pháp lý (CCCD/CMND, ngày cấp, nơi cấp).
  - Thông tin tài chính: Số tài khoản ngân hàng, tên ngân hàng, mã số thuế cá nhân (MST), số người phụ thuộc giảm trừ gia cảnh.
  - Hợp đồng lao động: Loại hợp đồng (Thử việc, Xác định thời hạn, Không xác định thời hạn), ngày bắt đầu, ngày hết hạn, mức lương cơ bản đóng bảo hiểm, lương thỏa thuận, phụ cấp cố định.
  - Trạng thái công tác: Thử việc, Chính thức, Tạm hoãn hợp đồng, Đã nghỉ việc.

### 2.2. Ca Làm Việc & Lập Lịch Phân Ca (Work Shifts & Scheduling)
- **Định nghĩa Ca làm việc (Work Shifts)**:
  - Giờ bắt đầu, giờ kết thúc, thời gian nghỉ giữa ca (break minutes).
  - Cấu hình ca qua đêm (overnight shift, e.g. 22:00 -> 06:00 sáng hôm sau).
  - Thời gian ân hạn đi muộn / về sớm cho phép (Grace periods in minutes).
  - Hệ số lương ca (Shift multiplier: 1.0 cho ca ngày, 1.3 cho ca đêm).
- **Lịch làm việc (Employee Roster Scheduling)**:
  - Phân ca linh hoạt theo tuần/tháng cho từng nhân viên hoặc toàn bộ phòng ban.
  - Hỗ trợ đổi ca làm việc (Shift swap request) giữa 2 nhân sự có phê duyệt của Trưởng bộ phận.

### 2.3. Chấm Công Đa Phương Thức (Attendance & Time Tracking Engine)
- **Check-in / Check-out qua QR Code Động (Dynamic Rotating QR)**:
  - QR Code được hiển thị trên máy chấm công/máy tính bảng tại sảnh văn phòng, tự làm mới sau mỗi 15-30 giây (sử dụng thuật toán mã hóa TOTP/HMAC kèm timestamp và nonce bí mật) nhằm triệt tiêu hoàn toàn gian lận chụp ảnh gửi chấm công hộ.
- **Check-in / Check-out qua GPS Geofencing (Mobile/Web PWA)**:
  - Xác thực tọa độ thiết bị của nhân viên so với Worksites được phân bổ sử dụng công thức tính khoảng cách Haversine.
  - Chống giả lập tọa độ (Mock location detection & header fingerprinting).
- **Tính toán trạng thái chấm công tự động**:
  - Tự động đối soát thời gian check-in/out với lịch ca đã gán: Tính chính xác số phút đi muộn (Late minutes), số phút về sớm (Early minutes), giờ làm việc thực tế (Actual work hours), giờ làm thêm (Overtime hours).
  - Quy kết trạng thái ngày công: Đúng giờ, Đi muộn, Về sớm, Nửa công (Half-day), Nghỉ không phép (Absent), Nghỉ có phép (On Leave).

### 2.4. Quản Lý Nghỉ Phép & Giải Trình Chấm Công (Leave & Attendance Adjustments)
- **Chính sách ngày phép (Leave Entitlement & Policy)**:
  - Quản lý quỹ phép năm (Annual leave balance), phép thâm niên, phép ốm hưởng bảo hiểm, phép thai sản, nghỉ việc riêng có lương/không lương.
- **Quy trình nộp & duyệt đơn nghỉ phép**:
  - Nhân viên tạo đơn -> Trưởng phòng phê duyệt -> HR Admin duyệt chốt. Tự động trừ quỹ phép và cập nhật trạng thái ngày công.
- **Giải trình / Khiếu nại chấm công (Attendance Adjustments)**:
  - Cho phép nhân viên gửi yêu cầu bổ sung công (quên chấm công, lỗi thiết bị, đi công tác ngoài văn phòng) kèm bằng chứng để quản lý phê duyệt.

### 2.5. Quản Trị Mục Tiêu & Đánh Giá KPI (KPI & Performance Management)
- **Thiết lập thư viện KPI**: Định nghĩa chỉ số, đơn vị đo (Doanh thu, Tỷ lệ lỗi, Số task hoàn thành, v.v.), chỉ tiêu mục tiêu (Target), trọng số (Weight %).
- **Gán KPI & Đánh giá định kỳ**:
  - Gán bộ chỉ số theo vị trí hoặc cá nhân theo chu kỳ tháng/quý.
  - Quy trình tự đánh giá (Self-review) -> Quản lý trực tiếp đánh giá (Manager review).
  - Tính điểm tổng hợp (Weighted Performance Score) để chuyển hóa trực tiếp thành hệ số thưởng/phạt trong kỳ tính lương.

### 2.6. Quản Lý Thưởng & Phạt (Bonuses & Penalties)
- **Ghi nhận thưởng/phạt phát sinh**:
  - Thưởng: Thưởng nóng dự án, thưởng nhân viên xuất sắc, sáng kiến cải tiến.
  - Phạt: Phạt vi phạm nội quy, phạt làm mất mát tài sản, chế tài đi muộn lũy kế vượt khung.
- Phê duyệt và gắn thẻ nguồn gốc (metadata, người ký quyết định, ngày áp dụng) trước khi tự động kết chuyển vào bảng lương của kỳ tương ứng.

### 2.7. Động Cơ Tính Lương Toàn Diện (Enterprise Payroll Engine)
- **Kỳ tính lương (Payroll Period)**: Đóng/mở kỳ lương, khóa sổ dữ liệu (Freeze/Lock).
- **Thu thập dữ liệu nguồn tự động**: Tự động kết chuyển ngày công thực tế, giờ OT, phụ cấp, kết quả KPI, thưởng/phạt đã duyệt, nghỉ phép có hưởng lương.
- **Tính toán bảo hiểm bắt buộc theo luật lao động**:
  - BHXH (8%), BHYT (1.5%), BHTN (1%), Kinh phí công đoàn (1%).
  - Áp dụng trần đóng bảo hiểm theo mức lương cơ sở quy định.
- **Tính toán Thuế Thu Nhập Cá Nhân (PIT - Thuế TNCN)**:
  - Khấu trừ bản thân (11.000.000 VNĐ/tháng) và người phụ thuộc (4.400.000 VNĐ/người/tháng).
  - Tính toán theo biểu thuế lũy tiến từng phần chuẩn 7 bậc.
- **Phê duyệt bảng lương đa cấp (Multi-tier Approval)**:
  - `DRAFT` -> `CALCULATED` -> `REVIEWED_BY_HR` -> `APPROVED_BY_DIRECTOR` -> `LOCKED_AND_PAID`.
- **Phiếu lương điện tử (Digital Payslip)**:
  - Xuất phiếu lương chi tiết cho từng nhân viên, bảo mật xem riêng tư qua tài khoản cá nhân, hỗ trợ xuất PDF có đóng dấu số.

### 2.8. Báo Cáo, Phân Tích & Dashboard (BI & Reporting)
- **HR Dashboard**: Tổng số nhân sự, cơ cấu phòng ban, biến động nhân sự, tỷ lệ nghỉ việc (Turnover rate).
- **Attendance Analytics**: Tỷ lệ đi làm đúng giờ, top nhân viên đi muộn, thống kê giờ làm thêm (OT) theo bộ phận.
- **Payroll Distribution**: Phân bổ quỹ lương theo phòng ban, chi phí bảo hiểm, thuế TNCN, tỷ trọng thưởng/phạt.
- **Xuất dữ liệu**: Hỗ trợ kết xuất báo cáo Excel/CSV chuẩn theo form mẫu cơ quan thuế và bảo hiểm xã hội.

### 2.9. Hệ Thống Thông Báo, RBAC & Nhật Ký Kiểm Toán (Cross-Cutting Systems)
- **Thông báo đa kênh**: In-app notifications và email thông báo khi có đơn mới cần duyệt, phiếu lương phát hành, cảnh báo đi muộn.
- **Phân quyền dựa trên vai trò (Fine-grained RBAC)**: Quản lý quyền theo vai trò kết hợp Data-scoping (phạm vi dữ liệu theo phòng ban/toàn công ty).
- **Audit Log bất biến (Immutable Audit Trail)**: Ghi vết toàn bộ hành vi CRUD trên các thực thể nhạy cảm (Lương, Hợp đồng, Chấm công, Phân quyền).

---

## 3. PHÂN TÍCH YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

| Danh mục | Tiêu chuẩn kỹ thuật cam kết |
| :--- | :--- |
| **Tính toàn vẹn dữ liệu (ACID)** | Mọi giao dịch tài chính/chấm công/bảng lương đều nằm trong Database Transaction cô lập, không bao giờ có trạng thái dữ liệu rách (inconsistent state). |
| **Hiệu năng & Tải (Performance)** | - API Response Time: < 200ms cho 95% request thông thường.<br>- Batch Payroll Calculation: Tính toán bảng lương cho 1.000 nhân viên trong vòng dưới 10 giây.<br>- High-concurrency QR/GPS Check-in: Chịu tải đồng thời tối thiểu 500 requests/giây vào khung giờ cao điểm đầu ca làm việc. |
| **Bảo mật (Zero-Trust Security)** | - Mã hóa mật khẩu: Argon2id hoặc bcrypt (cost factor >= 12).<br>- Token-based Auth: JWT HttpOnly Secure Cookie với cơ chế Rotation & Blacklisting qua Redis/Database.<br>- Mã hóa cột dữ liệu nhạy cảm (CCCD, Số tài khoản ngân hàng, Mức lương) at-rest.<br>- Chống tấn công: SQL Injection (Prisma parameterized queries), XSS, CSRF, Replay Attack (TOTP nonces). |
| **Khả năng mở rộng (Scalability)** | Kiến trúc Modular Monolith chuẩn mực; phân ranh giới ngữ cảnh (Bounded Contexts) rõ ràng, sẵn sàng trích xuất thành Microservices khi quy mô vượt ngưỡng 50.000 nhân viên mà không phá vỡ logic nghiệp vụ. |
| **Giao diện & Trải nghiệm (UI/UX)** | - Responsive 100% (Desktop, Tablet, Mobile).<br>- Chuẩn thẩm mỹ: Modern Luxury Dark & Light Mode, viền kính glassmorphism tinh tế, bảng điều khiển mật độ thông tin cao, dễ đọc, không giật lag layout shift. |
| **Khả năng sẵn sàng (Availability)** | Cam kết 99.9% uptime, tích hợp Health Checks, Graceful Shutdown, Docker container hóa chuẩn production. |

---

## 4. BẢN ĐỒ NGỮ CẢNH TÊN MIỀN (DOMAIN MODEL & BOUNDED CONTEXTS)

Hệ thống được tổ chức theo kiến trúc **Modular Monolith** với 6 Bounded Contexts độc lập về mặt logic nghiệp vụ:

```
+-----------------------------------------------------------------------------------+
|                           ANTIGRAVITY HRMS CORE SYSTEM                            |
+-----------------------------------------------------------------------------------+
       |                        |                         |
       v                        v                         v
+--------------+        +---------------+         +-----------------+
| ORGANIZATION |        | TIME &        |         | PERFORMANCE &   |
| & HR CONTEXT |------->| ATTENDANCE    |-------->| COMPENSATION    |
|              |        | CONTEXT       |         | CONTEXT         |
+--------------+        +---------------+         +-----------------+
       |                        |                         |
       | Employees              | Shifts & Roster         | KPIs & Reviews  |
       | Departments            | QR & GPS Logs           | Bonuses/Fines   |
       | Positions              | Leaves & Holidays       | Payroll Engine  |
       | Worksites              | Overtime Engine         | Payslips        |
       |                        |                         |
       +------------------------+-------------------------+
                                |
                                v
       +--------------------------------------------------+
       |           CROSS-CUTTING FOUNDATION               |
       | - Identity & Access Management (RBAC)            |
       | - Immutable Audit Logging Engine                 |
       | - Multi-channel Notification Dispatcher          |
       | - System Configuration & Rule Registry           |
       +--------------------------------------------------+
```

### Module Boundaries & Interaction Rules:
1. **Zero Circular Imports**: Module con chỉ phụ thuộc vào Core Contracts/Interfaces, không gọi chéo trực tiếp gây vòng lặp luồng thực thi.
2. **Explicit Data Contracts**: Giao tiếp giữa các module thông qua Service Layer có kiểm định kiểu chặt chẽ bằng TypeScript & DTOs.
3. **Transaction Boundary Isolation**: Tính lương (Payroll) đọc snapshot dữ liệu từ Attendance và KPI, khóa dữ liệu nguồn để bảo đảm tính bất biến của kỳ tính toán.

---

## 5. CÁC ĐIỀU KIỆN TIỀN ĐỀ & GIẢ ĐỊNH (ASSUMPTIONS & DESIGN DECISIONS)

1. **Chu kỳ tính lương**: Mặc định áp dụng kỳ từ ngày 01 đến ngày cuối cùng của tháng dương lịch (có cấu hình linh hoạt từ ngày N đến ngày N-1 tháng sau cho doanh nghiệp có chu kỳ lệch).
2. **Quy tắc làm tròn tài chính**: Số tiền lương, thuế, bảo hiểm, thưởng phạt luôn được làm tròn đến hàng đơn vị VNĐ (không sử dụng số thập phân tiền tệ trong lưu trữ hiển thị, nhưng động cơ tính toán sử dụng `Decimal` để tránh sai số lũy kế).
3. **Chấm công qua đêm (Overnight Shift)**: Ca làm việc bắt đầu từ tối hôm trước đến sáng hôm sau được ghi nhận ngày công vào **ngày bắt đầu ca** để đảm bảo tính đồng nhất khi xếp lịch và tổng hợp công.
4. **Địa điểm chấm công (GPS Threshold)**: Bán kính geofence mặc định là 100 mét tính từ tâm tọa độ văn phòng; dung sai cảm biến GPS trên thiết bị di động được bù trừ tự động bằng thuật toán lọc nhiễu tọa độ.

---

## 6. PHÂN TÍCH RỦI RO NGHIỆP VỤ & KỸ THUẬT (CRITICAL ANALYSIS)

### 6.1. Những yêu cầu còn thiếu (Missing Requirements) & Giải pháp kiến trúc
- **Thiếu sót thường gặp**: Nhân sự vào làm giữa tháng (Mid-month joiners) hoặc nghỉ việc giữa tháng (Terminated employees).
  - *Giải pháp*: Xây dựng công thức tính lương theo tỷ lệ ngày công thực tế chuẩn hóa (Prorated salary engine: `(Lương cơ bản / Ngày công chuẩn) * Ngày công thực tế`).
- **Thiếu sót về giải trình công sau khi chốt lương**: Sau khi bảng lương đã `LOCKED`, nhân viên mới phát hiện sai sót chấm công.
  - *Giải pháp*: Cấm sửa đổi trực tiếp vào kỳ lương đã khóa; hệ thống hỗ trợ cơ chế "Truy thu / Truy lĩnh" (Retroactive Adjustment) tự động hạch toán khoản chênh lệch vào kỳ tính lương kế tiếp.

### 6.2. Mâu thuẫn nghiệp vụ tiềm tàng (Business Contradictions) & Thống nhất luồng
- **Mâu thuẫn**: Nhân viên vừa có đơn nghỉ phép được duyệt, vừa có log chấm công tại văn phòng trong cùng 1 ca.
  - *Quy tắc xử lý*: Hệ thống ưu tiên sự hiện diện thực tế (Actual physical attendance). Báo cáo sẽ gắn cờ cảnh báo (Conflict Flag) để HR xác nhận hủy đơn phép hoặc tính phụ cấp làm việc vào ngày nghỉ.
- **Mâu thuẫn ca gối đầu**: Xếp 2 ca làm việc cách nhau dưới 8 tiếng (vi phạm luật lao động về thời gian nghỉ ngơi giữa 2 ca).
  - *Quy tắc xử lý*: Scheduler Validation Engine sẽ chặn cứng (Hard Validation Error) ngay tại màn hình xếp lịch.

### 6.3. Nguy cơ tiềm ẩn về cơ sở dữ liệu (Database Pitfalls) & Khắc phục
- **Hiện tượng khóa dòng tranh chấp (Deadlock) khi tính lương đồng thời**: Khi nhiều quản trị viên cùng nhấn "Tính bảng lương" cho các phòng ban.
  - *Khắc phục*: Phân vùng khóa theo `department_id` và sử dụng `SELECT ... FOR UPDATE SKIP LOCKED` hoặc hàng đợi tuần tự (Sequential job execution).
- **Phình to bảng `attendance` (Data growth)**: 1.000 nhân viên tạo ra ~60.000 records mỗi tháng.
  - *Khắc phục*: Đánh Compound Index trên `(employee_id, work_date)` và `(schedule_id)`, phân vùng (Partitioning) theo `work_date` hàng năm.

### 6.4. Nguy cơ bảo mật tiềm ẩn (Security Vulnerabilities) & Biện pháp phòng vệ
- **Replay Attack với QR Check-in**: Nhân viên chụp ảnh màn hình mã QR gửi cho đồng nghiệp qua tin nhắn để chấm công từ xa.
  - *Biện pháp phòng vệ*: Mã QR chỉ chứa `nonce` có hạn sử dụng 20 giây sinh bởi TOTP, liên kết trực tiếp với WebSocket/Server-Sent Events của màn hình hiển thị. Khi quét, client bắt buộc phải gửi kèm tọa độ GPS để đối chiếu 2 lớp (Dual-factor verification: Dynamic QR + Proximity GPS).
- **IDOR (Insecure Direct Object References)**: Nhân viên sửa ID trên URL để xem phiếu lương hoặc đơn từ của người khác.
  - *Biện pháp phòng vệ*: Bắt buộc kiểm tra quyền sở hữu dữ liệu (Ownership Verification Middleware) ở cấp độ Repository/Service: `WHERE id = :id AND (employee_id = :currentUserEmployeeId OR :hasAdminPermission)`.
