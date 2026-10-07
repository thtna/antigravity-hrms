# SỔ TAY QUY TRÌNH PHỤC HỒI THẢM HỌA (DISASTER RECOVERY RUNBOOK)
## ANTIGRAVITY HRMS — MULTI-TENANT ENTERPRISE PLATFORM

- **Tài liệu**: Disaster Recovery Operating Runbook & Restoration Protocol
- **Phiên bản**: 1.1 (Reconciled 07/10/2026)
- **Hệ cơ sở dữ liệu hiện hành**: Supabase PostgreSQL 17.6 (Production engine verified read-only 07/10/2026)
- **Kiến trúc ứng dụng**: Next.js 16 (App Router) on Vercel serverless infrastructure; canonical Production project = `antigravity-hrms`
- **Phạm vi bảo vệ**: Tối đa 5 Doanh nghiệp Độc lập (Multi-Tenant SaaS Isolation)

> **CURRENT PRODUCTION BASELINE — 07/10/2026**
>
> - Production database status: `ACTIVE_HEALTHY`.
> - Applied Prisma migrations: `5`; latest = `20261005000000_phase_11a_0f_public_data_api_hardening`.
> - Public database topology: `34` base tables, `73` foreign keys, `2` public enums.
> - RLS: `34/34` public ordinary tables enabled; zero public RLS policies intentionally under the deny-by-default Phase 11A.0F model.
> - Managed backup/PITR availability, retention and restore SLA for the current Supabase plan were **not proven by the 07/10/2026 F1 audit**. They must be verified from current account/plan evidence before an incident procedure relies on them.
> - Historical DR drill results remain historical evidence; they are not proof that a current managed Production backup exists at this moment.

---

## 1. NGUỒN SAO LƯU (BACKUP SOURCE)

1. **Supabase managed backups / PITR — PLAN-DEPENDENT / CURRENT CAPABILITY UNVERIFIED**:
   - Before declaring an incident recovery point, verify the current Production project plan, enabled backup features, available restore points and retention in the Supabase account.
   - Do **not** assume a fixed snapshot schedule, WAL interval, retention window, storage backend or second-level restore capability from this repository alone.
2. **Application logical recovery tooling — SOURCE VERIFIED, BACKUP ARTIFACT NOT IMPLIED**:
   - Repository tools `scripts/safe-data-migration.ts` and `scripts/dr-restore-drill.ts` exist for controlled logical snapshot/drill workflows.
   - Tool existence does not prove that a current Production logical snapshot or off-site encrypted copy exists. Verify the exact artifact, timestamp, checksum, scope and storage location before relying on it.
3. **Pre-migration backup requirement**:
   - Any future Production migration gate must explicitly identify the authorized backup/restore path before mutation.
   - Never represent an unverified or historical backup as a current recovery point.

---

## 2. TẦN SUẤT SAO LƯU (BACKUP FREQUENCY) & RPO / RTO

The repository does not establish the current Supabase plan's managed-backup frequency, retention, RPO or RTO. Treat these values as **UNVERIFIED / PLAN-DEPENDENT** until account-level evidence is collected.

| Recovery mechanism | Current evidence | Frequency / retention | RPO / RTO commitment |
| :--- | :--- | :--- | :--- |
| **Supabase managed snapshots** | Capability not proven by F1 toolset | **UNVERIFIED** | **NO CURRENT COMMITMENT** |
| **Supabase PITR / WAL restore** | Capability not proven by F1 toolset | **UNVERIFIED** | **NO CURRENT COMMITMENT** |
| **Logical snapshot / DR drill tooling** | Repository scripts verified to exist | Operator-triggered; no automatic schedule proven | Historical drill evidence only; no current Production SLA |

Before customer handoff, operational ownership must know where current backup capability is verified and who is authorized to initiate a restore.

---

## 3. QUY TRÌNH PHỤC HỒI (RESTORE PROCEDURE)

> [!CAUTION]
> Every action in this section is a Production mutation or recovery action and requires explicit Human Owner / incident-authority approval. Verify the current Supabase plan and Vercel topology before execution.

### Bước 1: Declare incident and freeze writes
1. Identify the canonical Production Vercel project and the exact Production database project.
2. Choose an approved maintenance/write-freeze mechanism. The repository does not by itself prove that a specific `NEXT_PUBLIC_MAINTENANCE_MODE` flag is currently implemented end-to-end.
3. Record the incident time, current `main` SHA, deployment ID, DB project ref and last known-good business checkpoint.

### Bước 2: Verify an actual recovery point
1. In the current Supabase account, verify whether managed snapshots and/or PITR are enabled for the Production project and enumerate the actual available restore points.
2. If a logical snapshot is proposed instead, verify its file identity, timestamp, checksum, schema compatibility and storage location.
3. If no verified recovery point exists, **STOP**. Do not invent one from historical documentation.

### Bước 3: Restore only to an isolated target
1. Prefer a new restored project/database or another isolated recovery target supported by the current platform.
2. Do not overwrite the running Production database.
3. Apply only the migration/rehydration steps required for the chosen recovery point and verify each mutation.

### Bước 4: Validate before any traffic switch
Run the checklist in Section 8 against the isolated restored target. Only after all required checks pass may a separately approved gate rebind Production application configuration to the restored target.

---

## 4. MỤC TIÊU PHỤC HỒI (RESTORE TARGET)

> [!CAUTION]
> **NGUYÊN TẮC BẤT DI BẤT DỊCH**:
> **TUYỆT ĐỐI KHÔNG restore đè trực tiếp lên instance Production đang chạy.**

- Mọi thao tác restore **BẮT BUỘC** phải trỏ vào một trong hai đích sau:
  1. **New Restored Project / Staging Database**: Một instance PostgreSQL Supabase mới hoàn toàn được tạo từ bản backup.
  2. **Isolated Recovery Schema**: Một schema độc lập (ví dụ `restore_staging_20260906`) bên trong database tách biệt.
- Chỉ khi database đích hoàn tất 100% các bước trong **Verification Checklist** (Mục 8), biến môi trường `DATABASE_URL` của ứng dụng mới được chuyển hướng sang instance mới.

---

## 5. BIẾN MÔI TRƯỜNG BẮT BUỘC (REQUIRED ENVIRONMENT VARIABLES)

For the current Vercel Production contract, the verified canonical variable names are:

**Required (14):**
`APP_ENV`, `DEMO_MODE`, `DATABASE_URL`, `AUTH_SECRET`, `AUTH_COOKIE_NAME`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_PROVIDER`, `EMAIL_PROVIDER`, `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `CRON_SECRET`, `QR_SECRET`.

**Optional but currently present (2):**
`AUTH_TOKEN_EXPIRATION`, `LOG_LEVEL`.

Rules:
- Never print or copy secret values into this runbook.
- `SUPABASE_URL` and `DATABASE_URL` must point to the same explicitly approved restored Production target after a recovery switch.
- `EMAIL_PROVIDER` currently resolves to SendGrid in Production; the Resend implementation does not make `RESEND_*` variables mandatory when SendGrid remains selected.
- `DIRECT_URL` is not part of the verified current canonical Production contract and must not be assumed required without fresh source/env evidence.
- Any Production env rebind requires a separately approved mutation gate and post-change verification.

---

## 6. QUY TRÌNH DI TRÚ DATABASE SAU KHÔI PHỤC (MIGRATION PROCEDURE)

Current Production baseline at 07/10/2026:
- applied Prisma migrations = `5`;
- latest = `20261005000000_phase_11a_0f_public_data_api_hardening`.

For an isolated restored target:
1. Run a read-only migration status check against the exact restored database.
2. Compare the restored migration history with the release revision intended for recovery.
3. If migrations are pending, obtain explicit approval before `prisma migrate deploy`; migration SQL can mutate schema and data.
4. Re-run schema/RLS/index and application runtime verification after migration.
5. Never delete or rewrite `_prisma_migrations` records merely to make status appear clean.

---

## 7. PHỤC HỒI ỨNG DỤNG (APPLICATION RECOVERY)

1. Confirm the canonical Production Vercel project before changing any environment or deployment pointer. The repository currently fans out `main` to four Vercel projects; do not assume a one-project topology.
2. Rebind only the approved canonical Production project to the verified restored database/storage target.
3. Trigger deployment only under a separately approved recovery gate.
4. Verify the exact release SHA, deployment state, public smoke, authentication boundary, DB connectivity/migration state and runtime error window.
5. Do not use a generic `vercel --prod` or environment command from this document without explicit project/team scoping and approval.

---

## 8. BẢNG KIỂM TRA TOÀN VẸN SAU KHÔI PHỤC (VERIFICATION CHECKLIST)

This is a per-incident checklist. Items are intentionally unchecked until verified on the actual restored target.

- [ ] **Release identity**: expected Git SHA, application image/deployment and environment target are exact.
- [ ] **Schema integrity**: compare against the intended release migration history. For the 07/10/2026 baseline: 5 applied migrations, 34 public base tables, 73 foreign keys, 2 public enums.
- [ ] **RLS/security baseline**: for the 07/10/2026 baseline, 34/34 public ordinary tables have RLS enabled; zero public policies is intentional under the deny-by-default model.
- [ ] **Data counts / invariants**: compare organization, membership, employee, attendance, leave, payroll, audit and other required business counts against the chosen verified recovery point.
- [ ] **Tenant isolation**: cross-tenant employee/attendance/leave/payroll/document access is denied as expected.
- [ ] **Authentication / authorization**: verify representative active/inactive tenant and role boundaries without exposing credentials.
- [ ] **Payroll invariance**: run the approved statutory regression appropriate to the release and tenant configuration.
- [ ] **Audit logging**: confirm historical audit data is intact and new authorized activity can append.
- [ ] **Storage**: verify metadata/object consistency, ownership and signed/private access for required buckets.
- [ ] **Public/runtime smoke**: `/`, `/login`, `/api/health` and protected unauthenticated API behavior are correct.
- [ ] **Runtime observability**: no unexpected error cluster in the post-recovery verification window.

Do not switch customer traffic until every required item for the incident is evidenced and approved.

---

## 9. QUY TRÌNH QUAY LUI DỰ PHÒNG (ROLLBACK PROCEDURE)

If the isolated restored target fails verification:
1. Keep customer traffic on the last known-good Production target if it is still safe; otherwise keep the approved write-freeze/maintenance state.
2. Do not rebind Production to a failed recovery target.
3. Select another **verified** recovery point or correct the isolated restore under a separately approved mutation gate.
4. Application rollback and database rollback are separate decisions; never assume one reverses the other.
5. Record the failed recovery evidence and exact state before another attempt.

---

## 10. THỜI GIAN PHỤC HỒI ƯỚC TÍNH (ESTIMATED RECOVERY TIME)

- **Current managed-backup/PITR RPO/RTO commitment**: `UNVERIFIED / PLAN-DEPENDENT`.
- Historical sandbox/logical DR drill timings may be useful engineering evidence, but they are **not** a contractual Production RTO.
- Do not promise a 15–20 minute Production recovery window until the current Supabase backup plan, restore workflow, data volume, storage recovery and traffic-switch procedure have been measured end-to-end.

---

## 11. CÁC GIỚI HẠN PHỤC HỒI DỮ LIỆU (DATA RECOVERY LIMITATIONS)

1. **Managed backup/PITR boundaries**: data-loss window and restore granularity depend on the current Supabase project plan and actual available restore point; verify them during incident response.
2. **Logical snapshots**: recovery completeness depends on the exact snapshot scope, timestamp, checksum and compatibility with the target release.
3. **Object storage**: database restore and object-storage recovery are separate concerns; verify object existence, metadata linkage and tenant ownership independently.
4. **Third-party email/notification delivery**: database restoration does not automatically replay external deliveries; avoid duplicate sends unless a separately approved reconciliation procedure requires them.
5. **Secrets and credentials**: restored data does not replace the need to validate current application secrets, provider credentials and rotation state.

---

## 12. PHÊ DUYỆT & KẾT LUẬN DIỄN TẬP (DRILL VERDICT)

- Historical DR drill evidence in this repository remains useful evidence that the logical recovery tooling and verification approach have been exercised.
- That historical verdict **does not prove** that a current managed Supabase backup/PITR restore point exists, nor does it establish the current plan's retention or Production RPO/RTO.
- **Current runbook status (07/10/2026)**: `RECONCILED / OPERATIONALLY CONDITIONAL`.
- Before relying on managed backup/PITR during customer operations, obtain fresh account-level evidence for capability, retention, available restore points and ownership.
- Any real Production restore, env rebind, deploy or traffic switch remains subject to explicit Human Owner / incident-authority approval.
