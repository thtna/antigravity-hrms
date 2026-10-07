# 🛰️ BẢN BÀN GIAO TRẠNG THÁI DỰ ÁN (PROJECT STATE HANDOFF)
## HỆ THỐNG ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE SAAS PLATFORM
> **MỤC ĐÍCH**: Tài liệu này là **DUY NHẤT VÀ NGUYÊN BẢN (SINGLE SOURCE OF TRUTH)** để khôi phục và tiếp nối dự án sau khi restart máy, đóng IDE hoặc mất ngữ cảnh hội thoại. Mọi tác tử hoặc kỹ sư tiếp nhận bắt buộc phải đọc tài liệu này trước tiên.
>
> **LƯU Ý AN TOÀN**: Tài liệu TUYỆT ĐỐI KHÔNG chứa password, `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` hoặc token.

---

## 0. CURRENT RELEASE BASELINE & VERIFIED DEPLOYMENT SNAPSHOTS

### Current Production Release & Handoff Readiness Snapshot (08/10/2026) — R5D1F FINAL HANDOVER CLOSURE

This is the authoritative current-state snapshot for final handoff decisions after PR #12. Older dated snapshots below are historical evidence only.

- **R5D1F Production release**: `PASS / VERIFIED`.
- **Application/product release PR**: PR #11 — `MERGED / CLOSED`.
- **Final documentation publication PR**: PR #12 — `MERGED / CLOSED`.
- **Current Production/main SHA**: `c2b921d1bf68b55cc0907643db381bc61e6255b8`.
- **Current Production/main tree**: `dd390f5257a4db01a255af06923cf676da07c4e5`.
- **GitHub CI #84 / run 37655943415**: `SUCCESS` on exact current `main` SHA; `Quality Gate` = `SUCCESS`.
- **Docker Build & Publish #18 / run 37655944202**: `SUCCESS` on exact current `main` SHA.
  - GHCR digest = `sha256:d0e9641e82f6d449cd1e3888b0637c693fb03c6cd0b630c992351bf11b44a5b3`.
  - Published tags include `latest` and `sha-c2b921d`.
- **Canonical Vercel Production project**: `antigravity-hrms` (`prj_mXoCaJWR4TfXApRxDSwxuPmHz0dk`).
- **Canonical Production deployment**: `dpl_B3x6qMN1yDuuoFrxKAad2bBezTK6` = `READY` on exact current `main` SHA.
- **Canonical Production domain**: `antigravity-hrms-six.vercel.app` = verified.
- **Current Git-linked Vercel topology**: exactly `2` projects remain linked to `thtna/antigravity-hrms`: canonical Production `antigravity-hrms` and dedicated Staging `antigravity-hrms-staging`.
- **Legacy Vercel projects**: `antigravity-hrms-ri4s` and `antigravity-hrms-q64j` remain preserved but Git-disconnected.
- **R5D1F-F2C-M2**: `PASS / VERIFIED`. Natural `main` push from PR #12 produced staging deployment `dpl_44FcSwnLn5j72B8hqXfExxB74CDK` = `CANCELED`; Vercel build log states cancellation because the Ignored Build Step returned exit code `0`.
- **R5D1F-F2A**: `PASS / VERIFIED`.
- **R5D1F-F2B / F2B-M**: `PASS / VERIFIED`.
- **R5D1F-F2C-M1**: `PASS / VERIFIED`.
- **R5D1F-F3A**: `PASS / VERIFIED`; CI #82 = `SUCCESS`, staging Preview = `READY`.
- **R5D1F-F3B**: `PASS / VERIFIED`; PR #12 contained exactly three documentation files and PR CI #83 / `Quality Gate` = `SUCCESS`.
- **R5D1F-F3C**: `PASS / VERIFIED`; PR #12 = `MERGED / CLOSED`, merge SHA = `c2b921d1bf68b55cc0907643db381bc61e6255b8`, CI #84 = `SUCCESS`, Docker #18 = `SUCCESS`, canonical Production deployment = `READY`.
- **Branch protection**:
  - `main` = protected; PR flow required; `Quality Gate` required; up-to-date branch semantics enabled; approvals = 0.
  - `staging` = protected; direct normal pushes allowed; no required checks; force-push/deletion not allowed.
- **Production Supabase project**: `ombnluobsjzdzmjenqdt` = `ACTIVE_HEALTHY`, PostgreSQL `17.6`.
- **Production Prisma migrations**: `5` applied; latest = `20261005000000_phase_11a_0f_public_data_api_hardening`.
- **Production public DB topology**: `34` base tables, `73` foreign keys, `2` public enums.
- **Production RLS**: `34 / 34` public ordinary tables enabled; public RLS policy count = `0` intentionally under the deny-by-default Phase 11A.0F design.
- **Production runtime errors in final audit window**: no runtime error clusters observed in the fresh one-hour read-only check.
- **Open GitHub PRs/issues at final technical audit**: `0 / 0`.
- **Final technical handoff audit (08/10/2026)**: `PASS`; Git/branch protection, CI/Docker, two-project Vercel topology, F2C-M2 runtime filtering, Production DB topology and publication state were read-only verified.
- **Known accepted product limitation**: `NIGHT_OT_END_TO_END = BLOCKED_BY_DATA_MODEL / ACCEPTED LIMITATION`.
- **DR evidence boundary**: managed Supabase backup/PITR capability, retention and restore SLA remain `UNVERIFIED / PLAN-DEPENDENT`; do not represent them as guaranteed.
- **PROJECT_SPEC.md authority status**: `MISSING / UNPROVEN`; do not auto-create a substitute.
- **CUSTOMER_HANDOFF_READY**: `CONDITIONAL YES / PENDING F4A PUBLICATION + POST-PUBLICATION VERIFY`. This exact F4A document revision must be published to `main` and then pass one final read-only verification; once both are true, readiness becomes `YES` without another commit solely to flip the label.
- **Handoff closure conditions**: publish this exact F4A readiness-reconciliation revision to `main` through the approved PR/CI path, then run one post-publication read-only verification. All prior branch-protection, legacy Vercel fanout and F2C-M2 runtime-proof conditions are resolved.
- **Production safety invariant**: any future Production DB write, migration, seed, env/WAF change, deploy, rollback, account/password mutation or promotion requires separate explicit Human Owner approval.

### Historical Production Release Closure Snapshot (06/10/2026) — Phase 12F-R1

This was the verified Production release state as of 06/10/2026. It is retained as historical evidence and must not be treated as the current live deployment state after the 07/10/2026 R5D1F release.

- **FINAL_RELEASE_CLOSURE**: `PASS / VERIFIED`.
- **PHASE_12F-R1-C4R5**: `PASS / VERIFIED`.
- **PHASE_12F-R1-C4R6**: `PASS / VERIFIED / CLOSED`.
- **Release PR**: PR #7 — `Release: promote Phase 12F staging fixes to main`.
- **PR #7 state**: `MERGED`.
- **PR #7 exact head SHA**: `070593f6a4f608daf9c9a30bc2fae8f851a3148f`.
- **Application release merge SHA (PR #7)**: `0c88cb7cd86fa21d53bae92d906380d51c57a724`.
- **Current main/documentation-closure SHA after PR #8**: `3a5cfb3e93c14b95b7450132ddc74bd04a9d29ae`.
- **Application release tree (PR #7)**: `bae6dfc600c774d59faa15bc03977c594f30374d`.
- **Current main tree after documentation-only PR #8**: `4a4adac7ed6e427252c717b1ff7d368fdd94929f`.
- **Application source mutation in PR #8**: `NO`; PR #8 changed only `docs/PROJECT_STATE_HANDOFF.md`.
- **Staging HEAD at release closure**: `070593f6a4f608daf9c9a30bc2fae8f851a3148f`.
- **Staging tree at release closure**: `bae6dfc600c774d59faa15bc03977c594f30374d`.
- **Main/Staging source-content drift at closure**: `NO`; histories differ because `main` contains the PR merge commit, but the verified source trees are identical.
- **PR CI #56**: `SUCCESS`.
- **PR CI run ID**: `37480721840`.
- **PR CI event**: `pull_request`.
- **PR CI exact head SHA**: `070593f6a4f608daf9c9a30bc2fae8f851a3148f`.
- **Separate GitHub CI run for merge SHA `0c88cb7...`**: `NOT OBSERVED` in the final read-only audit; do not reinterpret PR CI #56 as a separate merge-SHA CI run.
- **Canonical Vercel project**: `antigravity-hrms`.
- **Canonical Production deployment ID**: `dpl_8rKggzkeZ2GQB9DTAr3Ry2KPKzdW`.
- **Canonical Production domain**: `antigravity-hrms-six.vercel.app`.
- **Canonical deployment branch**: `main`.
- **Canonical deployment Git SHA**: `3a5cfb3e93c14b95b7450132ddc74bd04a9d29ae`.
- **Vercel Production state**: `READY`.
- **Production `/` smoke test**: HTTP `200 OK`.
- **Production `/login` smoke test**: HTTP `200 OK`.
- **Production `/api/health` smoke test**: HTTP `200 OK`.
- **Health response**: application reports `HEALTHY`, version `1.0.0`.
- `/api/health` proves application/process responsiveness only and does **not** independently prove database health.
- **Production authenticated Admin/HR Dashboard**: `PASS / VERIFIED`.
- **Dashboard Internal Server Error after Phase 12F repair**: `NOT REPRODUCED`.
- **Production tenant UAT organization**: `Vũ Trụ Mới`.
- **Production tenant status after UAT**: `ACTIVE`.
- **Production onboarding state after UAT**: step `9`, `onboarding_skipped = false`, `onboarding_completed_at` populated.
- **Production onboarding Steps 6 → 8**: executed under explicit Human Owner-approved gate `PHASE_12F-R1-C4R6`.
- **Production Step 6**: first employee created successfully.
- **Production Step 7**: worksite `Văn Phòng Trụ Sở Chính` created successfully.
- **Production Step 8**: `PASS / VERIFIED`; exactly one `VN_STATUTORY_2026` payroll rule observed for the UAT tenant.
- **Production payroll rule**:
  - code = `VN_STATUTORY_2026`
  - name = `Vietnam Statutory 2026 - Core Payroll Configuration`
  - version = `1`
  - active/default = `true`
  - effective from = `2026-01-01`
  - minimum wage region = `I`
  - standard work days = `22`
  - standard hours/day = `8`
  - weekday OT = `1.5`
  - weekly-rest OT = `2`
  - holiday OT = `3`
  - night bonus rate = `0.3`
  - employee social/health/unemployment rates = `0.08 / 0.015 / 0.01`
  - employer social/health/unemployment rates = `0.175 / 0.03 / 0.01`
  - reference amount / statutory floor = `2,340,000`
  - statutory cap = `46,800,000`
  - Region I unemployment cap = `106,200,000`
  - PIT personal relief = `15,500,000`
  - PIT dependent relief = `6,200,000`
  - PIT model = verified 5-bracket 2026 progressive schedule
  - rounding = `1,000 / ROUND_HALF_UP`
- **Known accepted limitation**: `NIGHT_OT_END_TO_END = BLOCKED_BY_DATA_MODEL / ACCEPTED LIMITATION`.
- **Production DB mutation in this release/UAT cycle**: `YES`, but only through the explicitly approved Production onboarding UAT Steps 6 → 8; no unrelated DB mutation was authorized.
- **Manual Production deployment**: `NO`; deployment was triggered by the approved `main` merge through Git integration.
- **Force push**: `NO`.
- **PHASE_12F-R1-C4R7**: `PASS / VERIFIED / CLOSED`.
- **PHASE_12F-R1-C4R8**: `PASS / VERIFIED / CLOSED`.
- **PHASE_12F-R1-C4R9**: `PASS / VERIFIED / CLOSED`.
- **PHASE_12F-R1-C4R10**: `PASS / VERIFIED / CLOSED`.
- **PHASE_12F-R1-C4R11**: `PASS / VERIFIED / CLOSED`; closure handoff committed on `staging` as `85eee743a24abc54ffde6d1cf4cc00059359917c`.
- **PHASE_12F-R1-C4R12**: `PASS / VERIFIED / CLOSED`; exact commit pushed to remote `staging`; Preview `dpl_DXpsjGtvBWbgz1pbWjLFsYDgS8Fj` = `READY`.
- **PHASE_12F-R1-C4R13**: `PASS / VERIFIED / CLOSED`; PR #8, CI #60 / run `37494835022` = `SUCCESS`.
- **PHASE_12F-R1-C4R14**: `PASS / VERIFIED / CLOSED`; PR #8 merged to `main` as `3a5cfb3e93c14b95b7450132ddc74bd04a9d29ae`; Production deployment `dpl_8rKggzkeZ2GQB9DTAr3Ry2KPKzdW` = `READY`.
- **Merge-SHA CI for `3a5cfb3e...`**: `NOT OBSERVED`; PR CI #60 must not be represented as a separate merge-SHA CI run.
- **CUSTOMER_HANDOFF_READY**: `CONDITIONAL YES` — readiness becomes `YES` when this exact final-closure document version is present on `main` and the final read-only handoff audit passes; otherwise it remains `PENDING`.
- **FINAL_HANDOFF_CLOSURE_RULE**: once both conditions above are true, no additional documentation mutation is required solely to change the readiness label.


### Current Production Release Closure Snapshot (04/10/2026)

This snapshot is the latest verified Production release state. Older R5G/R7 records below remain historical evidence and must not be reinterpreted as the current live deployment state.

- **PRODUCTION_RELEASE_CLOSURE_AUDIT**: `PASS / VERIFIED`.
- **Release PR**: PR #5 — `Release: promote validated staging checkpoint to main`.
- **PR #5 state**: `MERGED`.
- **Production/main release SHA**: `a8eca8daef87fa51a6efdf7bf60d8b005249444f`.
- **Production release tree**: `d82487cab83cd237ae7c2d3f2de8487350b47674`.
- **Staging HEAD at closure**: `fb884fee763a4aa54a9b3f71488c09f23803d5f2`.
- **Staging tree at closure**: `d82487cab83cd237ae7c2d3f2de8487350b47674`.
- **Main/Staging source-content drift**: `NO`; their Git histories differ, but their verified trees are identical.
- **CI #44**: `SUCCESS`.
- **CI Quality Gate**: `SUCCESS`.
- **Docker Build & Publish #11**: `SUCCESS`.
- **Vercel Production deployment status**: `4 / 4 READY`.
- **Vercel commit status contexts**: `4 / 4 SUCCESS`.
- **Canonical Vercel project**: `antigravity-hrms`.
- **Canonical Production deployment ID**: `dpl_3KyVMKAd5QuQqVzY2mveiXXJWEfn`.
- **Canonical Production domain**: `antigravity-hrms-six.vercel.app`.
- **Canonical deployment source**: `git`.
- **Canonical deployment branch**: `main`.
- **Canonical deployment Git SHA**: `a8eca8daef87fa51a6efdf7bf60d8b005249444f`.
- **Production `/` smoke test**: HTTP `200 OK`.
- **Production `/login` smoke test**: HTTP `200 OK`.
- **Production `/api/health` smoke test**: HTTP `200 OK`.
- **Health response**: application reports `HEALTHY`, version `1.0.0`.
- **Runtime errors observed in closure audit window**: `NONE`.
- **Observed returned runtime status-code group**: HTTP `200`.
- **Manual Production deployment**: `NO`; Production deployment was triggered by the approved `main` merge through Git integration.
- **Force push**: `NO`.
- **Production DB access during release closure**: `NO`.
- **Production DB mutation during release closure**: `NO`.
- `/api/health` verifies application/process responsiveness only. It does **not** query the database and therefore does not prove Production DB connectivity, migration state, seed/bootstrap completion, or business-data correctness.
- Any future Production DB access, migration, seed, environment change, WAF change, rollback, promotion, or deployment still requires separate explicit Human Owner authorization.

### Phase 11A.0D Real Email Staging E2E Closure Snapshot (05/10/2026)

- **PHASE_11A_0D_FULL_E2E**: `PASS / VERIFIED`.
- **Execution environment**: `STAGING ONLY`.
- **Production touched by this E2E gate**: `NO`.
- **Read-only reconciliation before execution**:
  - Live `main`: `a8eca8daef87fa51a6efdf7bf60d8b005249444f`.
  - Live `staging`: `4a680c673434a6aae5db29bd0e78f9144712bf90`.
  - Canonical Vercel Production deployment remained `READY` at the exact `main` SHA above.
  - Latest staging Preview remained `READY` at the exact staging SHA above.
  - Supabase staging project `antigravity-hrms-staging`, ref `rdpufonfascxgbydvtak`, remained `ACTIVE_HEALTHY`.
  - Production DB was not accessed or revalidated.
- **Staging test tenant owner**: `namcharm040889+r5g15a4c-owner@gmail.com`.
- **Staging test tenant**: `R5G15A4C Staging Test Tenant`.
- **Live staging tenant state before execution**:
  - user active = `YES`
  - deleted = `NO`
  - membership = `OWNER`
  - membership active = `YES`
  - application role = `Administrator`
  - organization status = `ACTIVE`
  - onboarding step = `9`
- **Email provider**: `sendgrid`.
- **Verified sender**: `nguyennam040889.dongsaigon@gmail.com`.
- **Fresh Forgot Password retry request**: `PASS / VERIFIED`.
- **Fresh email received**: `PASS / VERIFIED`.
- **Fresh email timestamp**: `2026-10-04T19:03:21Z`.
- **Fresh email location in Gmail**: `SPAM`.
- **Reset link reached Staging**: `PASS / VERIFIED`.
- **Password reset**: `PASS / VERIFIED`.
  - Staging runtime: `POST /api/v1/auth/reset-password` = HTTP `200`.
  - Runtime logged `Password reset successfully completed for user`.
- **New-password login**: `PASS / VERIFIED`.
  - Staging runtime: `POST /api/v1/auth/login` = HTTP `200`.
  - Runtime logged successful login for the exact staging tenant owner.
- **Old-password login**: `FAIL AS EXPECTED / VERIFIED`.
  - Staging runtime: `POST /api/v1/auth/login` = HTTP `400`.
  - Runtime logged `Login failed: invalid password`.
- **Token reuse**: `BLOCKED / VERIFIED`.
  - Reuse attempt reached Staging `POST /api/v1/auth/reset-password`.
  - Response = HTTP `400`.
  - UI reported reset link expired after the 15-minute TTL.
- **Token-reuse evidence qualification**:
  - The live E2E proves that the previously used reset URL could not perform another reset.
  - The observed reuse failure occurred after the token TTL had also elapsed.
  - Therefore this live test must NOT be represented as isolated causal proof that password-hash-bound one-time invalidation alone caused the rejection.
  - Source code separately implements password-hash binding and atomic old-hash protection against token reuse/races.
- **Old reset tokens**: `DO NOT REUSE`.
- **Phase result**: `PHASE_11A_0D_FULL_E2E = PASS / VERIFIED`.

### Phase 11A.0F Public Data API / RLS Hardening Closure Snapshot (05/10/2026)

- **PHASE_11A_0F_STAGING_RLS_HARDENING**: `PASS / VERIFIED / RUNTIME-SAFE`.
- **Execution environment**: `STAGING ONLY`.
- **Production touched**: `NO`.
- **Production/main SHA remained**: `a8eca8daef87fa51a6efdf7bf60d8b005249444f`.
- **Final remote staging SHA**: `68e5976f47a97e0c731b5d10292ab0979bb13d75`.
- **Phase 11A.0F Git commit**: `68e5976f47a97e0c731b5d10292ab0979bb13d75`.
- **Commit subject**: `security: add phase 11a.0f public data api hardening migration`.
- **Migration path**: `prisma/migrations/20261005000000_phase_11a_0f_public_data_api_hardening/migration.sql`.
- **Migration SHA256**: `3EB9E1DB99B6A168D560B2EE044DCF5E33BF88325B5BB7B45F5D32D560CB0ADD`.
- **Migration execution path**: Prisma Migrate remained canonical; staging used `prisma migrate deploy`.
- **Migration apply**: `PASS / VERIFIED`.
- **Post-deploy Prisma status**: `PASS`; database schema reported up to date.
- **Supabase staging**: `antigravity-hrms-staging`, ref `rdpufonfascxgbydvtak`, remained `ACTIVE_HEALTHY`.
- **Public table topology**: exact `34` public ordinary tables.
- **RLS after hardening**: `34 / 34` public tables enabled.
- **FORCE RLS**: `NO`, intentionally.
- **Public RLS policies**: `0`, intentionally.
- **anon/authenticated direct public-table privileges**: revoked.
- **postgres default privileges for future public tables/sequences/functions**: hardened against anon/authenticated.
- **service_role SELECT coverage**: preserved across all 34 public tables by migration assertion.
- **Business authentication architecture**: HRMS JWT/cookie model remains authoritative; no Supabase Auth `auth.uid()` client-policy model was introduced.
- **Staging database password rotation**: `PASS / VERIFIED`; no password is recorded here.
- **Vercel staging DATABASE_URL rebind**: `PASS / VERIFIED`; branch-scoped Preview/staging configuration was rebound to the rotated credential.
- **New-password Prisma authentication through Session Pooler port 5432**: `PASS / VERIFIED`.
- **Post-rotation staging runtime DB connectivity**: `PASS / VERIFIED`.
- **Post-RLS staging runtime DB connectivity**: `PASS / VERIFIED`.
- **Canonical staging Preview after push**: `dpl_CSVhDuohpYKeqcq8CRW1btu3F8mc`.
- **Canonical staging Preview state**: `READY`.
- **Canonical staging Preview branch/SHA**: `staging` / `68e5976f47a97e0c731b5d10292ab0979bb13d75`.
- **Canonical Vercel status for pushed commit**: `SUCCESS`.
- **Residual platform boundary**: `supabase_admin` default ACL hardening was intentionally outside this Prisma migration scope.
- **Residual untracked operator/evidence artifacts**: `56`; preserve untouched.
- **PROJECT_SPEC.md**: `MISSING / UNPROVEN`; do not create automatically.
- **Phase result**: `PHASE_11A_0F = PASS / VERIFIED / CLOSED`.

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
  - `NEXT_CANONICAL_GATE = UNPROVEN`

### R5G15A4B Post-Push Verification Snapshot (30/09/2026)

- **Documentation Commit Pushed to Staging**: `48c5243391e82b8a68e67c12eaa7652e4dcf11c2` (`docs: record R5G15A4B storage verification`).
  - Remote staging before push: `1da40441eed9f93e598b9bcbe1dabf4f70df2478`.
  - Remote staging after push: `48c5243391e82b8a68e67c12eaa7652e4dcf11c2`.
  - Live `refs/heads/main` observed before push: `acc3702abbb9b833d01f99d148a3117d6d14a041` (cached `origin/main` was stale and must not be treated as authoritative).
- **Execution & Safety Guards**:
  - `PRE_PUSH_GUARD = PASS`
  - `PUSH_EXECUTED = YES` (`PUSH_COUNT = 1`, `EXPECTED_COMMIT_REACHED_REMOTE = YES`)
  - `FORCE_PUSH_EXECUTED = NO`
  - `MAIN_PUSH_EXECUTED = NO`
  - `PRODUCTION_DEPLOY_EXECUTED = NO`
  - `VERCEL_SETTING_MUTATION_EXECUTED = NO`
- **Pre-Push Baseline Verification**:
  - Branch: `staging` | Local HEAD: `48c5243391e82b8a68e67c12eaa7652e4dcf11c2`
  - Staged tracked count = 0 | Unstaged tracked count = 0
  - Untracked count = 57 | Untracked fingerprint = `17F37294D7AE11B7E289BF9E420B99838489DDF793127BBEAF42795CF2D3F778` (baseline match = YES)
  - `DIFF_CHECK_RESULT = PASS` | `CACHED_DIFF_CHECK_RESULT = PASS`
- **GitHub CI**:
  - Target SHA: `48c5243391e82b8a68e67c12eaa7652e4dcf11c2` | Branch: `staging` | Event: `push`
  - Workflow: `CI` | Run number: `41` | Run ID: `36667125364`
  - Status: `completed` | Conclusion: `success` | Quality Gate: `success`
- **Vercel Git Deployment Evidence**:
  - Vercel Git deployment/status evidence for the exact staging commit = `SUCCESS`.
  - Vercel Preview Comments: `completed` / `success`.
  - Commit status context: `Vercel – antigravity-hrms` (description: `Deployment has completed`).
  - Multiple Vercel status contexts were present for this commit.
- **Control Deviation Record**:
  - During read-only investigation, unapproved transcript-content reads occurred.
  - Subsequent Git State Revalidation proved: 0 tracked modifications, 57 untracked files with exact fingerprint match, and the frozen repository content baseline was unchanged. No repository-content mutation was evidenced from these deviations.
- **Invariants & Scope Boundary**:
  - Successful staging CI and Vercel status evidence do not alter the recorded R5G15A4B-S2 runtime evidence or infer Production readiness.
  - `R5G15A4B-S1 = PASS`
  - `R5G15A4B-S2 = PASS`
  - `R5G15A4B_FINAL = INCOMPLETE / UNPROVEN`
  - `PRODUCTION_CONTAINMENT_READY = INCOMPLETE / UNPROVEN`
  - `CUSTOMER_HANDOFF_READY = INCOMPLETE / UNPROVEN`
  - `NEXT_CANONICAL_GATE = UNPROVEN`

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

### R7 Post-Release Verification & Staging DB Preflight Snapshot (03/10/2026)

- **Branch**: `staging`
- **HEAD**: `99b47733ffe8cf10c780c267c27c1f051ab115ed`
- **Pre-reconciliation Git baseline**:
  - Staged = 0
  - Short = 148
  - Porcelain = 182
  - STATUS_SHA256 = `E96AA0A0F5D4C0704DBBCB7E0EB6006A87E3918318A784439FAD361BE5A526E1`
- **13 locked historical hashes matched**: `ALL_13_MATCH = True`.
- **Windows font references in src**: `0`.
- **R7-B4 Full Local Verification = VERIFIED_COMPLETE**:
  - Targeted PDF tests: 28/28 PASS (`payslip.service.test.ts`, `report.service.test.ts`).
  - Typecheck (`tsc --noEmit`): PASS (0 diagnostics).
  - Build (`next build`): PASS (92/92 routes compiled cleanly).
  - Lint (`npm run lint`): PASS (0 errors, 174 non-blocking warnings, no `--fix`).
  - Full suite (`npm test`): 69/69 files, 1214/1214 tests PASS.
  - PDF standalone Windows-font trace issue remediated (`.next/standalone` fonts verified).
- **R7-C0C Staging DB Credential Preflight = VERIFIED_COMPLETE**:
  - Expected staging project ref: `rdpufonfascxgbydvtak`.
  - DATABASE_URL topology verified for port 6543 (`SUPABASE_POOLER`).
  - DIRECT_URL topology verified for port 5432 (`SUPABASE_POOLER`).
  - Credential structural completeness = YES.
  - Placeholder detected = NO.
  - No remote connection was performed during R7-C0C.
- **R7-C1 Remote Staging Migration Status = VERIFIED_COMPLETE**:
  - Remote Staging connection verified via local Prisma binary 6.19.3.
  - Prisma migrate status exit code = 0.
  - Local migration inventory = 4.
  - Prisma result: `Database schema is up to date!`.
  - Pending local migrations = 0.
  - Containment after R7-C1 = VERIFIED_PASS.
- **Scope & Schema Qualification**:
  - R7-C1 proves that all 4 local migrations are applied on the Staging database and no local migration is pending. It does NOT independently prove zero physical schema drift outside Prisma migration history.
- **Project-State Boundaries**:
  - `NEXT_CANONICAL_GATE = UNPROVEN`
  - `Next product/development mutation approved = NONE`


### Current Local Engineering Checkpoint (04/10/2026)

- **Local branch**: `staging`
- **Current local HEAD**: `6dba05efaf42c347ae0f2e1ce359914c1cfcb37f`.
- This is a **local engineering checkpoint**, not evidence that these commits were pushed to remote Staging or deployed to Production.
- **Current local engineering commit chain after `99b47733ffe8cf10c780c267c27c1f051ab115ed`**:
  - G03 `b5851128b36a3ee1e19b238891975ebf94171256` — `build: exclude local artifacts from Docker context`.
  - G02 `e1da08ef84931f196330667444d2b6fef4a370ba` — `chore: scope CommonJS lint exception to operator scripts`.
  - G01 `401e2174c795bbc9667d91c4b2bb27ee2647a9f5` — `fix: separate application startup from database initialization`.
  - G04 `1a10092dd082f04da4da560fd03e54a6dd2e8fb1` — `feat: add canonical business time helpers`.
  - G05 `0e5b7af4f16d49431eccd01e8894c59eeb2f9014` — `feat: harden attendance workflows and tenant scoping`.
  - G06 `5a08a7e2397f866bc750b5f4de12f062eb201534` — `feat: harden finance and scheduling tenant workflows`.
  - G07 `23629530ba61d81903a56a9563c0fc33c64d2e37` — `feat: harden tenant storage and provider fail-closed behavior`.
  - G08 `804e2291b020cb93c35596bf6e071440b28a5568` — `fix: remove host-specific PDF font fallback`.
  - G09 `46f39038003f731d6557825c79212857d26b3238` — `fix: enforce business-date validation across employee leave and onboarding`.
  - G10 `6451938c31413d90043adcfac6dbe012d273187f` — `test: expand cross-group regression coverage`.
  - G13 `eeee6866aa1b92d48ebbe3129b80355ab5af6409` — `feat: harden derived workflows and tenant-safe business time`.
  - Residual business-time source-contract commit `6dba05efaf42c347ae0f2e1ce359914c1cfcb37f` — `test: preserve business-time source contracts`.
- **G01-G10 and G13 current engineering work**: `COMMITTED_LOCAL / POST_COMMIT_VERIFIED`.
- **G13 current engineering scope**:
  - Exact validated engineering scope = 26 paths.
  - ESLint = PASS, 0 errors / 42 warnings.
  - HOST = 182/182 PASS.
  - UTC = 182/182 PASS.
  - America/Los_Angeles = 182/182 PASS.
  - Commit `eeee6866aa1b92d48ebbe3129b80355ab5af6409` = 26 paths, 24 modified + 2 added, 618 insertions / 146 deletions.
- **Residual source-contract regression tests**:
  - 5 source-contract tests classified as product regression tests.
  - ESLint = PASS.
  - HOST Vitest = 5 files / 28 tests / 28 passed / 0 failed / 0 pending.
  - Commit `6dba05efaf42c347ae0f2e1ce359914c1cfcb37f` = 5 added files, 344 insertions / 0 deletions.
- **Historical G13 boundary remains separate**:
  - Historical G13 scope was recorded as 26 paths.
  - Historical tracked core = 23 verified paths.
  - Historical exact untracked member count = 3.
  - The identities of those exact historical 3 remain `UNPROVEN`.
  - Do not reinterpret the current validated 26-path engineering scope as proof of historical G13 membership.
- **G11 / operator-historical residual boundary**:
  - Current residual untracked count = 56.
  - These artifacts remain outside approved product/test commits and must not be staged or committed automatically.
- **G12 documentation durability boundary**:
  - This handoff records the verified local engineering checkpoint through HEAD `6dba05efaf42c347ae0f2e1ce359914c1cfcb37f`.
  - The live stage, commit, push, and deployment status of this document must be determined from current Git/runtime evidence, not from this checkpoint text.
- **PROJECT_SPEC authority status**:
  - `docs/PROJECT_SPEC.md` does not exist in the worktree.
  - It is not tracked.
  - It has no Git path history in the available repository evidence.
  - Status = `MISSING / UNPROVEN`.
  - Do not create or promote another document as its replacement without a separate approved governance decision.
- **Validation boundary**:
  - R7-B4 69-file / 1214-test full-suite evidence remains historical.
  - This checkpoint does not claim a newly executed full suite, full typecheck, or full Production build.
- **Remote / deployment boundary**:
  - The new local commits through `6dba05efaf42c347ae0f2e1ce359914c1cfcb37f` have **no push evidence in this checkpoint**.
  - They have **no Production deployment evidence in this checkpoint**.
  - Existing R5G Production records remain historical release evidence only and do not prove deployment of these new local commits.
- **Governance**:
  - No push is authorized by this correction.
  - No deployment is authorized by this correction.
  - Production DB writes, migrations, seed, env/WAF changes, rollback, promotion, or deployment require separate explicit Human Owner approval.
---

## 1. THÔNG TIN CƠ BẢN VÀ KIẾN TRÚC HIỆN TẠI

- **Tên dự án**: Antigravity HRMS
- **Vị trí thư mục gốc**: `C:\Users\LNV\.gemini\antigravity-ide\scratch\antigravity-hrms`
- **Framework & Runtime**: Next.js 16.3.4 (Turbopack) / React 19 / Node.js LTS
- **ORM & Cơ sở dữ liệu**: Prisma 6.19.3 / Supabase PostgreSQL (Managed Tier, PostgreSQL 17.6)
- **Mô hình SaaS**: Multi-Tenant SaaS (Đa tổ chức dùng chung 1 database / 1 application code base)
- **Hạn mức nền tảng**: `MAX_REGISTERED_TENANTS = 5` (mọi organization chưa soft-delete đều tiêu thụ một registration slot; đăng ký tenant thứ 6 bị chặn, không còn áp quota theo số tenant ACTIVE)
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
| **Phase 11A.0D** | **Real Email Staging E2E**: xác minh Forgot Password bằng email thật qua SendGrid trên Staging, reset link đúng Staging, reset password thành công, mật khẩu mới đăng nhập PASS, mật khẩu cũ bị từ chối, và reset URL cũ không thể thực hiện reset lại. | **LIVE STAGING REAL EMAIL / PASSWORD RESET E2E VERIFIED** |
| **Phase 11A.0E** | **Onboarding Step 6 P2028 Transaction Hardening**: Khắc phục triệt để lỗi Prisma P2028: phân loại rủi ro serverless lifecycle; rút gọn transaction xuống tối thiểu các DB writes nguyên tử; pre-lookup Role và băm mật khẩu ngoài transaction; bảo toàn RBAC bằng cờ `allowOwnerOnboarding`; hoàn thiện cơ chế idempotent retry (409 khi collision); xác nhận rollback an toàn (zero orphan user/partial employee); read-only staging DB clean. | **P2028 TRANSACTION HARDENING VERIFIED** |
| **Phase 12F-R1 (C4R1B → C4R6)** | Vietnam 2026 payroll remediation, controlled Step 8 staging UAT, Admin Dashboard Prisma P2024 serialization repair, PR #7 release, exact Production deployment verification, Production onboarding Steps 6→8, payroll-rule verification and authenticated Admin/HR Dashboard validation. | **PASS / VERIFIED / CLOSED through C4R6** |
| **Phase 5I-G -> 5J-F** | Release gate sequence completed through controlled Production validation, public access restoration, and post-release smoke verification. | **PASS** |
| **Phase 5K-A** | Post-release resume revalidation: Git refs, Vercel deployment, Production public root/health, and no drift. | **PASS** |
| **Phase 5K-B1** | Documentation reconciliation inventory and stale-state analysis, read-only. | **PASS** |
| **Phase 5K-B2** | Documentation reconciliation write phase completed against the approved 8 documentation files on local `staging`; no commit, push, deploy, Production access, or application code change. | **PASS** |

---

## 3. TRẠNG THÁI RELEASE HIỆN HÀNH (CURRENT RELEASE STATE)

- **Production release**: `PASS / VERIFIED`.
- **Application/product release PR**: PR #11 = `MERGED / CLOSED`.
- **Final documentation publication PR**: PR #12 = `MERGED / CLOSED`.
- **Current Production/main SHA**: `c2b921d1bf68b55cc0907643db381bc61e6255b8`.
- **Current Production/main tree**: `dd390f5257a4db01a255af06923cf676da07c4e5`.
- **F4A staging parent/baseline**: current `main` merge SHA above; F4A changes only this handoff file and `docs/IMPLEMENTATION_ROADMAP.md`.
- **Current Production CI**: CI #84 / run `37655943415` = `SUCCESS`; `Quality Gate` = `SUCCESS`.
- **Current Docker publish**: Docker #18 / run `37655944202` = `SUCCESS`; digest = `sha256:d0e9641e82f6d449cd1e3888b0637c693fb03c6cd0b630c992351bf11b44a5b3`.
- **Canonical Production Vercel project/domain**: `antigravity-hrms` / `antigravity-hrms-six.vercel.app`.
- **Canonical Production deployment**: `dpl_B3x6qMN1yDuuoFrxKAad2bBezTK6` = `READY` on exact current `main` SHA.
- **Dedicated Staging Vercel project/domain**: `antigravity-hrms-staging` / `antigravity-hrms-jped.vercel.app`.
- **Current Git-linked Vercel project count**: `2`.
- **Legacy Vercel projects**: `antigravity-hrms-ri4s` and `antigravity-hrms-q64j` remain preserved but Git-disconnected.
- **Dedicated staging branch policy**: `PASS / VERIFIED`; natural `main` push from PR #12 was canceled on the staging project because the Ignored Build Step returned exit code `0`.
- **Branch protection**:
  - `main` = protected; PR flow required; `Quality Gate` required; up-to-date branch semantics enabled; approvals = 0.
  - `staging` = protected; direct normal pushes allowed; no required checks; force-push/deletion not allowed.
- **Production DB**: `ACTIVE_HEALTHY`, PostgreSQL `17.6`, 5 applied Prisma migrations, 34 public base tables, 73 foreign keys, 2 public enums, 34/34 public ordinary tables with RLS enabled, public RLS policies = 0 intentionally.
- **Production runtime errors in final audit window**: none observed.
- **Open GitHub PRs/issues in final audit**: `0 / 0`.
- **Known accepted limitation**: `NIGHT_OT_END_TO_END = BLOCKED_BY_DATA_MODEL / ACCEPTED LIMITATION`.
- **DR evidence boundary**: managed Supabase backup/PITR capability, retention and restore SLA remain `UNVERIFIED / PLAN-DEPENDENT`; this is explicitly disclosed in the DR runbook and must not be represented as a guaranteed SLA.
- **PROJECT_SPEC.md authority status**: `MISSING / UNPROVEN`; do not auto-create a substitute.
- **CUSTOMER_HANDOFF_READY**: `CONDITIONAL YES / PENDING F4A PUBLICATION + POST-PUBLICATION VERIFY`.
- **New product/application mutation approved**: `NONE`.

---

## 4. RÀO CẢN VÀ ĐIỀU KIỆN TIẾP TỤC (CURRENT BLOCKERS)

- **Production release blocker**: `NONE`.
- **Branch-protection governance blocker**: `RESOLVED`.
- **Legacy Vercel fanout blocker**: `RESOLVED`; only canonical Production and dedicated Staging remain Git-linked.
- **Dedicated Staging normalization**: `PASS / VERIFIED`; the natural PR #12 `main` push was canceled by the staging project's Ignored Build Step as designed.
- **F3 documentation publication**: `PASS / VERIFIED`; PR #12 is merged to `main`.
- **Final technical handoff audit**: `PASS`.
- **Remaining readiness condition**: publish this exact F4A two-file reconciliation to `main` through an approved PR/CI path, then perform one post-publication read-only verification.
- **Closure rule**: if the exact F4A revision is present on `main` and that post-publication read-only verification passes, `CUSTOMER_HANDOFF_READY = YES`; no additional commit is required solely to change the readiness label.
- **DR evidence boundary**: current managed Supabase backup/PITR capability, retention and restore SLA remain `UNVERIFIED / PLAN-DEPENDENT`; the limitation is explicitly disclosed and must be verified operationally before relying on a restore SLA.
- **Known accepted product limitation**: `NIGHT_OT_END_TO_END = BLOCKED_BY_DATA_MODEL / ACCEPTED LIMITATION`.
- **Supabase INFO findings**: 34 RLS-enabled/no-policy notices are expected under the deny-by-default design; 18 unindexed foreign-key findings and 55 unused-index findings remain non-release-blocking performance technical debt.
- **PROJECT_SPEC.md**: `MISSING / UNPROVEN`; do not create a substitute without separate governance approval.
- **Production guard**: F4A authorizes documentation reconciliation only; no Production DB write, migration, seed, env/WAF change, deploy, rollback, account/password mutation or topology change is authorized.

---

## 5. CÁC GIAI ĐOẠN TIẾP THEO (NEXT PHASES ROADMAP)

1. **R5D1F-F4A — Final Readiness State Reconciliation**: commit exactly `docs/PROJECT_STATE_HANDOFF.md` and `docs/IMPLEMENTATION_ROADMAP.md` on `staging`; verify CI and staging Preview side effects.
2. **R5D1F-F4B — Final Readiness Publication PR**: create a documentation-only PR from `staging` to `main`, verify exact two-file diff and PR `Quality Gate`; do not merge without separate Human Owner approval.
3. **R5D1F-F4C — Final Readiness Publication Merge**: after separate approval, merge the exact verified PR and verify `main` CI/Docker, canonical Production deployment and staging branch filter behavior.
4. **Post-publication final read-only verification**: confirm the exact F4A document revision is on `main`, no unexpected drift exists, and all closure evidence remains valid.
5. **Automatic closure rule**: if Step 4 passes, `CUSTOMER_HANDOFF_READY = YES` without another documentation-only commit solely to flip the label.
6. **New product-development phase**: none selected or approved.

---

## 6. NGUYÊN TẮC CỐT TỬ: PRODUCTION ĐÃ RELEASE, KHÔNG TỰ Ý THAY ĐỔI

- **Production deployed**: **YES**.
- **Current Production/main SHA**: `c2b921d1bf68b55cc0907643db381bc61e6255b8`.
- **Current Production/main tree**: `dd390f5257a4db01a255af06923cf676da07c4e5`.
- **Application release PR**: PR #11 = `MERGED / CLOSED`.
- **Final documentation publication PR**: PR #12 = `MERGED / CLOSED`.
- **Current CI**: CI #84 = `SUCCESS`; `Quality Gate` = `SUCCESS`.
- **Current Docker publish**: Docker #18 = `SUCCESS`; digest = `sha256:d0e9641e82f6d449cd1e3888b0637c693fb03c6cd0b630c992351bf11b44a5b3`.
- **Current canonical Production deployment**: `dpl_B3x6qMN1yDuuoFrxKAad2bBezTK6` = `READY`.
- **Canonical Production domain**: `antigravity-hrms-six.vercel.app`.
- **Dedicated Staging main-branch filter**: `PASS / VERIFIED`; PR #12 `main` deployment on the staging project was `CANCELED` by Ignored Build Step exit code `0`.
- **Production DB read-only baseline (08/10/2026)**: `ACTIVE_HEALTHY`, PostgreSQL 17.6, 5 applied Prisma migrations, 34 public base tables, 73 foreign keys, 2 public enums and 34/34 public ordinary tables with RLS enabled.
- **Known accepted limitation**: `NIGHT_OT_END_TO_END = BLOCKED_BY_DATA_MODEL / ACCEPTED LIMITATION`.
- `/api/health` proves application/process responsiveness only; DB health/readiness is supported by separate read-only Production DB evidence.
- **Customer handoff readiness**: `CONDITIONAL YES / PENDING F4A PUBLICATION + POST-PUBLICATION VERIFY`.
- **FINAL_HANDOFF_CLOSURE_RULE**: once this exact F4A revision is present on `main` and the post-publication final read-only verification passes, `CUSTOMER_HANDOFF_READY = YES`; no additional documentation mutation is required solely to change that label.
- **No additional Production mutation is approved by F4A.**
- **Chỉ thị chấp hành**: không tự ý deploy, rollback, migrate, seed, thay đổi env/WAF, tạo/sửa tài khoản, reset password, thay branch protection/ruleset, reconfigure Vercel topology hoặc ghi thêm vào Production Database khi chưa có phê duyệt riêng trực tiếp từ Human Owner.

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
