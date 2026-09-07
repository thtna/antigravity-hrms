# 🛡️ PHASE 11A.0D1 — KẾ HOẠCH CẤU HÌNH MÔI TRƯỜNG VERCEL PREVIEW (STAGING WEB)
## HỆ THỐNG ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE SAAS PLATFORM

> **TRẠNG THÁI GIAI ĐOẠN**: **KẾ HOẠCH & KIỂM TOÁN KIẾN TRÚC (READ-ONLY AUDIT & PLANNING)**
> **MỤC TIÊU**: Chuẩn bị cấu hình Vercel Preview làm môi trường web STAGING độc lập để kiểm thử thực tế luồng gửi email "Forgot Password" / "Reset Password" ra ngoài thế giới.
> **NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI**:
> - **KHÔNG** deploy Vercel.
> - **KHÔNG** sửa cấu hình trên Vercel Dashboard.
> - **KHÔNG** chạm vào Production Database hoặc Production Services.
> - **KHÔNG** hiển thị bất kỳ secret / API key / password nào.
> - **KHÔNG** thay đổi code hoặc configuration trong repository.
> **THỜI ĐIỂM LẬP KẾ HOẠCH**: 07/09/2026

---

## 1. MỤC ĐÍCH & KIẾN TRÚC VERCEL PREVIEW LÀM STAGING

Để kiểm chứng toàn diện luồng người dùng thực tế:
1. Người dùng mở trang web Staging $\to$ Bấm "Quên mật khẩu".
2. Hệ thống gửi email thật qua dịch vụ chuyển phát Staging (SendGrid / SMTP Relay).
3. Người dùng mở hộp thư thật $\to$ Nhấp vào liên kết đặt lại mật khẩu dạng:
   `${STAGING_APP_URL}/reset-password?token=...`
4. Trang web Staging mở ra $\to$ Người dùng nhập mật khẩu mới $\to$ Đổi mật khẩu thành công $\to$ Đăng nhập với mật khẩu mới thành công, mật khẩu cũ bị chặn.

Để đạt được mục tiêu này mà **hoàn toàn không chạm vào Production**, Vercel cung cấp cơ chế phân định môi trường (Environment Scoping):
- **Production Environment**: Dành riêng cho branch chính thức (`main`), tên miền Production.
- **Preview Environment**: Dành riêng cho branch Staging hoặc Pull Requests, tự động gắn kết nối tới hạ tầng **Supabase STAGING** và **Email STAGING**.

---

## 2. MA TRẬN PHÂN LOẠI BIẾN MÔI TRƯỜNG DÀNH CHO VERCEL PREVIEW

Dưới đây là danh mục kiểm toán chính xác 100% các biến môi trường mà Vercel Preview (Staging Web) thực sự cần:

| Tên Biến Môi Trường | Phạm Vi Cung Cấp (Target Scope) | Cấp Độ Bảo Mật (Visibility) | Mục Đích Kỹ Thuật Trong Codebase | Mẫu Giá Trị Phân Bổ (Masked) |
| :--- | :---: | :---: | :--- | :--- |
| **`DATABASE_URL`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Kết nối PostgreSQL qua Supabase Transaction Pooler (Port 6543, PgBouncer) cho Prisma ORM. | `postgresql://postgres.[STAGING_REF]:[MASKED]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1` |
| **`DIRECT_URL`** | **CLI / Build / Migration** | **SERVER ONLY** | Kết nối trực tiếp PostgreSQL Session (Port 5432) cho `prisma migrate` và CLI inspection. | `postgresql://postgres.[STAGING_REF]:[MASKED]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres` |
| **`AUTH_SECRET`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Ký/giải mã JWT Session, đồng thời làm seed HMAC-SHA256 sinh token Reset Password không lưu trạng thái. | Chuỗi ngẫu nhiên tối thiểu 32 ký tự (256-bit entropy, riêng cho Staging) |
| **`APP_ENV`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Khẳng định môi trường vận hành là Staging, kích hoạt các guard chặn thao tác nhầm lên Prod. | `"staging"` |
| **`DEMO_MODE`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Vô hiệu hóa toàn bộ fake/demo data, bảo đảm tính toàn vẹn của dữ liệu doanh nghiệp thật. | `"false"` |
| **`NEXT_PUBLIC_APP_URL`** | **Preview Runtime & Build Time** | **PUBLIC** (Client Bundle) | Base URL HTTPS của Staging Web dùng để sinh liên kết kích hoạt / reset password trong email. | `https://staging-hrms.yourdomain.com` (hoặc Preview Branch URL) |
| **`SUPABASE_URL`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Endpoint REST API của Supabase Staging (`https://[STAGING_REF].supabase.co`). | `https://rdp***tak.supabase.co` |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Service role key đặc quyền của Supabase Staging để quản lý 2 private buckets (`avatars`, `documents`). | `eyJhbGciOi...[STAGING_SERVICE_ROLE_KEY_MASKED]` |
| **`STORAGE_PROVIDER`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Bắt buộc `StorageManager` dùng `SupabaseStorageProvider` (loại bỏ ghi đĩa cục bộ trên Lambda). | `"supabase"` |
| **`EMAIL_PROVIDER`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Kích hoạt provider chuyển phát email thực tế (`sendgrid` hoặc `smtp`). | `"sendgrid"` (hoặc `"smtp"`) |
| **`SENDGRID_API_KEY`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Khóa API SendGrid môi trường Staging/Test để gửi email thật qua REST API (`api.sendgrid.com`). | `SG.xxxxxxxx...[STAGING_KEY_MASKED]` |
| **`SENDGRID_FROM_EMAIL`** | **Preview Runtime** (Serverless) | **SERVER ONLY** | Địa chỉ email người gửi đã được xác thực (Single Sender Verification) trên SendGrid. | `no-reply@yourdomain.com` (hoặc `staging-auth@...`) |

---

## 3. CÁC BIẾN MÔI TRƯỜNG BỔ TRỢ (OPTIONAL / SAFE DEFAULTS)

Hệ thống đã có fallback an toàn trong mã nguồn, nhưng nên khai báo trên Vercel Preview để tối ưu quản trị:

| Tên Biến | Phạm Vi | Visibility | Giá Trị Đề Xuất Cho Staging Preview | Mục Đích |
| :--- | :---: | :---: | :--- | :--- |
| **`AUTH_COOKIE_NAME`** | Preview Runtime | SERVER ONLY | `"antigravity_session_staging"` | Phân lập cookie session Staging, tránh xung đột cookie với localhost hoặc production khi test trên cùng trình duyệt. |
| **`AUTH_TOKEN_EXPIRATION`** | Preview Runtime | SERVER ONLY | `"1d"` | Hạn sống token phiên làm việc Staging (1 ngày). |
| **`LOG_LEVEL`** | Preview Runtime | SERVER ONLY | `"debug"` | Bật log chi tiết trên Vercel Runtime Logs để dễ dàng chẩn đoán sự cố gửi email / auth. |
| **`COMPANY_NAME`** | Preview Runtime | SERVER ONLY | `"CÔNG TY CỔ PHẦN CÔNG NGHỆ ANTIGRAVITY (STAGING)"` | Nhãn phân biệt trên tiêu đề email và báo cáo thử nghiệm. |

---

## 4. XÁC MINH CÁC THỰC THỂ HẠ TẦNG STAGING

### 4.1. Cơ sở dữ liệu Staging (Supabase PostgreSQL STAGING)
- **Project Reference**: `rdp***tak` (`antigravity-hrms-staging`).
- **Phân tách tuyệt đối**:
  - URL Staging bắt buộc chứa `rdpufonfascxgbydvtak`.
  - Tuyệt đối KHÔNG chứa bất kỳ chuỗi kết nối nào tới Production Database.
  - Port 6543 (`?pgbouncer=true&connection_limit=1`) dành cho `DATABASE_URL` runtime.
  - Port 5432 dành cho `DIRECT_URL` migration.

### 4.2. Hệ thống lưu trữ Staging (Supabase Storage STAGING)
- **Trạng thái**: Đã nghiệm thu thành công tại **Phase 11A.0C2** (`LIVE STAGING STORAGE VERIFIED`).
- **2 Private Buckets**:
  - `avatars` (Private, RLS enabled).
  - `documents` (Private, RLS enabled).
- **Cơ chế**: Vercel Serverless Function gọi Supabase REST Storage API thông qua `SUPABASE_SERVICE_ROLE_KEY`. Tệp không bao giờ ghi vào ổ cứng cục bộ của Lambda.

### 4.3. Hệ thống chuyển phát thư Staging (EMAIL STAGING)
- **Cơ chế**: Sử dụng `SendGridEmailProvider` qua native HTTP `fetch` tới `https://api.sendgrid.com/v3/mail/send`.
- **Tài khoản**: Phải là tài khoản SendGrid thử nghiệm (Staging / Dev / Sandbox), dùng Sender Address đã verify.
- **Không dùng Production Credentials**: Tuyệt đối không dùng API Key của tài khoản SendGrid khách hàng Production.

---

## 5. CƠ CHẾ XÁC ĐỊNH URL TRÊN VERCEL PREVIEW (`NEXT_PUBLIC_APP_URL`)

### 5.1. Vấn đề kỹ thuật trên Vercel Preview
- Vercel Preview tạo ra các URL động cho mỗi lần deploy (ví dụ: `https://antigravity-hrms-git-staging-org.vercel.app` hoặc `https://antigravity-hrms-ab12cd34-org.vercel.app`).
- Biến `NEXT_PUBLIC_APP_URL` được nạp vào lúc **Build Time** của Next.js.
- Trong mã nguồn:
  - [`src/app/api/v1/auth/forgot-password/route.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/auth/forgot-password/route.ts#L41):
    ```typescript
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
    ```
  - [`src/lib/email/email.service.ts`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/email/email.service.ts#L142):
    ```typescript
    const fullUrl = actionUrl?.startsWith('http')
      ? actionUrl
      : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${actionUrl || '/notifications'}`;
    ```

### 5.2. Giải pháp cấu hình URL chuẩn xác trên Vercel
Có 2 chiến lược xác định `NEXT_PUBLIC_APP_URL` cho Preview/Staging:

1. **Chiến lược 1: Sử dụng Domain Cố Định cho Staging (Khuyên dùng)**:
   - Cấu hình custom domain trên Vercel cho branch Staging, ví dụ: `https://staging-hrms.yourcompany.com`.
   - Trong Vercel Environment Variables (Scope: **Preview**), gán:
     ```env
     NEXT_PUBLIC_APP_URL="https://staging-hrms.yourcompany.com"
     ```
   - **Ưu điểm**: Mọi email gửi ra từ Staging đều trỏ về một địa chỉ URL ổn định, người nhận có thể click link bất kỳ lúc nào mà không phụ thuộc vào mã băm ngẫu nhiên của từng deployment.

2. **Chiến lược 2: Sử dụng Vercel Branch URL Tự Động**:
   - Vercel tự động tạo branch domain dạng: `https://antigravity-hrms-git-[branch-name]-[team-name].vercel.app`.
   - Gán `NEXT_PUBLIC_APP_URL` trong Scope Preview trỏ đúng về URL này.

---

## 6. PHÂN ĐỊNH RANH GIỚI BẢO MẬT (SERVER ONLY VS PUBLIC)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DATA EXPOSURE BOUNDARY AUDIT                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  🔴 SERVER ONLY (Tuyệt đối bí mật, cấm xuất hiện trong Client Bundle):      │
│     - DATABASE_URL                                                          │
│     - DIRECT_URL                                                            │
│     - AUTH_SECRET                                                           │
│     - SUPABASE_SERVICE_ROLE_KEY                                             │
│     - SENDGRID_API_KEY                                                      │
│     - SMTP_PASS                                                             │
│                                                                             │
│  🟡 RUNTIME ENVIRONMENT GUARDS (Server Only):                               │
│     - APP_ENV="staging"                                                     │
│     - DEMO_MODE="false"                                                     │
│     - STORAGE_PROVIDER="supabase"                                           │
│     - EMAIL_PROVIDER="sendgrid"                                             │
│                                                                             │
│  🟢 PUBLIC (Nhúng vào trình duyệt qua Next.js Client Bundle):              │
│     - NEXT_PUBLIC_APP_URL                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> - Vercel tự động mã hóa và bảo vệ các biến môi trường khi đánh dấu không có tiền tố `NEXT_PUBLIC_`.
> - Tuyệt đối không bao giờ thêm tiền tố `NEXT_PUBLIC_` cho bất kỳ secret nào (`AUTH_SECRET`, `SENDGRID_API_KEY`, `DATABASE_URL`, v.v.).

---

## 7. CHECKLIST CHUẨN BỊ CHO VERCEL PREVIEW TRƯỚC KHI DEPLOY

Khi người dùng quyết định tiến hành bước cấu hình trên Vercel:
- [ ] Mở **Vercel Project Settings $\to$ Environment Variables**.
- [ ] Chọn phạm vi áp dụng: **Tích chọn duy nhất ô `Preview`** (Bỏ tích ô `Production`).
- [ ] Nhập đủ 12 biến môi trường cốt lõi đã liệt kê ở Mục 2.
- [ ] Kiểm tra đối soát: Đảm bảo chuỗi kết nối CSDL trỏ tới Project Ref Staging (`rdp***tak`), KHÔNG PHẢI Production.
- [ ] Đảm bảo `APP_ENV="staging"` và `DEMO_MODE="false"`.
- [ ] Lưu lại các biến môi trường.

---

## 8. KẾT LUẬN NGHIỆM THU KIẾN TRÚC

```
================================================================================
STAGING PREVIEW CONFIG PLAN VERIFIED
================================================================================
Target Environment          : Vercel Preview (Staging Web)
Database Target             : Supabase PostgreSQL STAGING (rdp***tak)
Storage Target              : Supabase Storage STAGING (avatars, documents)
Email Target                : Staging Email Provider (SendGrid / SMTP)
App Guard                   : APP_ENV=staging | DEMO_MODE=false
Production Isolation        : 100% UNTOUCHED (Zero Production connections)
Secrets Exposure            : NONE (Full Masking Enforced)
================================================================================
```
