# 🛡️ PHASE 11A.0B — KẾ HOẠCH CẤU HÌNH MÔI TRƯỜNG PRODUCTION
## DỰ ÁN: ANTIGRAVITY HRMS

**Ngày lập**: 07/09/2026
**Chế độ thực thi**: KẾ HOẠCH & PHÂN TÍCH KIẾN TRÚC (ZERO DATABASE CALLS / ZERO CODE EDITS)
**Trạng thái tuân thủ**: Không sửa Vercel, Không deploy, Không kết nối Production DB, Không hiển thị secret.

---

## 1. PHÂN LOẠI CHI TIẾT CÁC BIẾN MÔI TRƯỜNG PRODUCTION

Hệ thống biến môi trường của **Antigravity HRMS** được phân thành 4 nhóm chiến lược theo cấp độ sẵn sàng vận hành:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PRODUCTION ENVIRONMENT ARCHITECTURE TIERS                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. REQUIRED BEFORE DEPLOY           -> Bắt buộc để Build & Deploy lên Vercel│
│ 2. REQUIRED BEFORE REAL CUSTOMER    -> Bắt buộc trước khi đón khách hàng thật│
│ 3. OPTIONAL (SAFE DEFAULTS)         -> Tùy chọn nâng cao, có sẵn fallback   │
│ 4. PLATFORM-PROVIDED                -> Vercel / Next.js tự động cung cấp    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### NHÓM 1: BẮT BUỘC TRƯỚC KHI DEPLOY (REQUIRED BEFORE DEPLOY)
*Nếu thiếu bất kỳ biến nào trong nhóm này, ứng dụng sẽ build fail, sập runtime kết nối hoặc vi phạm nguyên tắc cách ly dữ liệu.*

| Biến Môi Trường | Mô Tả & Mục Đích Sử Dụng | Yêu Cầu Kỹ Thuật |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | URL kết nối PostgreSQL qua Supabase Transaction Pooler (PgBouncer, Port 6543). Dùng cho toàn bộ query ORM của ứng dụng. | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true` |
| **`DIRECT_URL`** | URL kết nối trực tiếp PostgreSQL Session (Port 5432). Bắt buộc dùng cho `prisma migrate deploy` vì pooler cổng 6543 không hỗ trợ advisory locks. | `postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:5432/postgres` |
| **`AUTH_SECRET`** | Khóa bí mật dùng để ký và giải mã JWT token phiên đăng nhập (HS256). | Chuỗi ngẫu nhiên tối thiểu 32 ký tự (256-bit entropy). Tuyệt đối không dùng chuỗi dev fallback. |
| **`DEMO_MODE`** | Cờ kiểm soát dữ liệu giả lập. Phải đặt cứng bằng `"false"` để seed script chỉ khởi tạo 4 role RBAC và triệt tiêu 100% fake tenant/user. | Giá trị cố định: `"false"` |
| **`APP_ENV`** | Nhãn định danh môi trường vận hành, dùng cho các cổng an toàn kiểm tra chéo (Anti-Cross-Environment Guard). | Giá trị cố định: `"production"` |
| **`NEXT_PUBLIC_APP_URL`** | Tên miền HTTPS chính thức của ứng dụng (dùng cho client-side routing, CORS origin check, và render action URL). | URL HTTPS hợp lệ: `https://hrms.yourdomain.com` (Không được để `localhost:3000`). |

---

### NHÓM 2: BẮT BUỘC TRƯỚC KHI ĐÓN KHÁCH HÀNG THỰC TẾ (REQUIRED BEFORE REAL CUSTOMER USE)
*Ứng dụng có thể deploy kỹ thuật để kiểm tra nội bộ, nhưng KHÔNG ĐƯỢC PHÉP mở cho người dùng cuối nếu chưa có nhóm này.*

| Biến Môi Trường | Lý Do Bắt Buộc | Tác Động Nếu Thiếu |
| :--- | :--- | :--- |
| **`EMAIL_PROVIDER`** | Xác định trình gửi email thực tế (`"sendgrid"` hoặc `"smtp"`). | Nếu thiếu, hệ thống dùng `console` provider $\implies$ **Email không gửi ra ngoài**, người dùng không nhận được thông báo hay link kích hoạt. |
| **`SENDGRID_API_KEY`** / **`SMTP_*`** | Khóa xác thực dịch vụ chuyển phát email SMTP / SendGrid API. | Người dùng thực hiện "Quên mật khẩu" hoặc nhận phiếu lương sẽ thất bại trong việc nhận email. |
| **`STORAGE_ADAPTER` (Supabase Storage)** | Cấu hình lưu trữ đám mây bền vững cho ảnh đại diện (avatar) và tài liệu nhân sự (hợp đồng PDF). | **`PRODUCTION BLOCKER FOR FILE UPLOADS`** (Xem mục 3 phân tích chi tiết). |
| **`CRON_SECRET`** | Khóa bảo vệ Webhook API endpoint (`POST /api/v1/jobs/run`). | Cho phép Vercel Cron hoặc dịch vụ lịch biểu kích hoạt tính công, chốt kỳ lương tự động mà không bị tấn công trái phép. |

---

### NHÓM 3: TÙY CHỌN NÂNG CAO (OPTIONAL — CÓ SAFE DEFAULT)
*Hệ thống đã tích hợp sẵn fallback an toàn trong mã nguồn, có thể hoạt động ổn định mà không cần khai báo.*

| Biến Môi Trường | Giá Trị Mặc Định (Fallback) | Cơ Chế Hoạt Động Khi Vắng Mặt |
| :--- | :--- | :--- |
| **`AUTH_COOKIE_NAME`** | `"antigravity_session"` | Tên cookie lưu trữ JWT session. Có thể đổi thành `__Secure-antigravity_session` nếu cần chuẩn bảo mật HTTPS cao hơn. |
| **`AUTH_TOKEN_EXPIRATION`**| `"7d"` | Thời hạn sống của phiên làm việc. Mặc định 7 ngày. |
| **`REDIS_URL`** | *None (undefined)* | `CacheManager` tự động fallback 100% về bộ nhớ đệm L1 in-memory LRU với cơ chế quét dọn TTL tự động mỗi 60 giây. |
| **`QR_SECRET`** | Fallback về `JWT_SECRET` / `AUTH_SECRET` | Khóa ký HMAC-SHA256 cho mã QR chấm công động. |
| **`LOG_LEVEL`** | `"info"` | Mức độ chi tiết của log hệ thống (`debug`, `info`, `warn`, `error`). Trong production tự động định dạng JSON có cấu trúc. |
| **`COMPANY_*`** | Thông tin mẫu Antigravity Corp | Thông tin pháp nhân mặc định in trên PDF phiếu lương (Tên, MST, Địa chỉ, Số điện thoại). |

---

### NHÓM 4: NỀN TẢNG TỰ CUNG CẤP (PLATFORM-PROVIDED)

| Biến Môi Trường | Nguồn Cung Cấp | Cơ Chế |
| :--- | :--- | :--- |
| **`NODE_ENV`** | Vercel / Next.js | Next.js và Vercel tự động đặt `NODE_ENV=production` khi build và chạy trên Production Serverless Functions. *(Lưu ý: Chỉ cần khai báo thủ công khi chạy các CLI script ngoài Next.js runtime)*. |
| **`VERCEL`** | Vercel Platform | Vercel tự động inject `VERCEL="1"`. Next.config đã tận dụng biến này để bỏ qua standalone output khi build trên Vercel. |
| **`PORT`** | Vercel Platform | Serverless container tự quản lý cổng giao tiếp HTTP. |

---

## 2. XÁC MINH CÁC CÂU HỎI KỸ THUẬT CỐT LÕI

### 2.1. Xác minh `NODE_ENV`
- **Cơ chế Vercel & Next.js**: Khi triển khai lên Vercel Production Deployment, Vercel tự động thiết lập `NODE_ENV="production"` trong quá trình `next build` và runtime của Serverless Functions / Middleware.
- **Rủi ro cục bộ**: Khi chạy các script độc lập bằng Node.js CLI (như `prisma migrate`, `seed.ts`, `probe-production-connection.ts`), môi trường Node.js ngoài Vercel sẽ lấy giá trị từ shell hoặc file env.
- **Kết luận**: Trên Vercel Production, `NODE_ENV` là **PLATFORM-PROVIDED**. Đối với các script bảo trì chạy qua CLI, bắt buộc phải có trong `.env.production`.

### 2.2. Xác minh Luồng Gửi Email & "Forgot Password"
- **Kiểm tra mã nguồn `src/app/api/v1/auth/forgot-password/route.ts`**:
  ```typescript
  if (user) {
    logger.info('Password reset requested for user', { userId: user.id, email });
    // In production: sendgrid / email dispatch
  }
  return NextResponse.json({ success: true, data: { sent: true } });
  ```
- **Kiểm tra `src/lib/email/email.service.ts`**:
  Nếu `EMAIL_PROVIDER` không được cấu hình, hệ thống gán `activeProviderName = 'console'`. Provider này chỉ ghi thông điệp email ra stdout (`console.log`), hoàn toàn **KHÔNG gửi email ra thế giới bên ngoài**.
- **Kết luận**:
  - Trên Production, nếu không cấu hình `EMAIL_PROVIDER` và credentials (`SENDGRID_API_KEY` hoặc `SMTP_*`), chức năng Forgot Password và gửi phiếu lương **SẼ KHÔNG GỬI EMAIL THẬT**.
  - Đây là cấu hình **BẮT BUỘC TRƯỚC KHI CHO KHÁCH HÀNG THỰC TẾ SỬ DỤNG**.

---

## 3. AUDIT LƯU TRỮ TỆP TIN & KHUYẾN NGHỊ ADAPTER (FILE STORAGE AUDIT)

### 3.1. Phân Tích Hiện Trạng `src/lib/security/file-storage.ts`
Mã nguồn hiện tại đang thao tác trực tiếp với filesystem cục bộ thông qua Node.js `fs/promises`:
```typescript
const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage');
const AVATAR_DIR = path.join(STORAGE_ROOT, 'avatars');
const DOCUMENT_DIR = path.join(STORAGE_ROOT, 'documents');
// ...
await fs.writeFile(filePath, buffer);
```

### 3.2. Đánh Giá Khả Thi Trên Vercel Serverless
- **Đặc tính Vercel Serverless**:
  1. Thư mục mã nguồn `process.cwd()` trên Lambda là **Read-Only** $\implies$ Ghi tệp tại đây sẽ ném lỗi `EROFS: read-only file system`.
  2. Thư mục `/tmp` cho phép ghi tạm, nhưng là **Ephemeral (Phi trạng thái)** $\implies$ Dữ liệu sẽ biến mất ngay khi Lambda function chuyển phiên bản, recycle container hoặc mở instance mới.
- **KẾT LUẬN NGHIÊM TRỌNG**:
  > [!CAUTION]
  > ### 🛑 PRODUCTION BLOCKER FOR FILE UPLOADS
  > Lưu trữ cục bộ qua `fs/promises` **không thể hoạt động bền vững trên môi trường Vercel Production**. Ảnh đại diện nhân viên và tài liệu PDF đính kèm hợp đồng sẽ bị lỗi EROFS hoặc thất lạc dữ liệu.

### 3.3. Đề Xuất Kiến Trúc Adapter (Supabase Storage) — *Chưa Triển Khai Trong Phase Này*
Đề xuất thay thế `file-storage.ts` bằng mẫu thiết kế **Provider Adapter Pattern**:
```
┌────────────────────────────────────────────────────────┐
│               StorageProvider Interface                │
├────────────────────────────────────────────────────────┤
│ + saveFile(bucket, path, buffer, contentType): Promise │
│ + getFileUrl(bucket, path, expiresIn?): Promise        │
│ + deleteFile(bucket, path): Promise                    │
└──────────────────────────────────┬─────────────────────┘
                                   │
         ┌─────────────────────────┴─────────────────────────┐
         ▼                                                   ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│ LocalDiskStorageProvider      │   │ SupabaseStorageProvider       │
│ (Dùng cho Local Dev & Test)   │   │ (Dùng cho Production Vercel)  │
│ -> Lưu trong ./storage/       │   │ -> Buckets: "avatars" (public)│
│                               │   │             "documents" (priv)│
└───────────────────────────────┘   └───────────────────────────────┘
```
- **Biến môi trường cần thiết khi nâng cấp**:
  - `SUPABASE_URL`: Tên miền API Supabase (`https://[REF].supabase.co`).
  - `SUPABASE_SERVICE_ROLE_KEY`: Khóa quyền admin server-side để ghi tệp vào Storage Bucket an toàn.
*(Không thực hiện chỉnh sửa mã nguồn trong Phase 11A.0B).*

---

## 4. QUY TẮC CÁCH LY DATABASE CHO MÔI TRƯỜNG PREVIEW

- **Rủi ro nghiêm trọng**: Nếu Vercel Preview Deployments (các bản build tự động khi mở Pull Request) chia sẻ chung `DATABASE_URL` của Production:
  - Các lập trình viên hoặc test runner chạy trên PR có thể xóa, sửa, hoặc làm ô nhiễm dữ liệu của khách hàng thật trên Production.
  - Các script test có thể vi phạm tính bất biến của bảng lương hoặc quota tenant.
- **NGUYÊN TẮC BẮT BUỘC**:
  ```
  Vercel Environment   ───>   Supabase Database Target
  ────────────────────────────────────────────────────────────
  Production           ───>   Supabase PRODUCTION Database
  Preview              ───>   Supabase STAGING Database (antigravity-hrms-staging)
  Development (Local)  ───>   Localhost PostgreSQL (localhost:5432)
  ```
- **Xác nhận**: **Tuyệt đối không gán Production DATABASE_URL cho phạm vi Preview trên Vercel.**

---

## 5. MA TRẬN TỔNG HỢP & BẢNG BÀN GIAO KỸ THUẬT

| Biến Môi Trường | Phân Loại | Khuyến Nghị Cấu Hình Vercel |
| :--- | :---: | :--- |
| `DATABASE_URL` | **Nhóm 1** | Cấu hình cho **Production only** (Pooler port 6543) |
| `DIRECT_URL` | **Nhóm 1** | Cấu hình cho **Production only** (Direct port 5432) |
| `AUTH_SECRET` | **Nhóm 1** | Cấu hình cho **Production only** (Random 32+ chars) |
| `DEMO_MODE` | **Nhóm 1** | `"false"` (Production & Preview) |
| `APP_ENV` | **Nhóm 1** | `"production"` |
| `NEXT_PUBLIC_APP_URL` | **Nhóm 1** | Domain Production chính thức |
| `EMAIL_PROVIDER` | **Nhóm 2** | `"sendgrid"` hoặc `"smtp"` |
| `SENDGRID_API_KEY` / `SMTP_*` | **Nhóm 2** | Cấu hình trước khi mở đăng ký thật |
| `CRON_SECRET` | **Nhóm 2** | Khóa webhook ngẫu nhiên 32 ký tự |
| `STORAGE_PATH` | **Nhóm 2** | `PRODUCTION BLOCKER FOR FILE UPLOADS` (Cần chuyển sang Cloud Adapter) |
| `REDIS_URL` | **Nhóm 3** | Tùy chọn (đã có L1 LRU in-memory fallback) |
| `AUTH_COOKIE_NAME` | **Nhóm 3** | Tùy chọn (`"antigravity_session"`) |
| `AUTH_TOKEN_EXPIRATION` | **Nhóm 3** | Tùy chọn (`"7d"`) |
| `NODE_ENV` | **Nhóm 4** | Platform tự cấp (`"production"`) |
| `VERCEL` | **Nhóm 4** | Platform tự cấp (`"1"`) |

---

## 6. ĐÁNH GIÁ TRẠNG THÁI HIỆN TẠI

1. **CORE PRODUCTION CONFIG**:
   - Vercel CLI chưa đăng nhập / chưa liên kết dự án.
   - Chưa nạp credentials Production Supabase (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`).
   - Tệp `.env.production` chưa cấu hình.
   $\implies$ **`NOT READY`**

2. **REAL CUSTOMER CONFIG**:
   - `EMAIL_PROVIDER` chưa cấu hình (Forgot Password chưa gửi mail thật).
   - Tồn tại **`PRODUCTION BLOCKER FOR FILE UPLOADS`** trên Vercel do sử dụng filesystem cục bộ.
   $\implies$ **`NOT READY`**
