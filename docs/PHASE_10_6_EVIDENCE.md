# BÁO CÁO THẨM TRA BẰNG CHỨNG THỰC TẾ (PHASE 10.6 EVIDENCE AUDIT)
## ANTIGRAVITY HRMS — DISASTER RECOVERY RESTORE DRILL VERIFICATION

- **Ngày kiểm định**: 06/09/2026
- **Môi trường thực thi**: Windows x64 (Local Dev Environment)
- **Tình trạng kết nối CSDL**: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/antigravity_hrms"`
- **Trạng thái cổng kết nối**: Cổng `5432` không có tiến trình PostgreSQL lắng nghe (`netstat -ano | findstr 5432` = Exit Code 1)
- **Trạng thái Docker**: Docker Desktop chưa khởi chạy engine (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`)
- **Nguyên tắc báo cáo**: **TRUNG THỰC KỸ THUẬT TUYỆT ĐỐI — KHÔNG GHI PASS NẾU CHƯA CHẠY TRÊN DATABASE THẬT**.

---

## 1. PHÂN TÍCH HIỆN TRẠNG KIỂM TOÁN PHASE 10.6 (NO MOCK / NO HARDCODE AUDIT)

Rà soát toàn bộ mã nguồn của diễn tập Phase 10.6 (`scripts/dr-restore-drill.ts` và `src/lib/services/__tests__/disaster-recovery-drill.test.ts`):

```typescript
// Trích đoạn từ scripts/dr-restore-drill.ts (Dòng 78)
const fixtureData: Record<string, any[]> = {
  Organizations: [...],
  Users: [...],
  ...
};

// Trích đoạn từ src/lib/services/__tests__/disaster-recovery-drill.test.ts
let drillMetrics: DisasterRecoveryDrillMetrics;
beforeAll(() => {
  drillMetrics = executeDrill();
});
```

### Kết Quả Rà Soát:
1. **Mock / Hardcode / Fixture Dependency**: **FOUND**
   - Dữ liệu phục hồi được sinh ra từ mảng đối tượng giả lập trong bộ nhớ (`fixtureData`).
   - Quá trình "backup" và "restore" được thực thi thông qua việc ghi và đọc tệp JSON cục bộ (`dr_backup_preflight_verified.json`) và lưu vào đối tượng RAM (`restoredTables`).
   - Toàn bộ kết quả kiểm thử trong `disaster-recovery-drill.test.ts` đánh giá dựa trên `drillMetrics` của JavaScript runtime, **KHÔNG PHẢI** truy vấn qua giao thức mạng TCP tới một máy chủ PostgreSQL đang chạy thực tế.
2. **Kiểm tra kết nối PostgreSQL thực tế**:
   - Khi chạy kịch bản kết nối Prisma thực tế qua `scripts/inspect-db.ts`:
     ```
     prisma:error
     Invalid `prisma.user.count()` invocation:
     Can't reach database server at localhost:5432
     Please make sure your database server is running at localhost:5432.
     ```
   - Điều này chứng minh: **Không có cơ sở dữ liệu PostgreSQL thực tế nào đang hoạt động trên môi trường cục bộ để thực hiện lệnh RESTORE thật**.

---

## 2. BẢNG ĐÁNH GIÁ BẰNG CHỨNG BẮT BUỘC (MANDATORY EVIDENCE MATRIX)

| Tiêu Chí Thẩm Tra | Kết Quả Thực Tế | Đánh Giá Bằng Chứng | Ghi Chú Kỹ Thuật |
| :--- | :--- | :---: | :--- |
| **Backup** | Tệp JSON logic `dr_backup_preflight_verified.json` được tạo thành công từ cấu trúc schema. Chưa tạo physical snapshot từ PostgreSQL cluster thật. | **NOT VERIFIED (on live DB)** / *VERIFIED (logical structure)* | Cần cụm PostgreSQL Supabase thật để chạy `supabase db dump` / WAL snapshot. |
| **Restore** | Rehydrate thành công trong bộ nhớ RAM từ tệp JSON. Chưa chạy lệnh restore vật lý (`pg_restore` / `psql`) vào database thật. | **NOT PROVEN** | Chưa restore vào PostgreSQL staging độc lập do thiếu instance DB đang chạy. |
| **Real PostgreSQL connection** | Thử nghiệm kết nối tới `localhost:5432` thất bại: `Can't reach database server at localhost:5432`. | **NOT VERIFIED** | Cổng 5432 đóng, không có dịch vụ PostgreSQL hoặc Docker container đang chạy. |
| **Real data** | Dữ liệu kiểm tra trong drill lấy từ fixture JSON (`fixtureData`), không phải từ bảng PostgreSQL thật. | **NOT PROVEN** | Số lượng bản ghi 37/37 khớp trong JSON, nhưng không xuất phát từ câu lệnh `SELECT COUNT(*)` trên CSDL thật. |
| **Audit persistence** | Ghi nhận thêm 1 phần tử vào mảng `restoredTables.AuditLogs` trong RAM. Không ghi qua lệnh `INSERT INTO "AuditLog"` trên database thật. | **NOT PROVEN** | Logic nghiệp vụ append hoạt động, nhưng chưa kiểm chứng ghi đĩa CSDL vật lý. |
| **Tenant isolation after restore** | Kiểm tra phân lập logic $A \leftrightarrow B$ trên đối tượng JavaScript và trong unit tests với Prisma Mock. | **NOT PROVEN (on live DB)** / *VERIFIED (in unit tests)* | Unit tests cô lập đạt 100% PASS, nhưng chưa chạy qua kết nối SQL mạng thật. |
| **Payroll regression** | Thuật toán `PayrollCalculationEngine.calculate` thuần túy: 10M gross $\to$ 8.95M net, 1.05M bảo hiểm, 0 PIT. Hoàn toàn độc lập với CSDL. | **VERIFIED** | Bất biến toán học đạt chuẩn 100% không phụ thuộc database. |
| **Migration state** | Bảng `_prisma_migrations` không thể truy vấn do kết nối database không khả dụng. | **NOT VERIFIED** | Thư mục `prisma/migrations` chứa mã migration hợp lệ, nhưng chưa đối soát bảng di trú trên live database. |
| **Mock/hardcoded dependency** | Phát hiện phụ thuộc vào `fixtureData`, `drillMetrics`, và `mockPrisma`. | **FOUND** | Các chỉ số nghiệm thu Phase 10.6 trước đó xuất phát từ mô phỏng/mock. |

---

## 3. NGUYÊN NHÂN HẠ TẦNG & RÀO CẢN KỸ THUẬT (INFRASTRUCTURE ANALYSIS)

1. **Hạ tầng cục bộ**:
   - Máy trạm không cài đặt dịch vụ PostgreSQL Windows native (không có `psql`, không có Windows Service `postgresql`).
   - Docker Desktop có sẵn tệp thực thi (`Docker Desktop.exe`) nhưng daemon Linux engine chưa được khởi động (`dockerDesktopLinuxEngine` không phản hồi).
2. **Hạ tầng đám mây (Supabase / Remote)**:
   - Tệp `.env` hiện tại vẫn đang cấu hình chuỗi kết nối mẫu tới máy cục bộ:
     `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/antigravity_hrms?schema=public"`
   - Chưa được nạp chuỗi kết nối thực tế tới cụm Supabase PostgreSQL staging/temporary (`db.xxxx.supabase.co`).
3. **Tính trung thực của báo cáo**:
   - Khi không có máy chủ PostgreSQL thực tế đang lắng nghe, mọi báo cáo khẳng định đã restore database vật lý thành công đều là **báo cáo không có căn cứ thực nghiệm (Mock-only)**.
   - Tuân thủ chỉ thị của Người Phụ Trách: **Không được ghi PASS giả nếu chỉ test bằng mock/fixture/in-memory**.

---

## 4. KẾT LUẬN CUỐI CÙNG (FINAL VERDICT)

> [!CAUTION]
> ### 🛑 PHÁN QUYẾT: **PHASE 10.6 = NOT PROVEN**
>
> **LÝ DO KỸ THUẬT**:
> 1. Kết quả kiểm thử Phase 10.6 trước đó được thực hiện hoàn toàn qua kịch bản mô phỏng logic (In-Memory Fixtures & Mocked Objects), **CHƯA ĐƯỢC THỰC THI TRÊN MỘT INSTANCE POSTGRESQL THỰC TẾ**.
> 2. Kết nối tới cơ sở dữ liệu vật lý tại `localhost:5432` hiện tại không khả dụng.
> 3. Không có bằng chứng truy vấn SQL thực tế từ bảng `_prisma_migrations` hoặc các bảng nghiệp vụ trên một database PostgreSQL đã phục hồi.
>
> **CHỈ THỊ CHẤP HÀNH**:
> - **TUYỆT ĐỐI KHÔNG DEPLOY PRODUCTION**.
> - Giữ nguyên toàn bộ mã nguồn ứng dụng, không sửa đổi engine tính lương, không reset database.
> - **DỪNG LẠI VÀ BÁO CÁO TRUNG THỰC VỚI NGƯỜI PHỤ TRÁCH**.

---

## 5. CÁC PHƯƠNG ÁN ĐỂ ĐẠT "PHASE 10.6 VERIFIED" THỰC SỰ

Để đưa Phase 10.6 từ **NOT PROVEN** thành **VERIFIED** hợp lệ trên cơ sở dữ liệu thật, hệ thống cần một trong hai điều kiện hạ tầng sau:

1. **Phương án A (Remote Supabase Staging Database)**:
   - Cung cấp chuỗi kết nối tới một cơ sở dữ liệu PostgreSQL Supabase tạm thời / staging (ví dụ: `DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"`).
   - Tôi sẽ thực thi:
     - `npx prisma migrate deploy`
     - Nạp dữ liệu backup vào database thật.
     - Dùng Prisma Client thật kết nối và chạy query kiểm tra record counts thật, tạo audit log thật, kiểm tra tenant isolation thật.
2. **Phương án B (Khởi động Docker Engine Cục Bộ)**:
   - Khởi động Docker Desktop để chạy một container PostgreSQL cô lập:
     ```bash
     docker run --name pg-staging-restore -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16-alpine
     ```
   - Khi đó, toàn bộ quy trình restore, migrate và test truy vấn thực tế sẽ được kiểm chứng trực tiếp trên cổng `localhost:5432`.
