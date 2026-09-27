# 🛰️ BẢN BÀN GIAO TRẠNG THÁI DỰ ÁN (PROJECT STATE HANDOFF)
## HỆ THỐNG ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE SAAS PLATFORM
> **MỤC ĐÍCH**: Tài liệu này là **DUY NHẤT VÀ NGUYÊN BẢN (SINGLE SOURCE OF TRUTH)** để khôi phục và tiếp nối dự án sau khi restart máy, đóng IDE hoặc mất ngữ cảnh hội thoại. Mọi tác tử hoặc kỹ sư tiếp nhận bắt buộc phải đọc tài liệu này trước tiên.
>
> **LƯU Ý AN TOÀN**: Tài liệu TUYỆT ĐỐI KHÔNG chứa password, `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` hoặc token.

---

## 0. POST-RELEASE AUTHORITATIVE BASELINE (PHASE 5K-B2)

This section is the current authoritative state after the September Production release revalidation. Older phase reports remain historical evidence and must not be read as current deployment state when they conflict with this section.

- **Approved release SHA**: `93b8f8de3d480df578638ab47a20094ccce4fe35`
- **main**: `93b8f8de3d480df578638ab47a20094ccce4fe35`
- **staging**: `93b8f8de3d480df578638ab47a20094ccce4fe35`
- **Production deployment**: `READY`
- **Production root HTTP**: `200`
- **Production health HTTP**: `200`
- **X-Vercel-Mitigated**: absent
- **Production public access**: restored
- **RELEASE READY FOR NORMAL USE**: `YES`

### Production DB Verified Baseline

The last approved Production DB verification was read-only. Do not access Production DB casually and do not reconstruct, request, print, or guess Production secrets.

| Check | Verified Value |
| :--- | :--- |
| Migrations applied | `4` |
| Failed migrations | `0` |
| Organizations | `0` |
| Organization members | `0` |
| Branches | `0` |
| Fallback organization | absent |
| Fallback branch | absent |
| Platform SUPER_ADMIN count | `1` |
| Platform SUPER_ADMIN active | `YES` |
| Platform SUPER_ADMIN organizationId | `NULL` |
| Platform SUPER_ADMIN membership count | `0` |
| Platform SUPER_ADMIN employee count | `0` |
| Fallback defaults removed | `22/22` |
| Business data baseline | `EMPTY` |

### Completed Release Gates

`5I-G = PASS`; `5J-A = PASS`; `5J-A2 = PASS`; `5J-B = PASS`; `5J-C = PASS`; `5J-D = PASS`; `5J-E = PASS`; `5J-F = PASS`; `5K-A = PASS`; `5K-B1 = PASS`; `5K-B2 = PASS`.

### Verified Behavioral Guarantees

- `GET /api/v1/organization/meta` is zero-write.
- Payroll rule GET is zero-write.
- Payroll reads and simulation do not auto-seed payroll rules.
- Payroll simulation without usable configuration returns HTTP 400 and fails closed.
- Onboarding Step 6 requires explicit valid `departmentId` and `positionId`.
- Onboarding Step 6 with missing department/position returns HTTP 400.
- Onboarding Step 6 with invalid or wrong-tenant FK returns HTTP 400.
- Onboarding Step 6 with valid explicit department and position succeeds.
- No `BGD` department or `CEO` position fallback business rows are auto-created.

### Operational Boundaries

- Production DB writes, migrations, seed, env changes, WAF changes, deploys, rollbacks, or promotions require explicit operator authorization.
- No demo seed is allowed in Production.
- No fallback tenant defaults are allowed in Production.
- Platform SUPER_ADMIN remains outside all tenants.
- Tenant A must never access Tenant B.
- Untracked operator/helper files must be preserved and must not be committed accidentally.

---

## 1. THÔNG TIN CƠ BẢN VÀ KIẾN TRÚC HIỆN TẠI

- **Tên dự án**: Antigravity HRMS
- **Vị trí thư mục gốc**: `C:\Users\LNV\.gemini\antigravity-ide\scratch\antigravity-hrms`
- **Framework & Runtime**: Next.js 16.3.4 (Turbopack) / React 19 / Node.js LTS
- **ORM & Cơ sở dữ liệu**: Prisma 6.19.3 / Supabase PostgreSQL (Managed Tier, PostgreSQL 17.6)
- **Mô hình SaaS**: Multi-Tenant SaaS (Đa tổ chức dùng chung 1 database / 1 application code base)
- **Hạn mức nền tảng**: `MAX_TENANTS = 5` (Hệ thống chặn cứng tenant thứ 6 bằng HTTP 400 Bad Request)
- **Hạ tầng CSDL phân lập**:
  - **1 Cơ sở dữ liệu Production** đã được xác minh read-only theo baseline ở Mục 0; không truy cập thường quy.
  - **1 Cơ sở dữ liệu Staging** (`antigravity-hrms-staging`, Project Ref: `rdp***tak`)
- **Cơ chế phân lập dữ liệu (Tenant Isolation)**:
  - Bắt buộc lọc theo `organizationId` lấy từ JWT server-side session tại tầng Guard & Service.
  - Chống Mass Assignment bằng hàm bảo vệ `buildTenantScopedWhere`.
  - Cơ chế phòng thủ Sentinel Fail-Safe: Tự động gán `__no_org__` nếu session thiếu tenant ID.
  - Phân quyền RBAC 4 cấp: `OWNER` / `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`. Cổng Super Admin bảo vệ độc lập.
- **Bộ nhớ đệm (Caching)**:
  - `CacheManager` thiết kế 2 lớp: L1 In-Memory LRU với TTL tự động quét dọn mỗi 60s; L2 Redis phân tán (tùy chọn qua `REDIS_URL`).
- **Kiến trúc lưu trữ tệp (Storage Provider Abstraction)**:
  - `StorageProvider` Interface: Định nghĩa hợp đồng độc lập hạ tầng.
  - `LocalStorageProvider`: Dùng cho Local Dev & Vitest Suite, lưu tại `./storage/`, tạo Signed URL qua HMAC-SHA256.
  - `SupabaseStorageProvider`: Dùng cho Staging & Production trên Vercel Serverless, giao tiếp REST API Supabase Storage, **Zero local disk writes** (loại bỏ hoàn toàn lỗi `EROFS` và mất tệp Ephemeral của Lambda).
  - Phân vùng Object Key: Bắt buộc prefix `organizations/{organizationId}/employees/{employeeId}/...` hoặc `organizations/{organizationId}/avatars/...` kèm kiểm tra chống Path Traversal (`../`, `..\`, null bytes).

---

## 2. TRẠNG THÁI CÁC GIAI ĐOẠN ĐÃ ĐẠT CHUẨN (COMPLETED PHASES — 100% PASS)

Toàn bộ các phase dưới đây đã được kiểm chứng bằng thực nghiệm và vượt qua các cổng kiểm soát an toàn (KHÔNG chạy lại hoặc viết lại nếu không có yêu cầu thay đổi kỹ thuật):

| Phase | Mục Tiêu & Kết Quả | Trạng Thái Thẩm Định |
| :--- | :--- | :---: |
| **Phase 1 $\to$ 10.5** | Hoàn thành 10 phân hệ nền tảng (Employee, Attendance, Leave, Payroll, Payslip, Report, Excel, PDF, File, Notification) và vượt qua 20 trụ cột kiểm định an toàn tiền triển khai. | **READY FOR PRODUCTION (20/20 PASS)** |
| **Phase 10.6D1** | **Real Staging Prisma Migration**: Chạy thành công `prisma migrate deploy` trên Supabase Staging thật (`antigravity-hrms-staging`, PostgreSQL 17.6). Tạo 34 bảng, 73 Foreign Keys, 121 Indexes. | **REAL STAGING PRISMA MIGRATION VERIFIED** |
| **Phase 10.6D2** | **Real Staging Logical Data Rehydration**: Nạp dữ liệu thành công từ `dr_backup_preflight_verified.json` cho 17/17 thực thể kinh doanh (5 Orgs, 4 Members, 2 Employees...). Kiểm tra live query đối soát khớp 100% bản ghi. | **REAL STAGING LOGICAL REHYDRATION VERIFIED** |
| **Phase 11A.0** | **Production Environment Audit**: Rà soát tĩnh toàn bộ repo, xác định danh mục 7 biến môi trường cốt lõi bắt buộc tối thiểu cho Production, zero network calls. | **PRODUCTION REQUIRED ENV LIST VERIFIED** |
| **Phase 11A.0B** | **Production Environment Plan**: Phân loại 4 nhóm biến môi trường; phát hiện và phân tích rào cản `PRODUCTION BLOCKER FOR FILE UPLOADS` trên Vercel do cơ chế `fs/promises`. | **PRODUCTION ENV PLAN COMPLETED** |
| **Phase 11A.0C** | **Production Storage Hardening**: Xây dựng kiến trúc `StorageProvider Abstraction`, `LocalStorageProvider`, `SupabaseStorageProvider`, `StorageManager`, xác thực Magic Bytes (%PDF-, PNG, JPEG), Signed URL ngắn hạn, bảo mật tài liệu riêng tư. | **PRODUCTION STORAGE READY** |
| **Phase 11A.0C2** | **Live Supabase Storage Staging Verification**: Kiểm thử thực tế trên Supabase Storage Staging thật (`antigravity-hrms-staging`). Khởi tạo 2 private buckets (`avatars`, `documents`), thực hiện upload/download/signed-url/delete thật, kiểm chứng $A \leftrightarrow B$ DENIED, unauthenticated client signed URL fetch HTTP 200, zero secrets logged. | **LIVE STAGING STORAGE VERIFIED** |
| **Phase 11A.0E** | **Onboarding Step 6 P2028 Transaction Hardening**: Khắc phục triệt để lỗi Prisma P2028: phân loại rủi ro serverless lifecycle; rút gọn transaction xuống tối thiểu các DB writes nguyên tử; pre-lookup Role và băm mật khẩu ngoài transaction; bảo toàn RBAC bằng cờ `allowOwnerOnboarding`; hoàn thiện cơ chế idempotent retry (409 khi collision); xác nhận rollback an toàn (zero orphan user/partial employee); read-only staging DB clean. | **P2028 TRANSACTION HARDENING VERIFIED** |
| **Phase 5I-G -> 5J-F** | Release gate sequence completed through controlled Production validation, public access restoration, and post-release smoke verification. | **PASS** |
| **Phase 5K-A** | Post-release resume revalidation: Git refs, Vercel deployment, Production public root/health, and no drift. | **PASS** |
| **Phase 5K-B1** | Documentation reconciliation inventory and stale-state analysis, read-only. | **PASS** |
| **Phase 5K-B2** | Documentation reconciliation write phase completed against the approved 8 documentation files on local `staging`; no commit, push, deploy, Production access, or application code change. | **PASS** |

---

## 3. GIAI ĐOẠN HIỆN TẠI (CURRENT PHASE IN PROGRESS)

### **PHASE 5K-B3 — DOCUMENTATION DIFF CONTENT REVIEW**

- **Mục tiêu**:
  - Re-run the complete documentation diff content review after the targeted Phase 5K-B3A handoff correction.
  - Verify the approved 8-file documentation diff remains factually consistent before any commit decision.
  - Do not mark Phase 5K-B3 as PASS until that review is re-run successfully.
- **Trạng thái**: **CURRENT REVIEW GATE — RE-RUN REQUIRED AFTER PHASE 5K-B3A**.

---

## 4. RÀO CẢN VÀ ĐIỀU KIỆN TIẾP TỤC (CURRENT BLOCKERS)

- **Release blocker**: NONE. Production is healthy and ready for normal use.
- **Documentation blocker**: NONE after Phase 5K-B2. Phase 5K-B3 diff review must be re-run after the targeted handoff correction.
- **Production guard**: Production remains protected. Any Production DB write, env change, WAF change, deploy, rollback, or promotion requires explicit operator authorization.
- **Operator/helper files**: Existing untracked helper files must remain uncommitted unless the operator explicitly approves.

---

## 5. CÁC GIAI ĐOẠN TIẾP THEO (NEXT PHASES ROADMAP)

1. **PHASE 5K-B3 — DOCUMENTATION DIFF CONTENT REVIEW**: re-run exact diff review after Phase 5K-B3A correction; do not commit unless the review passes.
2. **Documentation commit decision**: operator decides whether to commit and push the approved documentation-only diff to `staging`.
3. **Next product development phase**: must be separately proposed and explicitly approved before any code, DB, env, WAF, or deployment change.

---

## 6. NGUYÊN TẮC CỐT TỬ: PRODUCTION ĐÃ RELEASE, KHÔNG TỰ Ý THAY ĐỔI

- **Production deployed**: **YES**, approved SHA `93b8f8de3d480df578638ab47a20094ccce4fe35`.
- **Production deployment status**: **READY**.
- **Production public access**: **RESTORED**.
- **Production WAF freeze**: removed after validation; health-check rule preserved.
- **Production DB access**: exceptional only; no casual checks.
- **Chỉ thị chấp hành**: Không tự ý deploy, rollback, migrate, seed, thay đổi env/WAF, hoặc ghi vào Production Database khi chưa có văn bản/lệnh trực tiếp từ Người Phụ Trách.

---

## 7. TRẠNG THÁI TEST & BUILD MỚI NHẤT (EMPIRICAL BENCHMARKS)

*Dữ liệu được thẩm tra thực tế tại ngày 08/09/2026:*

- **TypeScript Typecheck (`npx tsc --noEmit`)**:
  - Kết quả: **`PASS` (Exit Code: 0 — 0 Errors, 0 Warnings)**
- **Toàn bộ Test Suite (`npm test`)**:
  - Kết quả: **`PASS` (45 / 45 Test Files passed, 750 / 750 Tests passed — 100%)**
  - Thời gian chạy: ~16.7 giây.
- **Production Build (`npm run build`)**:
  - Kết quả: **`PASS` (92 / 92 Routes Compiled Cleanly trên Next.js 16.3.4 Turbopack)**
- **Tính bất biến tiền lương (Payroll Invariance)**:
  - Mức cơ sở 10,000,000 VND / tháng $\implies$ Bảo hiểm: 1,050,000 VND (10.5%), Thuế TNCN: 0 VND, Lương thực lĩnh: **8,950,000 VND** (Trùng khớp 100% từng bit).
- **Hạn mức đa khách hàng (Tenant Quota)**:
  - Đã duyệt 5 Tenants hoạt động (`ACTIVE`). Kích hoạt Tenant thứ 6 bị chặn lập tức bằng mã HTTP 400 Bad Request.

---

## 8. DANH MỤC CÁC TÀI LIỆU VÀ BÁO CÁO KỸ THUẬT QUAN TRỌNG

Tất cả báo cáo chi tiết nằm trong thư mục [`docs/`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/):

| Tên Báo Cáo | Mục Đích Kỹ Thuật |
| :--- | :--- |
| [`FINAL_RED_TEAM_REPORT.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/FINAL_RED_TEAM_REPORT.md) | Báo cáo kiểm định 20 trụ cột an toàn bảo mật tiền triển khai. |
| [`PRODUCTION_READINESS.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PRODUCTION_READINESS.md) | Báo cáo nghiệm thu sản phẩm, vòng đời tenant, loại bỏ mã demo. |
| [`PHASE_10_6D1_STAGING_MIGRATION.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_10_6D1_STAGING_MIGRATION.md) | Bằng chứng chạy migration thành công trên Supabase Staging PostgreSQL. |
| [`PHASE_10_6D2_REAL_REHYDRATION.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_10_6D2_REAL_REHYDRATION.md) | Bằng chứng nạp dữ liệu logic và đối soát 17 thực thể trên CSDL Staging. |
| [`PHASE_11A_0_ENV_AUDIT.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0_ENV_AUDIT.md) | Danh mục rà soát và phân loại các biến môi trường production. |
| [`PHASE_11A_0B_PRODUCTION_ENV_PLAN.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0B_PRODUCTION_ENV_PLAN.md) | Kế hoạch 4 nhóm biến môi trường và kiến trúc tệp Vercel. |
| [`PHASE_11A_0C_STORAGE_HARDENING.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0C_STORAGE_HARDENING.md) | Nghiệm thu kiến trúc lưu trữ đám mây phân tán và bảo vệ tài liệu riêng tư. |
| [`PHASE_11A_0C2_LIVE_STORAGE_STAGING.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0C2_LIVE_STORAGE_STAGING.md) | Nghiệm thu thực nghiệm Supabase Storage trên môi trường Staging thật. |
| [`PHASE_11A_0D_REAL_EMAIL_STAGING.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0D_REAL_EMAIL_STAGING.md) | Báo cáo kiểm định an toàn email staging và kích hoạt Safeguard Stop. |
| [`PHASE_11A_0D1_STAGING_PREVIEW_ENV_PLAN.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0D1_STAGING_PREVIEW_ENV_PLAN.md) | Kế hoạch cấu hình môi trường Vercel Preview (Staging Web) và ma trận biến môi trường. |
| [`PHASE_11A_0E_ONBOARDING_STEP6_P2028_FIX.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/PHASE_11A_0E_ONBOARDING_STEP6_P2028_FIX.md) | Báo cáo phân tích và khắc phục lỗi Prisma P2028, tối ưu transaction, idempotent retry, rollback regression. |
| [`MULTI_TENANT_SCHEMA.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/MULTI_TENANT_SCHEMA.md) | Đặc tả thiết kế cấu trúc CSDL đa tổ chức. |
| [`MULTI_TENANT_AUDIT.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/MULTI_TENANT_AUDIT.md) | Báo cáo kiểm toán phân lập dữ liệu giữa các tenant. |
| [`DISASTER_RECOVERY_RUNBOOK.md`](file:///C:/Users/LNV/.gemini/antigravity-ide/scratch/antigravity-hrms/docs/DISASTER_RECOVERY_RUNBOOK.md) | Cẩm nang phục hồi sự cố và quy trình tái nạp dữ liệu từ snapshot. |

---

## 9. CƠ CHẾ CẬP NHẬT TỰ ĐỘNG

> [!NOTE]
> **QUY TẮC BẮT BUỘC ĐỐI VỚI AI AGENT**:
> Sau khi hoàn thành bất kỳ Phase mới nào (ví dụ: hoàn tất Phase 11A.0C2 hoặc Phase 11A.0D), tác tử AI phụ trách **PHẢI TỰ ĐỘNG CẬP NHẬT TÀI LIỆU NÀY**:
> 1. Chuyển Phase vừa hoàn thành vào Mục 2 ("TRẠNG THÁI CÁC GIAI ĐOẠN ĐÃ ĐẠT CHUẨN").
> 2. Cập nhật Mục 3 ("GIAI ĐOẠN HIỆN TẠI") sang Phase tiếp theo.
> 3. Cập nhật số liệu tests (`npm test`), build (`npm run build`) tại Mục 7.
> 4. Bổ sung tên báo cáo nghiệm thu mới vào Mục 8.
> 5. Giữ vững nguyên tắc: **Tuyệt đối không đưa credentials hoặc secrets vào tài liệu.**
