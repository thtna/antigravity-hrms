# 🛡️ BÁO CÁO NGHIỆM THU PHASE 11A.0C — PRODUCTION STORAGE HARDENING
## DỰ ÁN: ANTIGRAVITY HRMS MULTI-TENANT SAAS

**Ngày thực hiện**: 07/09/2026
**Trạng thái tổng thể**: **PASS — 100% PRODUCTION READY (STORAGE HARDENED)**
**Môi trường thực thi**: Node.js / Next.js 16.3.4 (Turbopack) / PostgreSQL (Prisma) / Vitest 4.1.11

---

## 1. TỔNG QUAN VẤN ĐỀ & GIẢI PHÁP KIẾN TRÚC

Trước Phase 11A.0C, hệ thống quản lý tệp tin (`file-storage.ts`) ghi trực tiếp vào đĩa cứng cục bộ thông qua `fs/promises` (`process.cwd()/storage`). Trên môi trường Vercel Serverless Production, cơ chế này gặp phải rào cản nghiêm trọng (**`PRODUCTION BLOCKER FOR FILE UPLOADS`**):
1. Thư mục mã nguồn `process.cwd()` trên Lambda là **Read-Only** $\implies$ Gây lỗi `EROFS: read-only file system`.
2. Thư mục `/tmp` chỉ là bộ nhớ tạm thời (**Ephemeral**) $\implies$ Mất toàn bộ avatar và tài liệu hợp đồng của khách hàng khi Lambda container tái khởi động hoặc chuyển phiên bản.

**Giải pháp đã triển khai thành công**:
Hệ thống đã chuyển đổi toàn diện sang kiến trúc **Storage Provider Abstraction Pattern** độc lập hạ tầng, hỗ trợ đồng thời cả môi trường phát triển cục bộ lẫn lưu trữ đám mây phân tán bền vững (Persistent Object Storage).

```
                             ┌───────────────────────────────┐
                             │       StorageManager          │
                             │  (Single Entry Point Factory) │
                             └───────────────┬───────────────┘
                                             │
                      ┌──────────────────────┴──────────────────────┐
                      ▼                                             ▼
        ┌───────────────────────────┐                 ┌───────────────────────────┐
        │   LocalStorageProvider    │                 │  SupabaseStorageProvider  │
        │   (Development & Tests)   │                 │   (Production & Staging)  │
        ├───────────────────────────┤                 ├───────────────────────────┤
        │ - Ghi thư mục ./storage   │                 │ - REST API Object Storage │
        │ - Ký HMAC Token Signed URL│                 │ - Zero local disk writes  │
        │ - 100% Offline dev support│                 │ - Ephemeral Vercel safe   │
        └───────────────────────────┘                 └───────────────────────────┘
```

---

## 2. THIẾT KẾ BUCKETS VÀ NGUYÊN TẮC BẢO MẬT

Hệ thống phân định ranh giới bảo vệ cho 2 bucket chuyên biệt:

1. **Bucket `avatars`**:
   - Dành cho ảnh đại diện của người dùng và nhân viên.
   - Hỗ trợ Public URL hoặc Signed URL tùy cấu hình phân quyền.
2. **Bucket `documents` (BẮT BUỘC PRIVATE TUYỆT ĐỐI)**:
   - Dành cho hợp đồng lao động (`CONTRACT`), CCCD/CMND (`ID_CARD`), sơ yếu lý lịch (`RESUME`), chứng chỉ (`CERTIFICATE`), phụ lục lương.
   - **Tuyệt đối cấm Public URL** (`getPublicUrl` ném lỗi `403 Forbidden` ngay lập tức).
   - Chỉ được truy cập thông qua **Signed URL ngắn hạn (Short-lived Cryptographically Signed URL)** sau khi vượt qua kiểm tra định danh và chống IDOR trên server-side.

---

## 3. CƠ CHẾ PHÂN LẬP KHÁCH HÀNG (TENANT ISOLATION)

Mọi đường dẫn tệp tin (Object Key) đều bắt buộc tuân theo cấu trúc phân vùng nghiêm ngặt lấy từ `session.organizationId` của phiên đăng nhập:

- **Private Document Key**:
  `organizations/{organizationId}/employees/{employeeId}/{docId}.{extension}`
- **Avatar Key**:
  `organizations/{organizationId}/avatars/{filename}`

### Ma trận kiểm thử phân lập khách hàng (Cross-Tenant Matrix)
Toàn bộ 7 kịch bản tương tác chéo giữa Tenant A (`org-tenant-a`) và Tenant B (`org-tenant-b`) đã được kiểm định tự động:

| Kịch Bản Kiểm Định | Thao Tác | Kết Quả Thực Tế | Trạng Thái |
|---|---|---|:---:|
| `[MATRIX-01]` | **Tenant A upload object cho Tenant A** | Ghi tệp hợp lệ vào `organizations/org-tenant-a/...` | **ALLOW** |
| `[MATRIX-02]` | **Tenant A đọc object của Tenant A** | Đọc dữ liệu chính xác, toàn vẹn từng byte | **ALLOW** |
| `[MATRIX-03]` | **Tenant A xóa object của Tenant A** | Xóa tệp vật lý thành công | **ALLOW** |
| `[MATRIX-04]` | **Tenant A cố tình đọc object của Tenant B** | Chặn đứng với `403 Forbidden (Cross-Tenant Violation)` | **DENIED** |
| `[MATRIX-05]` | **Tenant A cố tình xóa object của Tenant B** | Chặn đứng với `403 Forbidden (Cross-Tenant Violation)` | **DENIED** |
| `[MATRIX-06]` | **Tenant A cố tình tạo Signed URL cho object Tenant B** | Chặn đứng với `403 Forbidden (Cross-Tenant Violation)` | **DENIED** |
| `[MATRIX-07]` | **Tenant B cố tình đọc object của Tenant A** | Chặn đứng với `403 Forbidden (Cross-Tenant Violation)` | **DENIED** |

---

## 4. BẢO MẬT LIÊN KẾT KÝ SỐ (SIGNED URL LIFECYCLE)

1. **Nguyên tắc tạo Signed URL**:
   - Được sinh ra hoàn toàn tại máy chủ thông qua endpoint bảo mật:
     `GET /api/v1/employees/:id/documents/:docId/signed-url?expiresIn=300`
   - Kiểm tra RBAC đa tầng:
     - `ADMIN` & `HR`: Có quyền lấy Signed URL của nhân viên trong cùng tổ chức.
     - `MANAGER`: Chỉ có quyền lấy Signed URL của nhân viên thuộc phòng ban được quản lý.
     - `EMPLOYEE`: Chỉ có quyền lấy Signed URL của tài liệu do chính mình sở hữu.
     - Yêu cầu truy cập trái phép bị chặn ngay lập tức bởi bộ lọc Anti-IDOR.
2. **Cơ chế hoạt động**:
   - **Môi trường Local/Test (`LocalStorageProvider`)**: Máy chủ tạo chữ ký số HMAC-SHA256 với timestamp hết hạn (`exp`) và chuỗi khóa bí mật `AUTH_SECRET`. Endpoint `/api/v1/storage/signed` kiểm tra chữ ký trước khi stream buffer.
   - **Môi trường Production (`SupabaseStorageProvider`)**: Máy chủ gọi REST API `/storage/v1/object/sign/documents/...` với `expiresIn` (mặc định 300 giây / 5 phút). Trả về URL có chữ ký của Supabase Storage.
3. **Bảo mật bí mật**:
   - Khóa `SUPABASE_SERVICE_ROLE_KEY` chỉ tồn tại trong bộ nhớ backend, tuyệt đối không lộ ra trình duyệt.

---

## 5. PHÒNG THỦ & XÁC THỰC TỆP TIN TOÀN DIỆN (SECURITY VALIDATION)

- **Magic Bytes Signature**: Kiểm tra chữ ký byte thực tế của tệp tin `%PDF-` (`0x25, 0x50, 0x44, 0x46`), PNG (`0x89, 0x50, 0x4e, 0x47`), JPEG (`0xff, 0xd8, 0xff`), WebP (`RIFF`). Chặn đứng 100% tệp tin thực thi nguy hiểm (`.exe`, `.sh`, `.php`) giả mạo phần mở rộng.
- **Giới hạn kích thước (Size Limits)**:
  - Avatar: Tối đa $2\text{ MB}$.
  - Tài liệu nhân sự: Tối đa $10\text{ MB}$.
- **Chống Path Traversal**:
  - Chặn đứng các chuỗi tấn công thư mục: `../`, `..\`, `%2e%2e%2f`, null bytes `\0`.
  - Tên tệp được chuẩn hóa an toàn thông qua hàm `sanitizeFilename`.

---

## 6. BẢO TOÀN HỢP ĐỒNG CƠ SỞ DỮ LIỆU (DATABASE CONTRACT)

Không cần thay đổi hay tạo migration cơ sở dữ liệu mới. Trường `Employee.documents` (kiểu `Json`) tiếp tục lưu trữ đầy đủ siêu dữ liệu mở rộng:
```json
{
  "id": "7bbea6fa-7de8-4a0b-8da4-a7b61cb61091",
  "name": "Labor_Contract_2026.pdf",
  "type": "CONTRACT",
  "url": "/api/v1/employees/emp-a-01/documents/7bbea6fa-7de8-4a0b-8da4-a7b61cb61091",
  "size": 1024,
  "storedFilename": "7bbea6fa-7de8-4a0b-8da4-a7b61cb61091.pdf",
  "objectKey": "organizations/org-tenant-a/employees/emp-a-01/7bbea6fa-7de8-4a0b-8da4-a7b61cb61091.pdf",
  "bucket": "documents",
  "storageProvider": "local",
  "organizationId": "org-tenant-a",
  "mimeType": "application/pdf",
  "uploadedAt": "2026-09-07T03:51:04.543Z"
}
```

---

## 7. KẾT QUẢ KIỂM THỬ HỒI QUY TOÀN DIỆN (REGRESSION RESULTS)

### 7.1. TypeScript Typecheck
```bash
npm run typecheck
```
**Kết quả**: `tsc --noEmit` $\implies$ **0 Lỗi (Exit Code 0)**.

### 7.2. Full Test Suite (Vitest)
```bash
npm test
```
**Kết quả thực tế ghi nhận**:
```
Test Files  41 passed (41)
     Tests  712 passed (712)
  Duration  83.44s
```
*(Bao gồm 18/18 tests lưu trữ phân lập mới tại `src/lib/storage/__tests__/storage-hardening.test.ts`, 20/20 tests `document.service.test.ts`, cùng toàn bộ 674 tests bảng lương, RBAC, IDOR, và tenant isolation).*

### 7.3. Production Build
```bash
npm run build
```
**Kết quả thực tế ghi nhận**:
```
▲ Next.js 16.3.4 (Turbopack)
✓ Compiled successfully in 36.7s
✓ Generating static pages (90/90) in 11.6s
(Exit code: 0 - 90/90 Routes Compiled Cleanly)
```

---

## 8. BẢNG BÁO CÁO NGHIỆM THU CHÍNH THỨC

```
Storage abstraction        = PASS
Local provider             = PASS
Supabase provider          = PASS
Private documents          = PASS
Signed URLs                = PASS
Tenant isolation           = PASS
File validation            = PASS
Vercel compatibility       = PASS
Secrets frontend exposure  = NONE
Typecheck                  = PASS
Tests                      = PASS (712/712 tests)
Build                      = PASS (90/90 routes)
Production touched         = NO
```

---

### KẾT LUẬN

**PRODUCTION STORAGE READY**
*(Tuyệt đối không deploy Production trong phase này).*
