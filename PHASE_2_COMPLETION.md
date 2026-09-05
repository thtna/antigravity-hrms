# BÁO CÁO NGHIỆM THU CÔNG ĐOẠN: PHASE 2 — AUTHENTICATION & RBAC
**ANTIGRAVITY MASTER PROJECT: HỆ THỐNG CHẤM CÔNG – NHÂN SỰ – KPI – THƯỞNG PHẠT – TÍNH LƯƠNG**  
*Mã tài liệu: PHASE_2_COMPLETION.md | Thời gian hoàn thành: 2026-09-03 | Trạng thái: COMPLETE*

---

## 1. ĐÃ LÀM GÌ (ACCOMPLISHMENTS)
1. **Hệ Thống Xác Thực & Quản Lý Phiên Bảo Mật (Authentication & Session Engine)**:
   - Cơ chế băm mật khẩu chuẩn công nghiệp sử dụng `bcryptjs` với salt rounds 10 (`src/lib/auth/password.ts`).
   - Phiên làm việc JWT được ký bằng thuật toán HS256 qua thư viện `jose` tương thích Edge Runtime (`src/lib/auth/session.ts`).
   - Token được lưu trữ trong Cookie `HttpOnly`, `SameSite=Lax`, cờ `Secure` tự động kích hoạt trong môi trường production, triệt tiêu nguy cơ tấn công XSS đánh cắp phiên.
   - Endpoint đăng nhập (`POST /api/v1/auth/login`), đăng xuất (`POST /api/v1/auth/logout`), và lấy thông tin phiên người dùng (`GET /api/v1/auth/me`).
2. **Hệ Thống Phân Quyền Hạt Mịn (Fine-Grained RBAC & Authorization)**:
   - 4 vai trò chuẩn hóa theo yêu cầu: `admin`, `hr`, `manager`, `employee` (`src/lib/auth/roles.ts`).
   - Hỗ trợ ký tự đại diện `*` cho `admin` và ma trận quyền hạn nguyên tử cho từng vai trò.
   - Server-side Guards: `requireAuth()`, `requireRole()`, `requirePermission()` (`src/lib/auth/guard.ts`).
   - Cơ chế bảo vệ chống rò rỉ dữ liệu chéo **Anti-IDOR (Insecure Direct Object Reference)** qua `verifyOwnershipOrAdmin()`, ngăn chặn nhân viên truy cập trái phép hồ sơ hoặc dữ liệu của đồng nghiệp.
   - Cơ chế phân vùng dữ liệu **Data Scoping** (`applyDataScope`) phân cấp tự động: Global (Admin/HR) -> Department (Manager) -> Self (Employee).
3. **Bảo Mật Bổ Trợ (Defense in Depth)**:
   - Tuyệt đối không trả `password_hash` về client trong bất kỳ API response nào (dữ liệu phản hồi được chuẩn hóa qua `SanitizedUser` DTO).
   - Cơ chế chống tấn công dò quét mật khẩu **Rate Limiting** (Sliding Window 5 lần/phút/IP) bảo vệ endpoint đăng nhập (`src/lib/security/rate-limit.ts`).
   - Cơ chế chặn tài khoản bị vô hiệu hóa: Kiểm tra `isActive === false` cả ở bước đăng nhập và trong từng yêu cầu gọi API thông qua session verification.
   - Ghi vết kiểm toán (Audit Log) tự động khi có sự kiện đăng nhập/đăng xuất kèm địa chỉ IP và User-Agent.
4. **Middleware & Giao Diện Người Dùng (UI & Protected Routes)**:
   - `src/middleware.ts`: Bảo vệ các route nhạy cảm (`/admin/*`, `/hr/*`, `/manager/*`, `/portal/*`, `/api/v1/*`), kiểm tra phiên và phân quyền ngay tại tầng Gateway, tự động điều hướng sang `/login` hoặc `/unauthorized`.
   - Trang Đăng Nhập Modern Luxury: `src/app/login/page.tsx` với giao diện doanh nghiệp sang trọng, hiển thị lỗi rõ ràng, trạng thái loading và các nút chọn nhanh tài khoản mẫu.
   - Trang 403 Forbidden: `src/app/unauthorized/page.tsx`.
5. **Bộ Kiểm Thử Tự Động Toàn Diện (Automated Vitest Suite)**:
   - Xây dựng **20 test cases** kiểm tra đầy đủ mọi kịch bản: `login`, `invalid login`, `inactive account`, `role access`, `unauthorized API`, `cross-user access (IDOR block)`.

---

## 2. FILES ĐÃ TẠO / THAY ĐỔI
- [src/types/index.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/types/index.ts): Khai báo kiểu `RoleCode` (`admin`, `hr`, `manager`, `employee`), `UserSession`, `SanitizedUser`.
- [src/lib/auth/password.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/auth/password.ts): Hàm băm và xác thực mật khẩu bcrypt.
- [src/lib/auth/session.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/auth/session.ts): Ký/giải mã JWT và quản lý cookie phiên HttpOnly.
- [src/lib/auth/roles.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/auth/roles.ts): Ma trận vai trò, quyền hạn và helper kiểm tra quyền.
- [src/lib/auth/guard.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/auth/guard.ts): Bộ guard xác thực phía server, kiểm tra quyền và chống IDOR.
- [src/lib/security/rate-limit.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/security/rate-limit.ts): Bộ giới hạn tần suất yêu cầu chống brute-force.
- [src/lib/errors/index.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/errors/index.ts): Nâng cấp `handleApiError` hỗ trợ kiểu generic.
- [src/middleware.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/middleware.ts): Middleware phân quyền Next.js App Router.
- [src/app/api/v1/auth/login/route.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/auth/login/route.ts): API đăng nhập người dùng.
- [src/app/api/v1/auth/logout/route.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/auth/logout/route.ts): API đăng xuất thu hồi cookie.
- [src/app/api/v1/auth/me/route.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/auth/me/route.ts): API lấy thông tin phiên người dùng hiện hành.
- [src/app/api/v1/auth/test-roles/route.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/auth/test-roles/route.ts): API kiểm tra xác thực vai trò.
- [src/app/api/v1/auth/test-ownership/[ownerId]/route.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/api/v1/auth/test-ownership/[ownerId]/route.ts): API kiểm tra cơ chế chống IDOR.
- [src/app/login/page.tsx](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/login/page.tsx): Trang đăng nhập giao diện sang trọng.
- [src/app/unauthorized/page.tsx](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/app/unauthorized/page.tsx): Trang báo lỗi 403.
- [src/lib/auth/__tests__/auth.test.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/auth/__tests__/auth.test.ts): Bộ 15 bài test kiểm thử Guard, Roles, Password, Session, IDOR.
- [src/lib/auth/__tests__/api_auth.test.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/src/lib/auth/__tests__/api_auth.test.ts): Bộ 5 bài test kiểm thử Route Handlers đăng nhập và phiên.
- [vitest.config.ts](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/vitest.config.ts): Cấu hình Vitest hỗ trợ path aliases `@/*`.
- [package.json](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/package.json): Bổ sung `bcryptjs`, `jose`, `vitest` và script `"test": "vitest run"`.
- [PHASE_2_COMPLETION.md](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/PHASE_2_COMPLETION.md): Báo cáo nghiệm thu Phase 2.

---

## 3. DATABASE THAY ĐỔI (DATABASE CHANGES)
- Tận dụng lược đồ chuẩn `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `audit_logs` đã được thiết lập từ Phase 1.
- Mọi quan hệ truy vấn đều được bọc trong Prisma Client an toàn, đảm bảo trường `passwordHash` bị tách biệt hoàn toàn khỏi các đối tượng trả về người dùng.

---

## 4. API ĐÃ TẠO (API SPECIFICATIONS)
| Method | Endpoint | Bảo vệ | Chức năng |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Public + Rate Limiter (5 req/phút) | Đăng nhập tài khoản, thiết lập cookie phiên |
| `POST` | `/api/v1/auth/logout` | Authenticated | Thu hồi phiên, xóa cookie |
| `GET` | `/api/v1/auth/me` | `requireAuth` | Lấy profile và danh sách quyền hợp lệ |
| `GET` | `/api/v1/auth/test-roles` | `requireRole([role])` | Kiểm tra kiểm định vai trò động |
| `GET` | `/api/v1/auth/test-ownership/:ownerId` | `verifyOwnershipOrAdmin` | Kiểm định chặn truy cập chéo IDOR |

---

## 5. TEST ĐÃ CHẠY (VERIFICATION & VALIDATION)
1. **Password Hashing**: Mã hóa một chiều bằng bcrypt, xác thực khớp mật khẩu, từ chối mật khẩu sai.
2. **JWT Session Token**: Ký token bằng HS256, trích xuất dữ liệu chính xác, từ chối token bị sửa đổi trái phép.
3. **Role Normalization**: Chuẩn hóa tên vai trò chữ hoa/thường, hỗ trợ ký tự đại diện `*` cho `admin`.
4. **Unauthorized API**: Ném lỗi HTTP 401 khi không có cookie phiên hoặc token hết hạn.
5. **Inactive Account**: Ném lỗi HTTP 403 khi `isActive: false` cả ở bước đăng nhập và khi gọi API.
6. **Role Access Check**: `admin` truy cập được toàn bộ hệ thống; `hr` vào được route nhân sự; `employee` bị chặn với HTTP 403 khi truy cập tài nguyên của cấp quản lý.
7. **Cross-User Access (Anti-IDOR)**: Nhân viên truy cập thành công tài nguyên của chính mình; bị chặn ngay lập tức với HTTP 403 khi cố truy cập tài nguyên của đồng nghiệp khác.
8. **API Route Handlers**: Kiểm thử toàn trình `POST /api/v1/auth/login` và `GET /api/v1/auth/me`.

---

## 6. KẾT QUẢ TEST (TEST RESULTS)
```
 ✓ src/lib/auth/__tests__/auth.test.ts (15 tests)
 ✓ src/lib/auth/__tests__/api_auth.test.ts (5 tests)

 Test Files  2 passed (2)
      Tests  20 passed (20)
   Duration  2.08s
```
| Tiêu chí kiểm định | Trạng thái | Ghi chú |
| :--- | :---: | :--- |
| `npm run test` (Vitest) | **PASS** | **20/20 test cases vượt qua 100%** |
| `npm run typecheck` (`tsc --noEmit`) | **PASS** | **0 lỗi TypeScript** |
| `npm run lint` (`eslint .`) | **PASS** | **0 cảnh báo, 0 lỗi cú pháp** |
| `npm run build` (`next build`) | **PASS** | **Biên dịch Production thành công (11 static/dynamic routes)** |

---

## 7. LỖI ĐÃ SỬA TRONG CÔNG ĐOẠN (SELF-HEALING)
1. **Cấu hình Path Alias trong Vitest**: Bổ sung `vitest.config.ts` để Vitest giải quyết đường dẫn `@/*` đồng bộ với `tsconfig.json`.
2. **Import NextRequest trong Middleware**: Sửa import từ `'next/request'` (không tồn tại) thành `'next/server'`.
3. **Generic Response Typing trong `handleApiError`**: Mở rộng hàm xử lý lỗi hỗ trợ generic `<T = never>` để tương thích hoàn hảo với các kiểu trả về cụ thể của từng Route Handler.
4. **Cảnh báo biến không sử dụng trong route test**: Sử dụng biến `session.userId` trong payload phản hồi để tuân thủ triệt để quy chuẩn `@typescript-eslint/no-unused-vars`.
5. **Loại bỏ kiểu `any` trong mock tests**: Thay thế toàn bộ bằng `as unknown as Mock` bảo đảm tính nghiêm ngặt tuyệt đối của TypeScript.

---

## 8. KNOWN LIMITATIONS
- Chưa tích hợp cơ chế 2FA (Mã xác thực hai lớp qua Authenticator App) - sẽ được xem xét nâng cấp ở giai đoạn tăng cường bảo mật cuối kỳ.
- Không triển khai module Quản lý Nhân sự (tuân thủ chỉ đạo: *"Không sang Employee Management khi phase này chưa pass"*).

---

## 9. TIÊU CHUẨN NGHIỆM THU (ACCEPTANCE CRITERIA CHECKLIST)
- [x] Đầy đủ 4 Roles: `admin`, `hr`, `manager`, `employee`.
- [x] Có đầy đủ luồng login, logout, session, password hashing.
- [x] Protected routes qua Middleware & Server-side Authorization Guards.
- [x] Tài khoản `isActive: false` bị từ chối đăng nhập và chặn truy cập API.
- [x] Bảo mật: Không trả `password_hash` ra ngoài, có chống IDOR, có rate limiting.
- [x] Đã viết và pass toàn bộ 20 tests cho login, invalid login, inactive account, role access, unauthorized API, cross-user access.

---

## 10. TRẠNG THÁI (STATUS)
# **COMPLETE**
*(Sẵn sàng chuyển sang Phase 3: Employee & Organization Management khi có lệnh tiếp theo)*
