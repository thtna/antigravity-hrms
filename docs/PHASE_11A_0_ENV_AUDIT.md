# 📋 PHASE 11A.0 — PRODUCTION ENVIRONMENT REQUIREMENTS AUDIT

**Timestamp**: `2026-09-07T03:30:00Z`
**Execution Mode**: `STATIC CODE AUDIT (ZERO DATABASE / NETWORK CALLS)`
**Audit Target**: `Full Repository Environment Variables Usage`

---

## 1. BẢNG TỔNG HỢP BIẾN MÔI TRƯỜNG PRODUCTION (PRODUCTION ENVIRONMENT VARIABLES)

### A. Nhóm Biến Cốt Lõi Đặc Biệt Xác Minh (Mandatory Core Variables)

| VARIABLE | USED BY | REQUIRED / OPTIONAL | SERVER ONLY / PUBLIC | PRODUCTION VALUE TYPE | SAFE DEFAULT EXISTS |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **`DATABASE_URL`** | Prisma ORM (`schema.prisma`), DB runtime client (`src/lib/db/prisma.ts`), Pooler connection (PgBouncer) | **REQUIRED** | **SERVER ONLY** | `Connection String (PostgreSQL URL, pooler port 6543)` | **NO** |
| **`DIRECT_URL`** | Prisma CLI Migrations (`prisma migrate deploy`), Advisory Locks, Direct DB connection | **REQUIRED** | **SERVER ONLY** | `Connection String (PostgreSQL URL, direct port 5432)` | **NO** |
| **`AUTH_SECRET`** | JWT session signing & verification (`src/lib/auth/session.ts`), Security Middleware (`src/middleware.ts`) | **REQUIRED** | **SERVER ONLY** | `String (Secret key, minimum 32 characters / 256-bit)` | **NO** |
| **`DEMO_MODE`** | Database Seeder (`prisma/seed.ts`), Anti-Demo Safety Gates, Sandbox isolation | **REQUIRED** | **SERVER ONLY** | `Boolean String ("false")` | **YES** *(Code defaults to false, but MUST explicitly set "false" in Prod)* |
| **`APP_ENV`** | Deployment & migration safety gates (`scripts/execute-staging-migration.ts`, `scripts/probe-production-connection.ts`) | **REQUIRED** | **SERVER ONLY** | `String ("production")` | **NO** |
| **`AUTH_COOKIE_NAME`** | Session cookie name (`src/lib/auth/session.ts`), Route guard middleware (`src/middleware.ts`) | **OPTIONAL** | **SERVER ONLY** | `String (e.g. "antigravity_session" or "__Secure-antigravity_session")` | **YES** *(Default: "antigravity_session")* |
| **`AUTH_TOKEN_EXPIRATION`** | JWT session token expiration (`src/lib/auth/session.ts`) | **OPTIONAL** | **SERVER ONLY** | `String (Timespan duration, e.g. "7d", "24h")` | **YES** *(Default: "7d")* |
| **`REDIS_URL`** | Distributed cache L2 (`src/lib/cache/cache-manager.ts`), Rate limiting | **OPTIONAL** | **SERVER ONLY** | `URL (Redis connection string, e.g. redis://... or rediss://...)` | **YES** *(Falls back to in-memory L1 LRU cache with active TTL)* |
| **`NEXT_PUBLIC_APP_URL`** | Email links (`src/lib/email/email.service.ts`), Notification actions, Password reset redirects | **REQUIRED** | **PUBLIC** | `URL (Official HTTPS domain, e.g. "https://hrms.yourcompany.com")` | **NO** *(Fallback is localhost:3000 which fails for production emails)* |

---

### B. Nhóm Biến Bổ Trợ & Dịch Vụ Mở Rộng (Supplementary & Extended Services)

| VARIABLE | USED BY | REQUIRED / OPTIONAL | SERVER ONLY / PUBLIC | PRODUCTION VALUE TYPE | SAFE DEFAULT EXISTS |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **`NODE_ENV`** | Next.js runtime, Prisma logging, Cookie security (`secure: true`), HSTS headers | **REQUIRED** | **SERVER ONLY** | `String ("production")` | **NO** *(Must be "production" for optimizations & security)* |
| **`CRON_SECRET`** | Background webhook job triggers (`src/app/api/v1/jobs/run/route.ts`) | **REQUIRED (nếu dùng Cron)** | **SERVER ONLY** | `String (Secret key, minimum 32 characters)` | **NO** *(Dev fallback is insecure)* |
| **`QR_SECRET`** | Dynamic QR attendance cryptographic signature (`src/lib/services/qr-attendance.service.ts`) | **OPTIONAL** | **SERVER ONLY** | `String (Cryptographic secret)` | **YES** *(Falls back to JWT_SECRET / internal key)* |
| **`LOG_LEVEL`** | Structured JSON logging (`src/lib/logger/index.ts`) | **OPTIONAL** | **SERVER ONLY** | `Enum ("info" \| "warn" \| "error" \| "debug")` | **YES** *(Default: "info")* |
| **`EMAIL_PROVIDER`** | Email transport engine selector (`src/lib/email/email.service.ts`) | **OPTIONAL** | **SERVER ONLY** | `Enum ("console" \| "sendgrid" \| "smtp")` | **YES** *(Default: "console")* |
| **`SENDGRID_API_KEY`** | SendGrid email integration (`src/lib/email/providers/sendgrid.provider.ts`) | **OPTIONAL** | **SERVER ONLY** | `String (API Key)` | **NO** *(Required only if EMAIL_PROVIDER="sendgrid")* |
| **`SENDGRID_FROM_EMAIL`** | Verified sender email for SendGrid | **OPTIONAL** | **SERVER ONLY** | `String (Email address)` | **NO** *(Required only if EMAIL_PROVIDER="sendgrid")* |
| **`SMTP_HOST`** / **`SMTP_PORT`** / **`SMTP_USER`** / **`SMTP_PASS`** | SMTP server connection (`src/lib/email/providers/smtp.provider.ts`) | **OPTIONAL** | **SERVER ONLY** | `Host / Port / Username / Password` | **NO** *(Required only if EMAIL_PROVIDER="smtp")* |
| **`STORAGE_PATH`** | Local disk storage root for avatars/documents (`src/lib/security/file-storage.ts`) | **OPTIONAL** | **SERVER ONLY** | `String (File system path)` | **YES** *(Default: process.cwd()/storage)* |
| **`COMPANY_NAME`** / **`COMPANY_ADDRESS`** / **`COMPANY_TAX_CODE`** | Payslip PDF branding info (`src/lib/services/payslip.service.ts`) | **OPTIONAL** | **SERVER ONLY** | `String` | **YES** *(Defaults to official corporate templates)* |

---

## 2. PHÂN TÍCH TỐI THIỂU CHO PRODUCTION (MINIMAL MANDATORY PRODUCTION ENV SET)

Để ứng dụng Antigravity HRMS vận hành an toàn, bảo mật và chính xác trên Vercel / Supabase Production, **bắt buộc tối thiểu** phải cấu hình đủ 7 biến môi trường sau:

1. `NODE_ENV="production"`
2. `APP_ENV="production"`
3. `DEMO_MODE="false"`
4. `DATABASE_URL` (Supabase Connection Pooler PgBouncer - Port 6543)
5. `DIRECT_URL` (Supabase Direct Session Connection - Port 5432)
6. `AUTH_SECRET` (Chuỗi ngẫu nhiên tối thiểu 32 ký tự / 256-bit entropy)
7. `NEXT_PUBLIC_APP_URL` (Domain HTTPS chính thức của ứng dụng)

*(Tùy chọn bổ sung khuyến nghị nếu dùng tác vụ nền: `CRON_SECRET`)*
