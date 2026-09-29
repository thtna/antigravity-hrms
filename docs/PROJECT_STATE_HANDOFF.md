# 🛰️ BẢN BÀN GIAO TRẠNG THÁI DỰ ÁN (PROJECT STATE HANDOFF)
## HỆ THỐNG ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE SAAS PLATFORM
> **MỤC ĐÍCH**: Tài liệu này là **DUY NHẤT VÀ NGUYÊN BẢN (SINGLE SOURCE OF TRUTH)** để khôi phục và tiếp nối dự án sau khi restart máy, đóng IDE hoặc mất ngữ cảnh hội thoại. Mọi tác tử hoặc kỹ sư tiếp nhận bắt buộc phải đọc tài liệu này trước tiên.
>
> **LƯU Ý AN TOÀN**: Tài liệu TUYỆT ĐỐI KHÔNG chứa password, `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` hoặc token.

---

## 0. R5G STABLE RELEASE BASELINE & VERIFIED DEPLOYMENT SNAPSHOT

This section is authoritative for the stable application release lineage and dated verification evidence. Older phase reports remain historical evidence, not live deployment-state checks.

### Stable Application/Code Release Baseline

- **Application/code release baseline**: `e31e9b3e8aae3c944964babdbb83cc0fb9e09e50`. PR #1 delivered the approved product/security changes. This remains the R5G application/code baseline until a new product/code release is separately approved; documentation-only merges do not redefine it.

### R5G.11 Verified Deployment Snapshot (28/09/2026)

- **main at verification**: `aaacbb6cfa1c95a8571e0b2cf412804aa6e6da7b`
- **remote staging at verification**: `967a22f886edd962c798edf5a8d2adcd5fa0c854`
- **Production deployment**: `READY`
- **Production root HTTP**: `200`
- **Production health HTTP**: `200`
- **X-Vercel-Mitigated**: absent
- **Production public access**: restored
- **CI #33**: `SUCCESS`
- **Docker Build & Publish #8**: `SUCCESS`
- **Docker image digest**: `sha256:1f0e017b42221db6e8cbcbe8f978432edde92112777847737c32bd42a46c0b5c`
- **R5G.11 Production deployment and public smoke verification**: `PASS`
- **Release ready for normal use at verification**: `YES`

The Git and Vercel SHAs above are verified snapshots, not permanent current-ref invariants. Before any future operational action, read live `main`, `staging`, and Production deployment SHAs again from GitHub/Vercel.

### Release Lineage

- PR #1 merged the application/security release as `e31e9b3e8aae3c944964babdbb83cc0fb9e09e50`.
- PR #2 merged documentation-only reconciliation as `aaacbb6cfa1c95a8571e0b2cf412804aa6e6da7b`; its documentation commit/head was `967a22f886edd962c798edf5a8d2adcd5fa0c854`.
- Comparing the application baseline `e31e9b3e8aae3c944964babdbb83cc0fb9e09e50` with the R5G.11 deployment snapshot `aaacbb6cfa1c95a8571e0b2cf412804aa6e6da7b` changes only `README.md`, `docs/PRODUCTION_READINESS.md`, and `docs/PROJECT_STATE_HANDOFF.md`. No application source or workflow changed between those snapshots.

### R5G.3 Release Closure Evidence (Historical)

- PR #1 merged into `main` as `e31e9b3e8aae3c944964babdbb83cc0fb9e09e50`.
- R5G.3 verified a `READY` Production deployment from `main` at that exact SHA in Vercel project `antigravity-hrms`.
- **CI #30**: `SUCCESS`; **Docker Build & Publish #7 attempt 2**: `SUCCESS`; multi-platform image published.
- **R5G.3 Production deployment and public smoke verification**: `PASS`.
- Auth test route source files `src/app/api/v1/auth/test-roles/route.ts` and `src/app/api/v1/auth/test-ownership/[ownerId]/route.ts` are absent from the merge commit. Unauthenticated public GETs returned `401` via middleware, so direct live `404` route-absence proof remains partial.
- Docker #7 attempt 1 was cancelled after hitting the 30-minute workflow timeout while ARM64/QEMU made no progress; attempt 2 succeeded unchanged, so no Docker workflow remediation was required for this release. The exact deep cause of the first timeout is not proven.

### Production DB Verified Baseline

Neither R5G.3 nor R5G.11 accessed or revalidated Production DB. The values below remain the last previously verified read-only baseline, not a new verification by either phase. Do not access Production DB casually and do not reconstruct, request, print, or guess Production secrets.

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

`5I-G = PASS`; `5J-A = PASS`; `5J-A2 = PASS`; `5J-B = PASS`; `5J-C = PASS`; `5J-D = PASS`; `5J-E = PASS`; `5J-F = PASS`; `5K-A = PASS`; `5K-B1 = PASS`; `5K-B2 = PASS`; `R5G15A4B-S1 = PASS`; `R5G15A4B-S2 = PASS`.

### R5G15A4B Sub-Gate Verification Evidence (Storage Hardening & Staging Runtime Rehearsal)

- **Authoritative Source Commit**: `1da40441eed9f93e598b9bcbe1dabf4f70df2478` on branch `staging`.
- **CI Quality Gate #38**: `PASS`
- **R5G15A4B-S1 (Source Remediation & Unit Suite)**: `PASS`
  - Hardened `SupabaseStorageProvider.deleteWithDetails` with strict HTTP status parsing (`100..599`), property-presence validation, symmetric error signal contradiction scanning, and 2xx body status range enforcement.
  - Added targeted test suite `[SUPABASE-DEL-01]` through `[SUPABASE-DEL-30]`, `[SVC-DEL-01]`, `[SVC-DEL-02]` (50/50 passing).
- **R5G15A4B-S2 (Staging Storage Runtime Revision 7 Rehearsal)**: `PASS with eventual delete settlement evidence.`
  - Target bucket: `documents` (PRIVATE) on `antigravity-hrms-staging` (`rdpufonfascxgbydvtak.supabase.co`).
  - Target tenant: `588234eb-53f0-424b-835c-fc0f24d406a3`.
  - Target object key: `organizations/588234eb-53f0-424b-835c-fc0f24d406a3/employees/rev7-runtime-641d2286-f8d7-4ef6-bcf1-b96a4b04952d/doc-rev7-641d2286-f8d7-4ef6-bcf1-b96a4b04952d.pdf`.
  - Upload synthetic 303-byte PDF (`adcbda4582b892d43918b43c021f2ffc187f34a8df1770ef1727189fc5de0177`): `PASS`.
  - Authenticated download (303 bytes, exact SHA-256 match): `PASS`.
  - Signed URL creation and fetch (HTTP 200, 303 bytes, exact SHA-256 match): `PASS`.
  - Pre-delete parent list: item count = 1, exact match count = 1.
  - Exactly one `deleteWithDetails()` call executed (`DELETE_CALL_COUNT_TOTAL = 1`): HTTP 200, `responseOk: YES`, `redirectDetected: NO`, `errorCode: NONE`, `errorClass: NONE`, `errorSignalConflict: NO`, `classifiedSuccess: YES`.
  - **Settlement Evidence**: Immediate post-delete read remained HTTP 200; a later independent read-only settlement probe authoritatively proved NoSuchKey/404 and zero parent-list matches. The cause of settlement delay remains UNPROVEN.
  - Consistency metrics: `DELETE_EVENTUALLY_SETTLED = YES`, `DELETE_SETTLEMENT_MODEL = EVENTUAL`, `OBJECT_LEAK_LEFT_BEHIND = NO`, `SECOND_DELETE_REQUIRED = NO`, `CLEANUP_REQUIRED = NO`, `ROOT_CAUSE_OF_DELAY = UNPROVEN`.
  - Scope safeguards: No second delete, no automatic retry, no automatic cleanup, no DB/Data API/RLS/Production mutation. No credentials, authorization values, tokens, or signed URL values were exposed in the Rev7 verification outputs reviewed.
- **R5G15A4B Status Boundary**:
  - `R5G15A4B-S1 = PASS`
  - `R5G15A4B-S2 = PASS`
  - `R5G15A4B_FINAL = INCOMPLETE / UNPROVEN`
  - `PRODUCTION_CONTAINMENT_READY = INCOMPLETE / UNPROVEN`
  - `CUSTOMER_HANDOFF_READY = INCOMPLETE / UNPROVEN`

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

## 3. TRẠNG THÁI RELEASE HIỆN HÀNH (CURRENT RELEASE STATE)

- **R5G Production release**: complete and healthy; deployment `READY`, public root and health HTTP 200.
- **Next product/development mutation approved**: NONE. Any new scope requires separate Human Owner approval.

---

## 4. RÀO CẢN VÀ ĐIỀU KIỆN TIẾP TỤC (CURRENT BLOCKERS)

- **Release blocker**: NONE. Production is healthy and ready for normal use.
- **Documentation control**: Propose reconciliation when the handoff becomes stale; file mutation requires a Human Owner-approved gate. Determine document commit/push status from Git, not from this handoff.
- **Production guard**: Production remains protected. Any Production DB write, env change, WAF change, deploy, rollback, or promotion requires explicit operator authorization.
- **Operator/helper files**: Existing untracked helper files must remain uncommitted unless the operator explicitly approves.

---

## 5. CÁC GIAI ĐOẠN TIẾP THEO (NEXT PHASES ROADMAP)

1. **Next product/development phase**: propose a bounded scope and obtain separate Human Owner approval before any code, DB, env, WAF, or deployment change.
2. **Documentation reconciliation when needed**: verify the live state and Git status, then request explicit approval before editing, committing, or pushing.

---

## 6. NGUYÊN TẮC CỐT TỬ: PRODUCTION ĐÃ RELEASE, KHÔNG TỰ Ý THAY ĐỔI

- **Production deployed**: **YES**. The stable application/code baseline is `e31e9b3e8aae3c944964babdbb83cc0fb9e09e50`; the latest recorded R5G.11 verified deployment snapshot is `aaacbb6cfa1c95a8571e0b2cf412804aa6e6da7b`. Check GitHub/Vercel for the live current deployment SHA before any operational action.
- **R5G.11 snapshot deployment status**: **READY**.
- **Production public access**: **RESTORED**.
- **Production WAF freeze**: removed after validation; health-check rule preserved.
- **Production DB access**: exceptional only; no casual checks.
- **Chỉ thị chấp hành**: Không tự ý deploy, rollback, migrate, seed, thay đổi env/WAF, hoặc ghi vào Production Database khi chưa có văn bản/lệnh trực tiếp từ Người Phụ Trách.

---

## 7. HISTORICAL EMPIRICAL BENCHMARK — VERIFIED 08/09/2026

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

## 9. CƠ CHẾ ĐỀ XUẤT CẬP NHẬT TÀI LIỆU

> [!NOTE]
> **QUY TẮC BẮT BUỘC ĐỐI VỚI AI AGENT**:
> Sau mỗi phase, AI Agent phải phát hiện khi handoff có thể đã lỗi thời và đề xuất documentation reconciliation. Mọi file mutation chỉ được thực hiện trong gate có Human Owner approval; không tự ý stage, commit hoặc push.
> Khi đề xuất, đối chiếu release state, historical phase records, benchmark dates và danh mục báo cáo; không biến số liệu lịch sử thành kết quả mới.
> **Tuyệt đối không đưa credentials hoặc secrets vào tài liệu.**
