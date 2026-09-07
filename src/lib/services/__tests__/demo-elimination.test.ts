import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { seedSystemEssentials } from '../../../../prisma/seed';

describe('PHASE 8 — DEMO ELIMINATION & PRODUCTION HARDENING TEST SUITE', () => {
  const rootDir = path.resolve(__dirname, '../../../../');

  describe('1. Static Code Analysis & Client Bundle Purity', () => {
    it('[DEMO-01] DashboardClient.tsx must NOT contain Antigravity@2026 or handleQuickLogin or @antigravity.internal', () => {
      const filePath = path.join(rootDir, 'src/components/dashboard/DashboardClient.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('Antigravity@2026');
      expect(content).not.toContain('handleQuickLogin');
      expect(content).not.toContain('@antigravity.internal');
      expect(content).not.toContain('1-Click Đăng Nhập');
    });

    it('[DEMO-02] ReportsClient.tsx must NOT contain Antigravity@2026 or handleQuickLogin or @antigravity.internal', () => {
      const filePath = path.join(rootDir, 'src/components/reports/ReportsClient.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('Antigravity@2026');
      expect(content).not.toContain('handleQuickLogin');
      expect(content).not.toContain('@antigravity.internal');
      expect(content).not.toContain('Vào Với Vai Trò Admin');
    });

    it('[DEMO-03] EmployeeFormModal.tsx must NOT contain @antigravity.internal placeholder', () => {
      const filePath = path.join(rootDir, 'src/components/employee/EmployeeFormModal.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('@antigravity.internal');
      expect(content).toContain('nhanvien@company.com');
    });

    it('[DEMO-04] employee.service.ts must NOT hardcode default password string', () => {
      const filePath = path.join(rootDir, 'src/lib/services/employee.service.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain("const defaultPassword = 'Antigravity@2026'");
      expect(content).toContain('process.env.DEFAULT_EMPLOYEE_PASSWORD');
    });

    it('[DEMO-05] email providers must NOT have @antigravity.internal fallback domain', () => {
      const smtpPath = path.join(rootDir, 'src/lib/email/providers/smtp.provider.ts');
      const sendgridPath = path.join(rootDir, 'src/lib/email/providers/sendgrid.provider.ts');
      const consolePath = path.join(rootDir, 'src/lib/email/providers/console.provider.ts');

      expect(fs.readFileSync(smtpPath, 'utf-8')).not.toContain('@antigravity.internal');
      expect(fs.readFileSync(sendgridPath, 'utf-8')).not.toContain('@antigravity.internal');
      expect(fs.readFileSync(consolePath, 'utf-8')).not.toContain('@antigravity.internal');
    });
  });

  describe('2. Environment & Package Scripts Integrity', () => {
    it('[DEMO-06] .env.example and .env must configure DEMO_MODE="false"', () => {
      const envExamplePath = path.join(rootDir, '.env.example');
      const envPath = path.join(rootDir, '.env');

      expect(fs.readFileSync(envExamplePath, 'utf-8')).toContain('DEMO_MODE="false"');
      expect(fs.readFileSync(envPath, 'utf-8')).toContain('DEMO_MODE="false"');
    });

    it('[DEMO-07] package.json must have isolated db:seed:demo and db:seed:prod commands', () => {
      const pkgPath = path.join(rootDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      expect(pkg.scripts['db:seed:demo']).toBe('DEMO_MODE=true tsx prisma/seed.ts');
      expect(pkg.scripts['db:seed:prod']).toBe('DEMO_MODE=false tsx prisma/seed.ts');
      expect(pkg.scripts['postinstall']).toBe('prisma generate');
      expect(pkg.scripts['build']).toBe('next build');
    });
  });

  describe('3. Production Seed Essentials Isolation (Zero Fake Data)', () => {
    it('[DEMO-08] seedSystemEssentials should only upsert 4 system roles and zero business data', async () => {
      const upsertCalls: string[] = [];
      const mockPrisma: any = {
        role: {
          upsert: vi.fn().mockImplementation(async (args: any) => {
            upsertCalls.push(args.where.code);
            return { id: `role-${args.where.code}`, ...args.create };
          }),
        },
        organization: {
          create: vi.fn(),
          upsert: vi.fn(),
        },
        user: {
          create: vi.fn(),
          upsert: vi.fn(),
        },
        employee: {
          create: vi.fn(),
          upsert: vi.fn(),
        },
      };

      await seedSystemEssentials(mockPrisma);

      // Verify ONLY the 4 system roles are created
      expect(upsertCalls).toEqual(['admin', 'hr', 'manager', 'employee']);
      expect(mockPrisma.role.upsert).toHaveBeenCalledTimes(4);

      // Verify ZERO organization, ZERO user, ZERO employee calls
      expect(mockPrisma.organization.create).not.toHaveBeenCalled();
      expect(mockPrisma.organization.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.employee.create).not.toHaveBeenCalled();
      expect(mockPrisma.employee.upsert).not.toHaveBeenCalled();
    });
  });
});
