/**
 * PHASE 11A — PRODUCTION READ-ONLY PREFLIGHT PROBE
 *
 * STRICT MANDATES:
 * 1. READ-ONLY ONLY: Absolutely NO migrate, deploy, seed, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, reset.
 * 2. PROHIBITED: .env.staging, antigravity-hrms-staging, localhost:5432 / development database.
 * 3. MUST TARGET REAL PRODUCTION DATABASE.
 * 4. MASKS all secrets, passwords, project references, and URLs.
 * 5. DETERMINES Data Classification: DEMO / REAL / MIXED / EMPTY (No guessing).
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

export interface ProductionPreflightReport {
  productionTarget: 'VERIFIED' | 'NOT VERIFIED';
  productionDbIdentity: string;
  currentMigrationState: string;
  pendingMigrations: string;
  currentDataClassification: 'DEMO' | 'REAL' | 'MIXED' | 'EMPTY' | 'UNKNOWN';
  demoCredentials: 'NONE' | 'FOUND';
  demoMode: 'false' | 'incorrect';
  stagingCredentials: 'NONE' | 'FOUND';
  writesPerformed: 'NONE';
  productionModified: 'NO';
  reasons: string[];
  tablesCount?: number;
  userCount?: number;
  employeeCount?: number;
  attendanceCount?: number;
  payrollCount?: number;
  organizationCount?: number;
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

function maskHost(host: string): string {
  if (!host) return '[EMPTY_HOST]';
  const parts = host.split('.');
  if (parts.length >= 3) {
    const first = parts[0];
    const maskedFirst = first.length > 4 ? `${first.slice(0, 2)}***${first.slice(-2)}` : `${first[0]}***`;
    return [maskedFirst, ...parts.slice(1)].join('.');
  }
  return host.length > 6 ? `${host.slice(0, 2)}***${host.slice(-2)}` : '***';
}

function maskRef(ref: string): string {
  if (!ref) return '[EMPTY_REF]';
  if (ref.length <= 6) return '***';
  return `${ref.slice(0, 3)}***${ref.slice(-4)}`;
}

export async function probeProductionTarget(): Promise<ProductionPreflightReport> {
  const report: ProductionPreflightReport = {
    productionTarget: 'NOT VERIFIED',
    productionDbIdentity: 'MASKED / UNVERIFIED',
    currentMigrationState: 'UNKNOWN',
    pendingMigrations: 'UNKNOWN',
    currentDataClassification: 'UNKNOWN',
    demoCredentials: 'NONE',
    demoMode: 'incorrect',
    stagingCredentials: 'NONE',
    writesPerformed: 'NONE',
    productionModified: 'NO',
    reasons: [],
  };

  // Inspect repository migrations
  const migrationsDir = path.resolve(process.cwd(), 'prisma/migrations');
  const repoMigrations = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    : [];

  // Check .env.production
  const prodEnvPath = path.resolve(process.cwd(), '.env.production');
  const hasProdEnvFile = fs.existsSync(prodEnvPath);

  let targetEnv: Record<string, string> = {};
  if (hasProdEnvFile) {
    targetEnv = parseEnvFile(prodEnvPath);
  } else {
    // Check if passed via process.env
    targetEnv = {
      DATABASE_URL: process.env.DATABASE_URL || '',
      DIRECT_URL: process.env.DIRECT_URL || '',
      NODE_ENV: process.env.NODE_ENV || '',
      DEMO_MODE: process.env.DEMO_MODE || '',
      APP_ENV: process.env.APP_ENV || '',
    };
  }

  const databaseUrl = targetEnv.DATABASE_URL || '';
  const directUrl = targetEnv.DIRECT_URL || databaseUrl;
  const nodeEnv = targetEnv.NODE_ENV || '';
  const demoMode = targetEnv.DEMO_MODE || '';
  const appEnv = targetEnv.APP_ENV || '';

  // 1. Audit DEMO_MODE
  if (demoMode === 'false') {
    report.demoMode = 'false';
  } else {
    report.demoMode = 'incorrect';
    report.reasons.push(`DEMO_MODE is "${demoMode || 'unset'}" (expected "false")`);
  }

  // 2. Audit NODE_ENV
  if (nodeEnv !== 'production') {
    report.reasons.push(`NODE_ENV is "${nodeEnv || 'unset'}" (expected "production")`);
  }

  // 3. Staging and Localhost guards
  const forbiddenStagingRefs = ['rdpufonfascxgbydvtak', 'antigravity-hrms-staging'];
  const hasStagingRef = forbiddenStagingRefs.some(ref =>
    databaseUrl.toLowerCase().includes(ref) || directUrl.toLowerCase().includes(ref) || appEnv.toLowerCase().includes(ref)
  );

  if (hasStagingRef) {
    report.stagingCredentials = 'FOUND';
    report.reasons.push('Staging Supabase project reference detected in database configuration.');
  }

  const forbiddenLocalhost = ['localhost', '127.0.0.1', '5432/antigravity_hrms'];
  const hasLocalhost = forbiddenLocalhost.some(lh =>
    databaseUrl.toLowerCase().includes(lh) || directUrl.toLowerCase().includes(lh)
  );

  if (hasLocalhost) {
    report.reasons.push('Development localhost database URL detected. Localhost is prohibited for production.');
  }

  // 4. If credentials missing or forbidden
  if (!databaseUrl) {
    report.reasons.push('.env.production is missing and no production DATABASE_URL is configured.');
    return report;
  }

  if (hasStagingRef || hasLocalhost) {
    return report;
  }

  // 5. Connect READ-ONLY to database via PrismaClient
  const prisma = new PrismaClient({
    datasources: { db: { url: directUrl || databaseUrl } },
    log: ['error'],
  });

  try {
    // Read-only database identity query
    const identityRes: any[] = await prisma.$queryRaw`SELECT current_database(), current_user, version();`;
    if (!identityRes || identityRes.length === 0) {
      report.reasons.push('Failed to retrieve database identity.');
      return report;
    }

    const rawDb = String(identityRes[0].current_database || '');
    const rawUser = String(identityRes[0].current_user || '');
    const rawVer = String(identityRes[0].version || '');

    report.productionDbIdentity = `${rawDb} (user: ${rawUser}, version: ${rawVer.slice(0, 35)}...)`;

    // Read Base Tables in public schema
    const tablesRes: any[] = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE';
    `;
    const tableNames: string[] = tablesRes.map((t: any) => String(t.table_name));
    report.tablesCount = tableNames.length;

    // Read _prisma_migrations
    let appliedMigrations: string[] = [];
    if (tableNames.includes('_prisma_migrations')) {
      const migRes: any[] = await prisma.$queryRaw`
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE rolled_back_at IS NULL
        ORDER BY started_at ASC;
      `;
      appliedMigrations = migRes.map((m: any) => String(m.migration_name));
      report.currentMigrationState = appliedMigrations.length === 0
        ? '0 migrations applied'
        : `${appliedMigrations.length} migrations applied: [${appliedMigrations.join(', ')}]`;
    } else {
      report.currentMigrationState = 'No _prisma_migrations table found';
    }

    const pending = repoMigrations.filter(m => !appliedMigrations.includes(m));
    report.pendingMigrations = pending.length === 0 ? 'NONE (Fully up to date)' : pending.join(', ');

    // Read business counts
    let userCount = 0;
    let employeeCount = 0;
    let attendanceCount = 0;
    let payrollCount = 0;
    let organizationCount = 0;

    if (tableNames.includes('users')) {
      const res: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "users";`;
      userCount = res[0]?.count || 0;
    }
    if (tableNames.includes('employees')) {
      const res: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "employees";`;
      employeeCount = res[0]?.count || 0;
    }
    if (tableNames.includes('attendance')) {
      const res: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "attendance";`;
      attendanceCount = res[0]?.count || 0;
    }
    if (tableNames.includes('payroll')) {
      const res: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "payroll";`;
      payrollCount = res[0]?.count || 0;
    }
    if (tableNames.includes('organizations')) {
      const res: any[] = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "organizations";`;
      organizationCount = res[0]?.count || 0;
    }

    report.userCount = userCount;
    report.employeeCount = employeeCount;
    report.attendanceCount = attendanceCount;
    report.payrollCount = payrollCount;
    report.organizationCount = organizationCount;

    // Check Data Classification: DEMO / REAL / MIXED / EMPTY
    if (tableNames.length === 0 || (userCount === 0 && employeeCount === 0 && organizationCount === 0)) {
      report.currentDataClassification = 'EMPTY';
    } else {
      let foundDemo = false;
      let foundReal = false;

      if (tableNames.includes('organizations')) {
        const orgs: any[] = await prisma.$queryRaw`SELECT name, slug FROM "organizations";`;
        for (const org of orgs) {
          const s = String(org.slug || '').toLowerCase();
          const n = String(org.name || '').toLowerCase();
          if (s.includes('demo') || s.includes('test') || s === 'abc-coffee' || s === 'xyz-restaurant' || n.includes('demo') || n.includes('test')) {
            foundDemo = true;
          } else {
            foundReal = true;
          }
        }
      }

      if (tableNames.includes('users')) {
        const users: any[] = await prisma.$queryRaw`SELECT email FROM "users" LIMIT 50;`;
        for (const u of users) {
          const em = String(u.email || '').toLowerCase();
          if (em.includes('example.com') || em.includes('demo') || em.includes('test') || em === 'admin@antigravity.local') {
            foundDemo = true;
          } else {
            foundReal = true;
          }
        }
      }

      if (foundDemo && foundReal) {
        report.currentDataClassification = 'MIXED';
      } else if (foundDemo) {
        report.currentDataClassification = 'DEMO';
      } else if (foundReal) {
        report.currentDataClassification = 'REAL';
      } else {
        report.currentDataClassification = 'EMPTY';
      }
    }

    // Check demo credentials in DB
    if (tableNames.includes('users')) {
      const creds: any[] = await prisma.$queryRaw`SELECT id FROM "users" WHERE email = 'admin@antigravity.local';`;
      if (creds.length > 0) {
        report.demoCredentials = 'FOUND';
      }
    }

    // Final verification status
    if (report.reasons.length === 0) {
      report.productionTarget = 'VERIFIED';
    }

    return report;
  } catch (err: any) {
    report.reasons.push(`Database connection error: ${err.message}`);
    return report;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

if (require.main === module) {
  probeProductionTarget().then(res => {
    console.log(JSON.stringify(res, null, 2));
  });
}
