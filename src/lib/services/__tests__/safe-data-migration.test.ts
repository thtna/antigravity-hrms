import { describe, it, expect } from 'vitest';
import { classifyRecord } from '../../../../scripts/safe-data-migration';

describe('PHASE 3 — DATA CLASSIFICATION & MIGRATION SAFETY TESTS', () => {
  it('should accurately classify demo users and employees without guessing', () => {
    expect(classifyRecord('user', { email: 'admin@antigravity.corp' })).toBe('DEMO');
    expect(classifyRecord('user', { email: 'hr.director@tanphong.vn' })).toBe('DEMO');
    expect(classifyRecord('user', { email: 'manager@antigravity.internal' })).toBe('DEMO');
    expect(classifyRecord('employee', { employeeCode: 'EMP-0001', email: 'dev.sr1@tanphong.vn' })).toBe('DEMO');
    expect(classifyRecord('employee', { employeeCode: 'EMP-0014', email: 'ops.staff2@tanphong.vn' })).toBe('DEMO');
  });

  it('should classify real records with explicit verification', () => {
    expect(classifyRecord('user', { email: 'ceo@realclient.com', isDemo: false })).toBe('REAL');
    expect(classifyRecord('employee', { employeeCode: 'REAL-001', isDemo: false })).toBe('REAL');
  });

  it('should return UNKNOWN and trigger STOP when record is ambiguous (No Guessing Rule)', () => {
    expect(classifyRecord('user', { email: 'nguyenvana@gmail.com' })).toBe('UNKNOWN');
    expect(classifyRecord('employee', { employeeCode: 'STAFF-999', email: 'someone@company.vn' })).toBe('UNKNOWN');
    expect(classifyRecord('organization', { slug: 'unidentified-org' })).toBe('UNKNOWN');
  });

  it('should classify demo organization and departments', () => {
    expect(classifyRecord('organization', { slug: 'tan-phong' })).toBe('DEMO');
    expect(classifyRecord('organization', { slug: 'demo' })).toBe('DEMO');
    expect(classifyRecord('department', { organizationId: 'org_default_tanphong' })).toBe('DEMO');
    expect(classifyRecord('department', { organizationId: 'org_demo_tanphong' })).toBe('DEMO');
  });
});
