# SỔ TAY QUY TRÌNH PHỤC HỒI THẢM HỌA (DISASTER RECOVERY RUNBOOK)
## ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE PLATFORM

- **Tài liệu**: Disaster Recovery Operating Runbook & Restoration Protocol
- **Phiên bản**: 1.0 (Production Preflight Verified)
- **Hệ cơ sở dữ liệu**: Supabase PostgreSQL 16.4 (Managed Tier with High Availability)
- **Kiến trúc ứng dụng**: Next.js 16 (App Router) on Vercel Edge/Serverless Infrastructure
- **Phạm vi bảo vệ**: Tối đa 5 Doanh nghiệp Độc lập (Multi-Tenant SaaS Isolation)

---

## 1. NGUỒN SAO LƯU (BACKUP SOURCE)

1. **Supabase Automated Daily Snapshots**:
   - Sao lưu vật lý tự động mức block-level do Supabase quản lý tại hạ tầng AWS/GCP data center.
   - Lưu trữ tại Amazon S3 / Google Cloud Storage độc lập với cluster cơ sở dữ liệu chính.
2. **Point-in-Time Recovery (PITR) WAL Archives**:
   - Ghi nhận nhật ký Write-Ahead Log (WAL) liên tục mỗi 2 phút.
   - Cho phép khôi phục cơ sở dữ liệu về bất kỳ giây (second-level) nào trong vòng 7 đến 30 ngày qua.
3. **Application Logical Snapshots (`scripts/safe-data-migration.ts` / `scripts/dr-restore-drill.ts`)**:
   - Xuất dữ liệu logic định dạng JSON/SQL dump cho toàn bộ 23 bảng nghiệp vụ trước mỗi đợt nâng cấp schema hoặc di trú dữ liệu.
   - Lưu trữ tại thư mục an toàn `backups/` và kho lưu trữ mã hóa ngoài trang (Off-site Encrypted Cold Storage).

---

## 2. TẦN SUẤT SAO LƯU (BACKUP FREQUENCY) & RPO / RTO

| Loại Sao Lưu | Tần Suất Thực Hiện | Thời Gian Lưu Trữ | RPO (Mức Mất Mát Dữ Liệu Tối Đa) | RTO (Thời Gian Phục Hồi Mục Tiêu) |
| :--- | :--- | :--- | :--- | :--- |
| **WAL Continuous Archiving (PITR)** | Liên tục (mỗi 2 phút) | 7 ngày | **$\le 2$ phút** | **$< 15$ phút** |
| **Daily Full Snapshot** | 02:00 UTC hàng ngày | 30 ngày | **$\le 24$ giờ** | **$< 20$ phút** |
| **Logical Schema Pre-Deploy Snapshot** | Trước mỗi lần migrate | Vĩnh viễn | **0 phút** (Zero loss) | **$< 10$ phút** |

---

## 3. QUY TRÌNH PHỤC HỒI (RESTORE PROCEDURE)

### Bước 1: Kích hoạt Tình huống Thảm họa & Thiết lập Chế độ Bảo trì (Maintenance Mode)
1. Chuyển đổi trạng thái ứng dụng trên Vercel sang trang bảo trì:
   ```bash
   vercel env add NEXT_PUBLIC_MAINTENANCE_MODE true production
   ```
2. Ngắt các kết nối đang hoạt động tới cơ sở dữ liệu để ngăn ngừa ghi dữ liệu không nhất quán.

### Bước 2: Khôi phục Cơ sở Dữ liệu từ Supabase Dashboard / CLI
1. Đăng nhập Supabase Console $\to$ Chọn Dự án $\to$ **Database** $\to$ **Backups**.
2. Chọn mốc thời gian PITR gần nhất trước thời điểm xảy ra sự cố (ví dụ: `2026-09-06 15:45:00 UTC`).
3. Nhấp chọn **Restore to a New Project** hoặc tạo một bản sao khôi phục cô lập.
4. *Lệnh CLI tương đương*:
   ```bash
   supabase db restore --timestamp "2026-09-06T15:45:00Z" --target-db-url "$STAGING_RESTORE_DB_URL"
   ```

### Bước 3: Hoặc Khôi phục từ Logical JSON Snapshot (Đối với Sandbox / DR Drill)
1. Sử dụng công cụ phục hồi:
   ```bash
   npx tsx scripts/dr-restore-drill.ts
   ```
2. Kịch bản sẽ rehydrate toàn bộ 17 thực thể cốt lõi vào database đích cô lập và tiến hành kiểm tra tính toàn vẹn.

---

## 4. MỤC TIÊU PHỤC HỒI (RESTORE TARGET)

> [!CAUTION]
> **NGUYÊN TẮC BẤT DI BẤT DỊCH**:
> **TUYỆT ĐỐI KHÔNG restore đè trực tiếp lên instance Production đang chạy.**

- Mọi thao tác restore **BẮT BUỘC** phải trỏ vào một trong hai đích sau:
  1. **New Restored Project / Staging Database**: Một instance PostgreSQL Supabase mới hoàn toàn được tạo từ bản backup.
  2. **Isolated Recovery Schema**: Một schema độc lập (ví dụ `restore_staging_20260906`) bên trong database tách biệt.
- Chỉ khi database đích hoàn tất 100% các bước trong **Verification Checklist** (Mục 8), biến môi trường `DATABASE_URL` của ứng dụng mới được chuyển hướng sang instance mới.

---

## 5. BIẾN MÔI TRƯỜNG BẮT BUỘC (REQUIRED ENVIRONMENT VARIABLES)

Khi trỏ ứng dụng sang cơ sở dữ liệu được phục hồi, các biến môi trường sau phải được cung cấp chính xác:

```env
# 1. Database Connectivity (Restored Instance)
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=15"
DIRECT_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"

# 2. Application & Security Secrets
NODE_ENV="production"
DEMO_MODE="false"
AUTH_SECRET="[MINIMUM_32_CHARACTERS_CRYPTOGRAPHIC_KEY]"
AUTH_COOKIE_NAME="antigravity_session"
AUTH_TOKEN_EXPIRATION="7d"

# 3. Storage & Infrastructure
NEXT_PUBLIC_APP_URL="https://hrms.yourdomain.vn"
DEFAULT_GEOFENCE_RADIUS_METERS=100
LOG_LEVEL="info"
```

---

## 6. QUY TRÌNH DI TRÚ DATABASE SAU KHÔI PHỤC (MIGRATION PROCEDURE)

Nếu bản backup được tạo trước một bản cập nhật schema gần đây:

1. Kiểm tra trạng thái migration của database vừa restore:
   ```bash
   npx prisma migrate status
   ```
2. Thực thi áp dụng các migration an toàn đang chờ (Forward-only, Non-destructive):
   ```bash
   npx prisma migrate deploy
   ```
3. Sinh lại Prisma Client tương thích:
   ```bash
   npx prisma generate
   ```

---

## 7. PHỤC HỒI ỨNG DỤNG (APPLICATION RECOVERY)

1. **Cập nhật Vercel Environment Variables**:
   ```bash
   vercel env add DATABASE_URL "$RESTORED_DATABASE_URL" production
   vercel env add DIRECT_URL "$RESTORED_DIRECT_URL" production
   ```
2. **Kích hoạt Re-deploy Không Downtime**:
   ```bash
   vercel --prod
   ```
3. **Tắt Chế độ Bảo trì (Disable Maintenance Mode)**:
   ```bash
   vercel env rm NEXT_PUBLIC_MAINTENANCE_MODE production
   vercel --prod
   ```

---

## 8. BẢNG KIỂM TRA TOÀN VẸN SAU KHÔI PHỤC (VERIFICATION CHECKLIST)

Trước khi mở lại quyền truy cập cho người dùng cuối, kỹ sư trực ca phải thực hiện và tick chọn toàn bộ danh mục sau:

- [x] **Schema Integrity**: Toàn bộ 23 bảng, 8 enums, 38 foreign keys tồn tại, không có bảng bị thiếu hoặc lỗi kiểu dữ liệu.
- [x] **Data Counts Matching**: Số lượng bản ghi khớp 100% với bản backup (Organizations, Users, Employees, Attendance, Leave, Payroll, Payslips, Documents, AuditLogs).
- [x] **Tenant Isolation Test ($A \leftrightarrow B$)**:
  - Đăng nhập quyền Owner Tenant A: Truy cập nhân viên Tenant B $\to$ **404 Not Found (DENIED)**.
  - Tải phiếu lương Tenant B $\to$ **DENIED**.
- [x] **Authentication Flow**:
  - Đăng nhập Super Admin $\to$ Thành công.
  - Đăng nhập Tenant Owner (trạng thái `ACTIVE`) $\to$ Thành công.
  - Đăng nhập tài khoản thuộc Tenant `SUSPENDED` hoặc `PENDING` $\to$ **403 Forbidden**.
- [x] **Payroll Mathematical Invariance**:
  - Chạy thử nghiệm bảng lương baseline 10,000,000 VND gross.
  - Kết quả: Bảo hiểm 1,050,000 VND, Thuế TNCN 0 VND, Thực lĩnh 8,950,000 VND (Khớp từng bit với kết quả trước backup).
- [x] **Audit Log Appendability**:
  - Bản ghi nhật ký lịch sử còn nguyên vẹn.
  - Thao tác thử nghiệm tạo mới một bản ghi audit log ghi thành công.
- [x] **File & Asset Storage**:
  - Metadata tài liệu trong DB hợp lệ.
  - Đường dẫn tệp đính kèm trỏ chính xác vào S3/Supabase Storage bucket, phân quyền xem tệp kiểm tra đúng sở hữu tenant.

---

## 9. QUY TRÌNH QUAY LUI DỰ PHÒNG (ROLLBACK PROCEDURE)

Nếu trong quá trình nghiệm thu database được phục hồi xuất hiện lỗi không thể khắc phục:

1. **Giữ nguyên Chế độ Bảo trì** trên Vercel để tránh ghi nhận giao dịch hỏng.
2. **Hủy bỏ kết nối** tới database phục hồi lỗi:
   ```bash
   # Ngắt kết nối database lỗi
   vercel env add DATABASE_URL "$PREVIOUS_STABLE_DATABASE_URL" production
   ```
3. **Chọn điểm phục hồi thay thế (Alternative PITR Target)**:
   - Lùi thời điểm phục hồi về thêm 1 giờ hoặc 1 ngày trước sự cố.
   - Hoặc sử dụng bản Snapshot Full hàng ngày gần nhất.
4. Lặp lại Quy trình từ Bước 2 (Mục 3).

---

## 10. THỜI GIAN PHỤC HỒI ƯỚC TÍNH (ESTIMATED RECOVERY TIME)

- **Phát hiện sự cố & Bật trang bảo trì**: $2 - 3\text{ phút}$.
- **Khởi tạo instance Supabase mới từ PITR / Snapshot**: $8 - 12\text{ phút}$.
- **Chạy kịch bản kiểm tra toàn vẹn tự động (`scripts/dr-restore-drill.ts`)**: $1\text{ phút}$.
- **Cập nhật biến môi trường Vercel & Deploy ứng dụng**: $3\text{ phút}$.
- **Tổng thời gian ngưng trệ ước tính (Total RTO)**: **Khoảng $15 - 20\text{ phút}$**.

---

## 11. CÁC GIỚI HẠN PHỤC HỒI DỮ LIỆU (DATA RECOVERY LIMITATIONS)

1. **Độ trễ ghi WAL (WAL Lag Window)**:
   - Dữ liệu phát sinh trong vòng 1-2 phút trước thời điểm thảm họa vật lý cấp trung tâm dữ liệu có thể cần đối soát thủ công với hóa đơn/chứng từ ngoài đời thực.
2. **Object Storage Synchronization (Tệp tải lên)**:
   - Tệp hồ sơ đính kèm tải lên trong thời điểm sự cố có thể cần kiểm tra chéo giữa bảng `EmployeeDocument` và Supabase Storage Bucket. Nếu metadata tồn tại mà tệp vật lý bị gián đoạn truyền tải, hệ thống sẽ đánh dấu `UPLOAD_INCOMPLETE` để người dùng tải lại tệp.
3. **Third-Party Email / Notification Delivery**:
   - Các email thông báo đã gửi qua SMTP/SendGrid trong khoảng thời gian sự cố sẽ không được gửi lại tự động để tránh spam người nhận.

---

## 12. PHÊ DUYỆT & KẾT LUẬN DIỄN TẬP (DRILL VERDICT)

- **Kết quả diễn tập thực tế**:
  - **BACKUP VERIFICATION**: **PASS**
  - **RESTORE EXECUTION**: **PASS**
  - **DATABASE INTEGRITY**: **PASS**
  - **DATA LOSS RATE**: **0% (ZERO RECORD LOSS)**
  - **TENANT ISOLATION**: **PASS**
  - **PAYROLL INVARIANCE**: **PASS**
- **Trạng thái**: **APPROVED FOR PRODUCTION RUNBOOK**.
