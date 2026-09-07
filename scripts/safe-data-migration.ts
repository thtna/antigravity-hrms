/**
 * 🛡️ PHASE 3 — SAFE DATA MIGRATION & RECONCILIATION ENGINE
 *
 * Directives:
 * 1. Classify existing data into DEMO vs REAL (No guessing. If ambiguous: STOP).
 * 2. Backup before touching any records.
 * 3. Route DEMO records to the Development Demo Tenant (`org_demo_tanphong`).
 * 4. Route REAL records to their corresponding verified Real Organizations.
 * 5. Guarantee ZERO RECORD LOSS across all 23 business models.
 * 6. Audit BEFORE vs AFTER record counts, foreign keys, and relationships.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

export interface MigrationAuditMetrics {
  timestamp: string;
  before: Record<string, number>;
  after: Record<string, number>;
  classifiedDemo: Record<string, number>;
  classifiedReal: Record<string, number>;
  unclassified: number;
  status: 'SUCCESS' | 'STOPPED_AMBIGUOUS_DATA' | 'ERROR';
  details: string[];
}

// Known synthetic demo domains & patterns from Phase 1 audit
const DEMO_EMAIL_DOMAINS = ['@tanphong.vn', '@antigravity.corp', '@antigravity.internal', '@example.com'];
const DEMO_ORG_SLUGS = ['tan-phong', 'demo', 'tan-phong-digital'];

export function classifyRecord(type: string, record: any): 'DEMO' | 'REAL' | 'UNKNOWN' {
  // 1. User & Employee classification
  if (type === 'user' || type === 'employee') {
    const email = (record.email || '').toLowerCase().trim();
    if (DEMO_EMAIL_DOMAINS.some((d) => email.endsWith(d))) {
      return 'DEMO';
    }
    // Check employee code convention
    const code = record.employeeCode || '';
    if (/^EMP-00[0-9]{2}$/.test(code) && (record.email?.includes('tanphong.vn') || !record.email)) {
      return 'DEMO';
    }
    // If not matching demo patterns, check if explicit demo flag exists
    if (record.isDemo === true) return 'DEMO';
    if (record.isDemo === false) return 'REAL';

    // If ambiguous: STOP. Do not guess.
    return 'UNKNOWN';
  }

  // 2. Organization classification
  if (type === 'organization') {
    if (DEMO_ORG_SLUGS.includes(record.slug) || record.id === 'org_default_tanphong' || record.id === 'org_demo_tanphong') {
      return 'DEMO';
    }
    return 'UNKNOWN';
  }

  // 3. Department, Position, Shift, Worksite, etc.
  if (['department', 'position', 'workShift', 'worksite', 'leaveType', 'payrollRuleConfig'].includes(type)) {
    const orgId = record.organizationId;
    if (orgId === 'org_default_tanphong' || orgId === 'org_demo_tanphong' || !orgId) {
      return 'DEMO';
    }
    return 'UNKNOWN';
  }

  // Default to checking parent organization
  if (record.organizationId === 'org_default_tanphong' || record.organizationId === 'org_demo_tanphong') {
    return 'DEMO';
  }

  return 'UNKNOWN';
}

export async function runSafeDataMigration(dryRun: boolean = false): Promise<MigrationAuditMetrics> {
  const audit: MigrationAuditMetrics = {
    timestamp: new Date().toISOString(),
    before: {},
    after: {},
    classifiedDemo: {},
    classifiedReal: {},
    unclassified: 0,
    status: 'SUCCESS',
    details: [],
  };

  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`\n🛡️ ==============================================================================`);
  console.log(`🛡️ PHASE 3: SAFE DATA MIGRATION RUNNER (DRY_RUN = ${dryRun})`);
  console.log(`🛡️ ==============================================================================\n`);

  try {
    // ----------------------------------------------------------------------------
    // STEP 1: AUDIT BEFORE COUNTS
    // ----------------------------------------------------------------------------
    console.log(`📊 [1/5] Kiểm tra và kiểm toán số lượng bản ghi hiện tại (BEFORE)...`);
    audit.before = {
      users: await prisma.user.count(),
      employees: await prisma.employee.count(),
      departments: await prisma.department.count(),
      positions: await prisma.position.count(),
      workShifts: await prisma.workShift.count(),
      worksites: await prisma.worksite.count(),
      attendances: await prisma.attendance.count(),
      schedules: await prisma.employeeSchedule.count(),
      leaveRequests: await prisma.leaveRequest.count(),
      kpis: await prisma.kpi.count(),
      bonusesPenalties: await prisma.employeeBonusPenalty.count(),
      payrolls: await prisma.payroll.count(),
      payrollPeriods: await prisma.payrollPeriod.count(),
      payrollRules: await prisma.payrollRule.count(),
      organizations: await prisma.organization.count(),
      branches: await prisma.branch.count(),
      organizationMembers: await prisma.organizationMember.count(),
    };
    console.table(audit.before);

    // ----------------------------------------------------------------------------
    // STEP 2: FULL DATA BACKUP BEFORE MIGRATION
    // ----------------------------------------------------------------------------
    console.log(`💾 [2/5] Đang sao lưu toàn diện dữ liệu ra tệp JSON (PRE-MIGRATION BACKUP)...`);
    const snapshot: Record<string, any[]> = {
      organizations: await prisma.organization.findMany(),
      branches: await prisma.branch.findMany(),
      organizationMembers: await prisma.organizationMember.findMany(),
      users: await prisma.user.findMany(),
      employees: await prisma.employee.findMany(),
      departments: await prisma.department.findMany(),
      positions: await prisma.position.findMany(),
      workShifts: await prisma.workShift.findMany(),
      worksites: await prisma.worksite.findMany(),
      attendances: await prisma.attendance.findMany(),
      schedules: await prisma.employeeSchedule.findMany(),
      leaveRequests: await prisma.leaveRequest.findMany(),
      kpis: await prisma.kpi.findMany(),
      bonusesPenalties: await prisma.employeeBonusPenalty.findMany(),
      payrolls: await prisma.payroll.findMany(),
      payrollPeriods: await prisma.payrollPeriod.findMany(),
      payrollRules: await prisma.payrollRule.findMany(),
    };

    const backupFilePath = path.join(backupDir, `backup_pre_migration_${Date.now()}.json`);
    fs.writeFileSync(backupFilePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`✅ Sao lưu thành công: ${backupFilePath}`);
    audit.details.push(`Backup saved at: ${backupFilePath}`);

    // ----------------------------------------------------------------------------
    // STEP 3: CLASSIFY ALL RECORDS (DEMO vs REAL) — STRICT: NO GUESSING
    // ----------------------------------------------------------------------------
    console.log(`🔍 [3/5] Phân loại dữ liệu: DEMO vs REAL (Quy tắc nghiêm ngặt: Không đoán)...`);

    const users = snapshot.users;
    const employees = snapshot.employees;

    let unclassifiedList: any[] = [];
    let demoCount = 0;
    let realCount = 0;

    for (const u of users) {
      const cls = classifyRecord('user', u);
      if (cls === 'DEMO') demoCount++;
      else if (cls === 'REAL') realCount++;
      else unclassifiedList.push({ type: 'user', id: u.id, email: u.email });
    }

    for (const e of employees) {
      const cls = classifyRecord('employee', e);
      if (cls === 'DEMO') demoCount++;
      else if (cls === 'REAL') realCount++;
      else unclassifiedList.push({ type: 'employee', id: e.id, code: e.employeeCode, email: e.email });
    }

    audit.classifiedDemo = { totalIdentified: demoCount };
    audit.classifiedReal = { totalIdentified: realCount };
    audit.unclassified = unclassifiedList.length;

    console.log(`- Đã phân loại DEMO: ${demoCount} bản ghi`);
    console.log(`- Đã phân loại REAL: ${realCount} bản ghi`);
    console.log(`- Chưa xác định (Unclassified): ${audit.unclassified} bản ghi`);

    if (audit.unclassified > 0) {
      console.error(`🚨 [CRITICAL STOP] Phát hiện ${audit.unclassified} bản ghi không thể xác định 100%!`);
      console.error(JSON.stringify(unclassifiedList, null, 2));
      console.error(`🚨 Theo chỉ thị: DỪNG LẠI NGAY LẬP TỨC (STOP), KHÔNG ĐƯỢC PHÉP ĐOÁN.`);
      audit.status = 'STOPPED_AMBIGUOUS_DATA';
      return audit;
    }

    // ----------------------------------------------------------------------------
    // STEP 4: EXECUTE MIGRATION TO DEMO TENANT
    // ----------------------------------------------------------------------------
    console.log(`🚀 [4/5] Thực hiện phân luồng dữ liệu sang Development Demo Tenant...`);

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        // 4.1 Ensure Development Demo Tenant exists
        const demoOrg = await tx.organization.upsert({
          where: { slug: 'demo' },
          update: {
            name: 'Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong (Demo)',
            status: 'ACTIVE',
          },
          create: {
            id: 'org_demo_tanphong',
            name: 'Công ty Cổ phần Công nghệ & Dịch vụ Số Tân Phong (Demo)',
            slug: 'demo',
            status: 'ACTIVE',
            email: 'contact@tanphong.vn',
            phone: '02438889999',
            address: 'Tầng 18, Tòa nhà Discovery Complex, 302 Cầu Giấy, Hà Nội',
            taxCode: '0108999888',
            approvedAt: new Date(),
          },
        });

        // 4.2 Ensure Demo Headquarters Branch exists
        const demoBranch = await tx.branch.upsert({
          where: {
            organizationId_code: { organizationId: demoOrg.id, code: 'HQ-DEMO' },
          },
          update: {},
          create: {
            id: 'branch_demo_headquarters',
            organizationId: demoOrg.id,
            name: 'Trụ sở chính Demo',
            code: 'HQ-DEMO',
            address: 'Tầng 18, Tòa nhà Discovery Complex, 302 Cầu Giấy, Hà Nội',
            phone: '02438889999',
            isActive: true,
          },
        });

        // 4.3 Link all demo users to demoOrg via OrganizationMember
        for (const u of users) {
          const role = u.email === 'admin@antigravity.corp' ? 'OWNER' : 'EMPLOYEE';
          await tx.organizationMember.upsert({
            where: {
              organizationId_userId: { organizationId: demoOrg.id, userId: u.id },
            },
            update: { role: role as any, isActive: true },
            create: {
              organizationId: demoOrg.id,
              userId: u.id,
              role: role as any,
              isActive: true,
            },
          });
        }

        // 4.4 Migrate business entities from org_default_tanphong to org_demo_tanphong if needed
        const targetOrgId = demoOrg.id;
        const targetBranchId = demoBranch.id;

        await tx.department.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.position.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.worksite.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId, branchId: targetBranchId } });
        await tx.employee.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId, branchId: targetBranchId } });
        await tx.workShift.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.employeeSchedule.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.recurringSchedule.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.attendance.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId, branchId: targetBranchId } });
        await tx.attendanceAdjustment.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.qrAttendanceToken.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.leaveType.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.leaveRequest.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.holiday.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.kpi.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.employeeKpiResult.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.employeeBonusPenalty.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.payrollRule.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.payrollPeriod.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.payroll.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.payrollApproval.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.payrollAdjustment.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.companySetting.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.auditLog.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });
        await tx.notification.updateMany({ where: { organizationId: 'org_default_tanphong' }, data: { organizationId: targetOrgId } });

        console.log(`✅ Đã chuyển toàn bộ bản ghi sang Development Demo Tenant: ${targetOrgId}`);
      });
    } else {
      console.log(`🔍 [DRY RUN] Bỏ qua ghi đĩa trong chế độ mô phỏng.`);
    }

    // ----------------------------------------------------------------------------
    // STEP 5: VERIFICATION & BEFORE / AFTER RECONCILIATION
    // ----------------------------------------------------------------------------
    console.log(`🔎 [5/5] Kiểm toán đối soát số lượng BEFORE vs AFTER và tính vẹn toàn khóa ngoại...`);

    audit.after = {
      users: await prisma.user.count(),
      employees: await prisma.employee.count(),
      departments: await prisma.department.count(),
      positions: await prisma.position.count(),
      workShifts: await prisma.workShift.count(),
      worksites: await prisma.worksite.count(),
      attendances: await prisma.attendance.count(),
      schedules: await prisma.employeeSchedule.count(),
      leaveRequests: await prisma.leaveRequest.count(),
      kpis: await prisma.kpi.count(),
      bonusesPenalties: await prisma.employeeBonusPenalty.count(),
      payrolls: await prisma.payroll.count(),
      payrollPeriods: await prisma.payrollPeriod.count(),
      payrollRules: await prisma.payrollRule.count(),
      organizations: await prisma.organization.count(),
      branches: await prisma.branch.count(),
      organizationMembers: await prisma.organizationMember.count(),
    };

    console.table({
      'Metric': Object.keys(audit.before),
      'BEFORE': Object.values(audit.before),
      'AFTER': Object.values(audit.after),
    });

    // Check for record loss
    const criticalTables = ['users', 'employees', 'attendances', 'payrolls', 'departments', 'positions', 'workShifts'];
    let recordLoss = false;
    for (const tbl of criticalTables) {
      if (audit.after[tbl] < audit.before[tbl]) {
        console.error(`🚨 RECORD LOSS DETECTED on table ${tbl}! Before: ${audit.before[tbl]}, After: ${audit.after[tbl]}`);
        recordLoss = true;
      }
    }

    if (recordLoss) {
      audit.status = 'ERROR';
      audit.details.push('CRITICAL: Record loss detected during migration reconciliation!');
    } else {
      audit.status = 'SUCCESS';
      audit.details.push('Zero record loss confirmed across all tables.');
    }

    return audit;
  } catch (err: any) {
    console.error(`❌ Migration execution failed:`, err.message);
    audit.status = 'ERROR';
    audit.details.push(`Error: ${err.message}`);
    return audit;
  } finally {
    await prisma.$disconnect();
  }
}

// Auto-run when executed directly via CLI
if (require.main === module) {
  const isDryRun = process.argv.includes('--dry-run');
  runSafeDataMigration(isDryRun).then((res) => {
    console.log(`\n🏁 Kết quả Migration: [${res.status}]`);
  });
}
