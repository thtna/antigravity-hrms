# BÁO CÁO XÁC MINH NGUỒN VÀ PHƯƠNG ÁN PHỤC HỒI (RESTORE SOURCE VALIDATION)
## PHASE 10.6B-FINAL — THẨM ĐỊNH NGUỒN SAO LƯU TRƯỚC KHI CẤP CREDENTIALS

- **Ngày thẩm định**: 07/09/2026
- **Tập tin sao lưu hiện có**: [`backups/dr_backup_preflight_verified.json`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/backups/dr_backup_preflight_verified.json)
- **Mục tiêu**: Làm rõ bản chất kỹ thuật của nguồn backup, giới hạn phục hồi, và quy trình an toàn tuyệt đối trước khi kết nối cơ sở dữ liệu Supabase Staging.
- **Cam kết chấp hành**: **KHÔNG KẾT NỐI DATABASE • KHÔNG MIGRATE • KHÔNG RESTORE • KHÔNG GHI DỮ LIỆU • KHÔNG DEPLOY**.

---

## 1. BẢN CHẤT NGUỒN SAO LƯU (BACKUP SOURCE CLASSIFICATION)

Tệp [`backups/dr_backup_preflight_verified.json`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/backups/dr_backup_preflight_verified.json) được phân loại chính xác là:

> ### 📋 **PHÂN LOẠI: LOGICAL DATA SNAPSHOT**
> *(Không phải PostgreSQL Physical/Native Backup)*

### Chi tiết phân tích kỹ thuật:
1. **Nội dung tệp JSON**:
   - Chứa metadata: `backupTimestamp: "2026-09-06T15:45:00.000Z"`, engine `PostgreSQL 16.4`, Prisma Schema `5.22.0`.
   - Chứa các mảng bản ghi dữ liệu (DML rows) của 17 thực thể kinh doanh (Organizations, Users, Employees, Attendance, Leave, Payroll, Payslips, AuditLogs, Documents...).
2. **Khả năng phục hồi Schema**: **KHÔNG THỂ (NO)**.
   - Tệp JSON **không chứa** câu lệnh DDL (`CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`).
   - Tệp JSON **không chứa** các đối tượng tầng sâu của PostgreSQL:
     - ❌ **Indexes**: Không có định nghĩa B-Tree, GiST hay Partial Indexes.
     - ❌ **Constraints & Foreign Keys**: Không có cú pháp ràng buộc vật lý.
     - ❌ **Enums**: Không có lệnh `CREATE TYPE ... AS ENUM`.
     - ❌ **Sequences**: Không có trạng thái `pg_sequences` hay auto-increment counter.
     - ❌ **Functions & Triggers**: Không có mã PL/pgSQL.
     - ❌ **Extensions**: Không có định nghĩa extensions (như `uuid-ossp`, `pgcrypto`).
     - ❌ **Migration History**: Không chứa bảng lịch sử `_prisma_migrations`.
3. **Kết luận**:
   - Tệp JSON này **CHỈ PHỤC HỒI ĐƯỢC DỮ LIỆU (DATA RECOVERY)** sau khi schema đã được khởi tạo sẵn bằng công cụ DDL (Prisma migration).

---

## 2. RÀ SOÁT BẢN SAO LƯU POSTGRESQL NGUYÊN BẢN (NATIVE POSTGRES BACKUP AUDIT)

Rà soát toàn bộ cây thư mục repository của dự án:
- Tìm kiếm các tệp định dạng: `*.dump`, `*.tar`, `*.sql`, `pg_dump` outputs.
- **Kết quả rà soát thực tế**:
  - Tệp `.sql` duy nhất tìm thấy: `docker/postgres/init/01-extensions.sql` (chỉ bật extension `uuid-ossp`).
  - **Không có bất kỳ tệp dump vật lý nào** (`pg_dump -Fc` hoặc `pg_dump --clean`).

> ### 🛑 **KẾT QUẢ: NATIVE POSTGRES BACKUP = NOT AVAILABLE IN REPOSITORY**
> *(Tuyệt đối không giả định JSON snapshot là một bản backup PostgreSQL hoàn chỉnh)*

---

## 3. PHÂN ĐỊNH RÕ RÀNG CÁC KHÁI NIỆM (RESTORE DEFINITIONS)

Hệ thống thiết lập định nghĩa phân loại chuẩn mực:

1. **MIGRATION (`npx prisma migrate deploy`)**:
   - Là việc **thay đổi cấu trúc Schema (DDL)** dựa trên các tệp SQL migration đã sinh ra trong `prisma/migrations/`.
   - Quản lý trạng thái qua bảng `_prisma_migrations`.
   - **Không chứa dữ liệu nghiệp vụ**.
2. **RESTORE (Native PostgreSQL Restore)**:
   - Là việc dùng công cụ cấp hệ quản trị CSDL (`pg_restore` hoặc `psql`) để **phục hồi toàn vẹn cả DDL lẫn DML** từ bản snapshot vật lý/nhị phân của PostgreSQL (`.dump` / `.sql`).
3. **REHYDRATION (Logical Data Rehydration)**:
   - Là việc nạp lại dữ liệu dòng (DML records) từ **Logical JSON Snapshot** vào các bảng đã có sẵn cấu trúc, bảo toàn UUID, khóa ngoại và dấu thời gian lịch sử.
   - **Đây chính là phương pháp thực tế của Phase 10.6 hiện tại**.
4. **SEED (`npx prisma db seed`)**:
   - Là việc tạo dữ liệu mẫu, dữ liệu phát triển hoặc giả lập (dev/demo/sandbox).
   - **Tuyệt đối không dùng thuật ngữ RESTORE cho SEED**.

> ### 📌 **PHƯƠNG PHÁP KHÔI PHỤC THỰC TẾ: RESTORE METHOD = LOGICAL REHYDRATION**

---

## 4. AN TOÀN MỤC TIÊU DATABASE (TARGET DATABASE SAFETY)

Khi bạn cung cấp credentials trong bước tiếp theo:

### 1. Phạm Vi Mục Tiêu Cho Phép:
- **DUY NHẤT: SUPABASE STAGING / TEMPORARY DATABASE**.
- **TUYỆT ĐỐI CẤM**:
  - Không kết nối Production database.
  - Không kết nối Live database.
  - Không kết nối Customer database.

### 2. Khóa Kiểm Tra An Toàn Trước Khi Ghi (Pre-Write Safety Lock):
Trước khi thực thi **bất kỳ câu lệnh ghi (write/insert/update/delete) nào**, kịch bản bắt buộc chạy truy vấn read-only kiểm tra định danh:
```sql
SELECT current_database(), current_user, version();
```
- Quét URL: Nếu chứa các từ khóa `prod`, `production`, `live`, `main`, `antigravity-prod` $\implies$ **DỪNG NGAY LẬP TỨC (Exit Code 1)**.
- **Bảo vệ Credentials**: Mask hostname (`aws-0-***.pooler.supabase.com`), xóa sạch mật khẩu và token khỏi mọi output log, không ghi credentials vào repository.

---

## 5. NGUYÊN TẮC AN TOÀN VỀ MIGRATION & ROLLBACK (MIGRATION SAFETY)

Vì Staging là database độc lập, việc chạy migration là an toàn cho Production. Tuy nhiên, để bảo vệ Staging:

1. **KHÔNG chạy `prisma migrate reset` như cơ chế rollback mặc định**.
2. **Chỉ được phép reset Staging khi**:
   - Định danh đích đã được **VERIFIED = STAGING**.
   - Có sự cho phép rõ ràng từ Người Phụ Trách.
   - Không có dữ liệu quan trọng nào trên Staging cần lưu trữ.
3. **Cơ chế Rollback ưu tiên**:
   - Khởi tạo lại database Staging tạm thời (Recreate temporary database), hoặc
   - Phục hồi lại snapshot ban đầu của Staging.

---

## 6. BẢNG ĐÁNH GIÁ KỸ THUẬT CUỐI CÙNG (EXACT MATRIX)

| Tiêu Chí Thẩm Tra | Đánh Giá Bằng Chứng | Ghi Chú Kỹ Thuật |
| :--- | :---: | :--- |
| **Backup source** | **Logical JSON** | Tệp `backups/dr_backup_preflight_verified.json`. |
| **Restore type** | **Rehydration** | Logical Data Rehydration (Nạp dữ liệu vào bảng có sẵn). |
| **Schema recovery** | **NO** | Schema bắt buộc phải do Prisma migration khởi tạo trước. |
| **Data recovery** | **YES** | Đầy đủ dữ liệu của 17 thực thể kinh doanh. |
| **PostgreSQL objects recovery** | **NO** | Không thể phục hồi triggers, custom functions, sequences từ JSON. |
| **Migration recovery** | **NO** | Bảng `_prisma_migrations` không nằm trong JSON backup. |
| **Production impact** | **ZERO** | Không kết nối, không có khả năng tác động tới Production. |
| **Native backup available** | **NO** | Không có file `pg_dump` `.sql` hay `.dump` trong repo. |
| **Staging credentials required** | **YES** | Cần credentials để thực hiện kiểm chứng trên PostgreSQL thật. |

---

## 7. QUYẾT ĐỊNH CUỐI CÙNG (FINAL DECISION)

> [!IMPORTANT]
> ### 🎯 QUYẾT ĐỊNH:
> **READY FOR STAGING CREDENTIALS**
> **WITH LIMITATION: "Logical Data Rehydration Only"**
>
> *(Hệ thống đã chuẩn bị đầy đủ kịch bản, nhận thức rõ giới hạn chỉ là nạp lại dữ liệu logic từ JSON, không phải phục hồi thảm họa cấp vật lý PostgreSQL. Sẵn sàng tiếp nhận credentials của Staging để tiến hành kiểm tra trên database thật).*
>
> ---
> **TRẠNG THÁI HIỆN TẠI**:
> - ✅ **KHÔNG DEPLOY PRODUCTION**.
> - ✅ **KHÔNG KẾT NỐI DATABASE**.
> - ✅ **KHÔNG EXECUTE RESTORE**.
> - 🛑 **DỪNG LẠI VÀ CHỜ BẠN CUNG CẤP CREDENTIALS CỦA SUPABASE STAGING.**
