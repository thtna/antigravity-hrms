# 🛡️ BÁO CÁO KỸ THUẬT: KHẮC PHỤC LỖI PRISMA P2028 & TỐI ƯU HÓA TRANSACTION ONBOARDING STEP 6
## HỆ THỐNG ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE SAAS PLATFORM

> **TRẠNG THÁI**: HOÀN THÀNH KIỂM CHỨNG CODE & BUILD (CHỜ DEPLOY STAGING BRANCH ĐỂ LIVE VERIFY)
> **NGÀY THẨM ĐỊNH**: 08/09/2026
> **MÔI TRƯỜNG ÁP DỤNG**: STAGING ONLY (`antigravity-hrms-staging`)
> **PRODUCTION TOUCHED**: **`NO`** (Tuyệt đối không chạm CSDL, biến môi trường hay triển khai Production)

---

## 1. PHÂN TÍCH NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

### 1.1. Phân Loại Serverless Lifecycle Risk
- **Khẳng định**: Không khẳng định hook `process.beforeExit` trong `src/lib/db/prisma.ts` là nguyên nhân duy nhất đã được chứng minh chỉ dựa vào câu chữ của mã lỗi P2028 ("*or was obtained before disconnecting*").
- **Phân loại chuẩn xác**: Hook `process.once('beforeExit', ...)` được phân loại là **Serverless Lifecycle Risk**. Trong môi trường Vercel Serverless / AWS Lambda, Node.js event loop có thể trigger `beforeExit` khi microtask queue tạm cạn giữa các async operations, dẫn đến việc Prisma Client chủ động đóng pool kết nối (`$disconnect`) trong khi request HTTP vẫn đang chờ hoàn thành.
- **Biện pháp xử lý**: Đã loại bỏ `beforeExit` khỏi `prisma.ts`, chỉ giữ lại lắng nghe tín hiệu hủy tiến trình của hệ điều hành (`SIGINT`, `SIGTERM`).

### 1.2. Nguyên Nhân Kỹ Thuật Có Bằng Chứng Thực Nghiệm
1. **Interactive Transaction Timeout**:
   - Request thực tế trên Vercel Preview đo được mất khoảng **13 – 14 giây**.
   - Thời gian timeout mặc định của Prisma interactive transaction là **5000ms (5 giây)**.
   - Supabase Staging đặt tại **Singapore (`aws-0-ap-southeast-1.pooler.supabase.com`)** trong khi Vercel Preview Function có latency network round-trip đáng kể (~100-200ms/query khi có nhiều round-trips tuần tự).
2. **Transaction Bloat & Non-DB Work**:
   - Ban đầu, transaction trong `saveStep` bao bọc toàn bộ chuỗi xử lý và lồng trực tiếp với transaction bên trong `EmployeeService.createEmployee`.
   - Các tác vụ tiêu tốn thời gian và round-trips bên trong transaction gồm:
     - Tính toán mã hóa mật khẩu `bcrypt.hash` (tốn ~100-200ms CPU);
     - Truy vấn tìm kiếm `Role` hệ thống;
     - Xác thực chéo `Department` và `Position`;
     - Kiểm tra trùng lặp `employeeCode` và `email`;
     - `User.create`;
     - `Employee.create`;
     - `OrganizationMember.upsert`;
     - `AuditLog.create`;
     - `Organization.update`.
   - Chuỗi 8-9 round-trips tuần tự qua internet vượt quá ngưỡng 5 giây, dẫn đến việc Prisma Query Engine đóng transaction ID phía server trước khi `createEmployee` hoàn tất, sinh ra lỗi `PrismaClientKnownRequestError: P2028 (Transaction not found)`.

---

## 2. KIẾN TRÚC & TÁI CẤU TRÚC TRANSACTION (TRANSACTION REFACTORING)

### 2.1. Rút Gọn Transaction Xuống Mức Tối Thiểu (Minimal Atomic DB Writes)
Tuân thủ nguyên tắc không chỉ đơn thuần nâng timeout, ranh giới transaction được thu hẹp tối đa:
- **Tác vụ đưa ra ngoài transaction**:
  1. **Pre-lookup Role & Idempotency Check**: Truy vấn kiểm tra `Role` hệ thống (`code: 'employee'`) và kiểm tra sự tồn tại của nhân viên được thực hiện bên ngoài transaction.
  2. **Non-DB CPU Work**: Băm mật khẩu nhân viên bằng `hashPassword` (bcryptjs) được thực hiện hoàn toàn trước khi mở transaction.
  3. **Auto-provision Department & Position**: Tự động giải quyết phòng ban / chức danh hợp lệ nếu tenant chưa tạo, thực hiện trước transaction.
- **Tác vụ giữ lại trong transaction**:
  - Chỉ duy nhất các thao tác ghi dữ liệu bắt buộc tính toàn vẹn nguyên tử:
    1. Tạo bản ghi `User` (nếu chưa có) và gán `UserRole`;
    2. Tạo bản ghi `Employee`;
    3. Tạo bản ghi `OrganizationMember`;
    4. Ghi `AuditLog` tạo nhân viên;
    5. Cập nhật `Organization.onboardingStep = 7`.

### 2.2. Hỗ Trợ Transaction Client Ngoài (`options.tx`)
- `EmployeeService.createEmployee` nhận tùy chọn `options.tx?: Prisma.TransactionClient`.
- Khi `tx` được truyền từ `OnboardingService`, `EmployeeService` tái sử dụng cùng context transaction, loại bỏ hoàn toàn hiện tượng nested transactions.
- Thiết lập tường minh `maxWait: 5000, timeout: 10000` (10 giây) cho transaction cô đọng, vừa đủ cho độ trễ serverless sang remote DB mà không giữ kết nối dư thừa.

---

## 3. PHÂN QUYỀN & BẢO TOÀN RBAC (AUTHORIZATION IMPACT)

- **Nguyên tắc**: Tuyệt đối không mở quyền `OWNER` toàn cục cho `EmployeeService` để tránh làm sai lệch ma trận RBAC của các endpoint khác (như `/api/v1/employees`).
- **Triển khai**:
  - `CreateEmployeeOptions` bổ sung cờ `allowOwnerOnboarding?: boolean`.
  - Trong luồng onboarding (`OnboardingService`), cờ này được bật (`allowOwnerOnboarding: true`), cho phép tài khoản `OWNER` đang cấu hình tổ chức thiết lập nhân viên đầu tiên mà không bị chặn.
  - Các lời gọi thông thường tới `POST /api/v1/employees` hoặc các tác tử ngoài không có cờ này sẽ vẫn tuân thủ nghiêm ngặt RBAC chuẩn (`ADMIN` hoặc `HR`), đảm bảo an toàn tuyệt đối.

---

## 4. CƠ CHẾ IDEMPOTENT RETRY, XỬ LÝ CONCURRENCY P2002 & BẢO VỆ TIẾN TRÌNH

1. **Điều Kiện Idempotent Retry Hợp Lệ**:
   - Nhân viên đã tồn tại thuộc cùng `organizationId`;
   - Dữ liệu định danh khớp hoàn toàn:
     - `employeeCode === validated.employeeCode`
     - `user.email === validated.email`
     - `firstName === validated.firstName`
     - `lastName === validated.lastName`
   - Khi đó: Hệ thống coi đây là thao tác retry an toàn, trả về bản ghi hiện tại và tiến `onboardingStep = 7` (chỉ khi step hiện tại < 7).
2. **Xử Lý Xung Đột Dữ Liệu (Collision Rejection)**:
   - Nếu `employeeCode` hoặc `email` đã tồn tại nhưng thuộc về người khác, hoặc khác họ tên:
   - Trả về mã lỗi **`HTTP 409 CONFLICT`** kèm thông điệp rõ ràng (`EMPLOYEE_CODE_EXISTS` hoặc `EMAIL_ALREADY_EXISTS`);
   - **TUYỆT ĐỐI KHÔNG TỰ TIẾN BƯỚC ONBOARDING** (`onboardingStep` vẫn giữ nguyên).
3. **Bắt Lỗi Đồng Thời (Concurrent Race Condition & P2002)**:
   - Nếu hai request POST Step 6 cùng vượt qua pre-check đồng thời, request thứ hai gặp lỗi ràng buộc duy nhất Prisma `P2002` (hoặc 409 conflict).
   - Hệ thống chủ động catch `P2002`, thực hiện re-fetch bản ghi vừa được commit bằng `organizationId + employeeCode / email`.
   - Nếu đúng cùng định danh (exact same identity) $\to$ Trả về kết quả thành công mà không nhân đôi bản ghi.
   - Nếu khác định danh $\to$ Trả về `HTTP 409 Conflict`.
4. **Cập Nhật Có Điều Kiện — Chống Ghi Lùi Step (Conditional Non-Regressive Update)**:
   - Không dùng biến `org.onboardingStep` trong memory để tính toán.
   - Thực thi câu lệnh có điều kiện: `tx.organization.updateMany({ where: { id: orgId, onboardingStep: { lt: 7 } }, data: { onboardingStep: 7 } })`.
   - Nếu tenant hiện tại đã ở bước $\ge 7$ (như tenant Staging hiện đang ở bước 8), hệ thống **KHÔNG BAO GIỜ GHI LÙI VỀ BƯỚC 7**.

---

## 5. BẢO ĐẢM TÍNH NGUYÊN TỬ VÀ ROLLBACK REGRESSION

Khi Step 6 gặp sự cố ở bất kỳ điểm nào (ví dụ lỗi DB connection, ràng buộc khóa ngoại không hợp lệ, transaction timeout):
- **Trạng thái Onboarding**: `onboardingStep` vẫn giữ nguyên là **6**.
- **Không có User mồ côi (Zero Orphan Users)**: Bản ghi `User` không được lưu vào hệ thống.
- **Không có Employee dang dở (Zero Partial Employees)**: Không có bản ghi `Employee` lẻ loi.
- **Không có OrganizationMember dang dở**: Không tạo liên kết thành viên tổ chức.
- **Không có AuditLog sai**: Nhật ký kiểm toán không ghi nhận thao tác giả mạo.

---

## 6. KẾT QUẢ READ-ONLY INSPECTION TRÊN STAGING DATABASE THẬT (`rdpufonfascxgbydvtak`)

Thực hiện truy vấn read-only trực tiếp tới CSDL Supabase Staging thật (`rdpufonfascxgbydvtak.supabase.co`, host: `aws-0-ap-southeast-1.pooler.supabase.com`):

### 6.1. Dữ Liệu Server & Database Thực Tế
- `current_database`: `"postgres"`
- `current_schema`: `"public"`
- `PostgreSQL Version`: `17.6 on x86_64-pc-linux-gnu`
- `Region`: **Singapore (`ap-southeast-1`)**

### 6.2. Dữ Liệu Tổ Chức `32b15bd9-b243-4ebb-9f2b-32a22b94055b`
- `organization.id`: `32b15bd9-b243-4ebb-9f2b-32a22b94055b`
- `organization.name`: **`STAGING TEST NAM 01`**
- `organization.slug`: `staging-test-nam-01-8643`
- `organization.status`: **`ACTIVE`** (Đã được duyệt bởi Super Admin)
- `organization.onboardingStep`: **`8`**
- `Số lượng nhân viên hiện tại`: `0`
- `Owner Member`: `nguyennam040889.dongsaigon@gmail.com` (Role: `OWNER`, Active: `true`)

### 6.3. Giải Thích Mâu Thuẫn Trong Báo Cáo Trước Đó
- Trong báo cáo sơ bộ trước đó, tên tổ chức bị ghi nhầm thành "Công ty Cổ phần Tân Phong / PENDING" do nhầm lẫn với tenant mặc định từ bản snapshot rehydration (`org_default_tanphong` / "Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong").
- Thực tế tenant được dùng để test onboarding trên staging là `32b15bd9-b243-4ebb-9f2b-32a22b94055b` mang tên **`STAGING TEST NAM 01`**, đã ở trạng thái **`ACTIVE`** và đang có `onboardingStep = 8`.
- Do `onboardingStep` thực tế đang là 8, việc áp dụng giải pháp **Cập nhật có điều kiện (`onboardingStep: { lt: 7 }`)** tại Mục 4 là cực kỳ trọng yếu để đảm bảo khi gọi Step 6, hệ thống không bao giờ ghi lùi tiến trình từ bước 8 về 7!
- **Không có bất kỳ thao tác xóa/sửa dữ liệu nào được thực hiện trên CSDL Staging**.

---

## 7. BẰNG CHỨNG KIỂM THỬ VÀ BIÊN DỊCH HỆ THỐNG

### 7.1. TypeScript Compiler Check
```bash
npx tsc --noEmit
# Exit Code: 0 (0 errors, 0 warnings)
```

### 7.2. Test Suite Hồi Quy & Toàn Hệ Thống (`npm test`)
- Suite kiểm thử hồi quy chuyên biệt: `src/lib/services/__tests__/onboarding-step6-regression.test.ts`
  - `1. Successfully save Step 6 and atomically advance onboardingStep to 7`: **PASS**
  - `2. Invalid cross-tenant department/position rejected with 400 Bad Request`: **PASS**
  - `3.1 Exact Idempotent retry returns existing employee and advances step`: **PASS**
  - `3.2 EmployeeCode or email collision with mismatched identity returns 409 and keeps step at 6`: **PASS**
  - `4. Transaction rollback on failure leaves NO orphan user, NO employee, NO member`: **PASS**
  - `5.1 Owner without admin role in session.roles can save Step 6 during onboarding`: **PASS**
  - `5.2 Direct call to createEmployee without HR/Admin and without allowOwnerOnboarding is 403`: **PASS**
  - `6.1 When concurrent request hits P2002 but has exact same identity, recovers idempotently with success`: **PASS**
  - `6.2 When concurrent request hits P2002 with a DIFFERENT identity, rejects with HTTP 409 Conflict`: **PASS**
  - `7. When organization.onboardingStep is already 8 (as on live staging), Step 6 does NOT regress to 7`: **PASS** (10 / 10 Tests PASS)

### 7.3. Next.js Production Build (`npm run build`)
```bash
npm run build
# ▲ Next.js 16.3.4 (Turbopack)
# ✓ Compiled successfully in 34.9s
# ✓ Generating static pages (92/92) in 2.5s
# Exit Code: 0
```

---

## 8. QUY TRÌNH XÁC MINH TRỰC TIẾP TRÊN STAGING (LIVE VERIFICATION PROTOCOL)

> [!IMPORTANT]
> **Lưu ý**: Các bài unit/mock latency test không được coi là bằng chứng xác nhận P2028 đã hết trên production/staging thật. Sau khi code được push lên branch `staging` và Vercel hoàn tất build Preview, các bước xác minh live bắt buộc thực hiện:

1. Gửi request live:
   `POST /api/v1/onboarding/step` với payload Step 6 (First Employee).
2. Kiểm tra phản hồi: Phải đạt mã trạng thái `HTTP 200` hoặc `HTTP 201`.
3. Kiểm tra trạng thái:
   `GET /api/v1/onboarding/status` $\to$ Trả về `HTTP 200` với `onboardingStep = 7`.
4. Kiểm tra dữ liệu CSDL:
   - Nhân viên tạo mới gắn đúng `organizationId` của tenant.
   - Bản ghi `User` và `OrganizationMember` liên kết đầy đủ.
5. Kiểm tra Vercel Function Logs:
   - Phải không còn bất kỳ dấu vết nào của mã lỗi `P2028` hoặc `P2024`.
