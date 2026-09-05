/**
 * PHASE 10 — LEAVE MANAGEMENT TEST SUITE
 *
 * Tests cover:
 * 1.  createLeaveRequest — happy path (LEAVE, LATE_REQUEST, EARLY_LEAVE)
 * 2.  createLeaveRequest — date validation (end < start)
 * 3.  createLeaveRequest — too far in the past (>30 days)
 * 4.  createLeaveRequest — overlapping LEAVE prevention
 * 5.  createLeaveRequest — duplicate LATE_REQUEST on same day prevention
 * 6.  processLeaveRequest — approve by HR
 * 7.  processLeaveRequest — reject by HR (with notes)
 * 8.  processLeaveRequest — employee cannot approve (403)
 * 9.  processLeaveRequest — manager cannot self-approve (403)
 * 10. processLeaveRequest — manager blocked from other dept (403)
 * 11. processLeaveRequest — non-PENDING request blocked (400)
 * 12. cancelLeaveRequest — employee cancels own PENDING
 * 13. cancelLeaveRequest — employee cannot cancel others' (403)
 * 14. cancelLeaveRequest — cannot cancel non-PENDING (400)
 * 15. listLeaveRequests — employee sees only own requests (RBAC)
 * 16. listLeaveRequests — HR sees all requests (RBAC)
 * 17. getDashboardSummary — correct counts for HR
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mocks before vi.mock factories ────────────────────────────────────
const mockPrisma = vi.hoisted(() => ({
  leaveRequest: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  leaveType: {
    findUnique: vi.fn(),
  },
  employee: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { LeaveService } from '@/lib/services/leave.service';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = new Date();
const today = TODAY.toISOString().split('T')[0];
const tomorrow = new Date(TODAY.getTime() + 86_400_000).toISOString().split('T')[0];
const yesterday = new Date(TODAY.getTime() - 86_400_000).toISOString().split('T')[0];

const farPast = new Date(TODAY.getTime() - 35 * 86_400_000).toISOString().split('T')[0];

const empSession = {
  userId: 'usr-emp',
  employeeId: 'emp-001',
  roles: ['employee' as const],
  email: 'emp@test.com',
  fullName: 'Employee One',
  permissions: [],
  isActive: true,
};

const hrSession = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  roles: ['hr' as const],
  email: 'hr@test.com',
  fullName: 'HR User',
  permissions: [],
  isActive: true,
};

const managerSession = {
  userId: 'usr-mgr',
  employeeId: 'emp-mgr',
  roles: ['manager' as const],
  email: 'mgr@test.com',
  fullName: 'Manager User',
  permissions: [],
  isActive: true,
};

const mockEmployee = {
  id: 'emp-001',
  employeeCode: 'EMP001',
  firstName: 'One',
  lastName: 'Employee',
  status: 'ACTIVE',
  deletedAt: null,
  departmentId: 'dept-01',
  department: { id: 'dept-01', name: 'Engineering' },
  position: { id: 'pos-01', title: 'Developer' },
  managedDepartments: [],
};

const mockLeaveRequest = {
  id: 'leave-001',
  employeeId: 'emp-001',
  requestType: 'LEAVE',
  status: 'PENDING',
  startDate: new Date(today),
  endDate: new Date(tomorrow),
  expectedTime: null,
  durationDays: '2',
  reason: 'Nghỉ phép cá nhân hợp lệ',
  approvalNotes: null,
  approverId: null,
  approvedAt: null,
  leaveTypeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  employee: mockEmployee,
  approver: null,
  leaveType: null,
};

// Helper to set up $transaction to execute the callback
function setupTransaction() {
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
}

// ─────────────────────────────────────────────────────────────────────────────

describe('LeaveService.createLeaveRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: employee found with ACTIVE status
    mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
    mockPrisma.leaveRequest.findFirst.mockResolvedValue(null); // no conflicts
    mockPrisma.leaveType.findUnique.mockResolvedValue(null);   // no leaveType
    setupTransaction();
    mockPrisma.leaveRequest.create.mockResolvedValue({ ...mockLeaveRequest });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('1. creates a LEAVE request successfully', async () => {
    const result = await LeaveService.createLeaveRequest(
      { requestType: 'LEAVE', startDate: today, endDate: tomorrow, reason: 'Nghỉ phép cá nhân', durationDays: 2 },
      empSession
    );
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledOnce();
    expect(result.status).toBe('PENDING');
    expect(result.requestType).toBe('LEAVE');
  });

  it('2. creates a LATE_REQUEST successfully', async () => {
    mockPrisma.leaveRequest.create.mockResolvedValue({
      ...mockLeaveRequest,
      requestType: 'LATE_REQUEST',
      startDate: new Date(today),
      endDate: new Date(today),
      expectedTime: '09:30',
      durationDays: '0.5',
    });

    const result = await LeaveService.createLeaveRequest(
      { requestType: 'LATE_REQUEST', startDate: today, endDate: today, reason: 'Kẹt xe nghiêm trọng', durationDays: 0.5, expectedTime: '09:30' },
      empSession
    );
    expect(mockPrisma.leaveRequest.create).toHaveBeenCalledOnce();
    expect(result.requestType).toBe('LATE_REQUEST');
  });

  it('3. creates an EARLY_LEAVE request successfully', async () => {
    mockPrisma.leaveRequest.create.mockResolvedValue({
      ...mockLeaveRequest,
      requestType: 'EARLY_LEAVE',
      startDate: new Date(today),
      endDate: new Date(today),
      expectedTime: '16:00',
      durationDays: '0.5',
    });

    const result = await LeaveService.createLeaveRequest(
      { requestType: 'EARLY_LEAVE', startDate: today, endDate: today, reason: 'Đưa con đến bệnh viện', durationDays: 0.5, expectedTime: '16:00' },
      empSession
    );
    expect(result.requestType).toBe('EARLY_LEAVE');
  });

  it('4. rejects when endDate < startDate', async () => {
    await expect(
      LeaveService.createLeaveRequest(
        { requestType: 'LEAVE', startDate: tomorrow, endDate: today, reason: 'Nghỉ phép sai ngày', durationDays: 1 },
        empSession
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('5. rejects requests more than 30 days in the past', async () => {
    await expect(
      LeaveService.createLeaveRequest(
        { requestType: 'LEAVE', startDate: farPast, endDate: farPast, reason: 'Nghỉ phép quá hạn', durationDays: 1 },
        empSession
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('6. prevents overlapping LEAVE requests', async () => {
    // Simulate an existing overlapping PENDING leave
    mockPrisma.leaveRequest.findFirst.mockResolvedValue({
      id: 'leave-existing',
      startDate: new Date(today),
      endDate: new Date(tomorrow),
      status: 'PENDING',
    });

    await expect(
      LeaveService.createLeaveRequest(
        { requestType: 'LEAVE', startDate: today, endDate: tomorrow, reason: 'Nghỉ phép trùng', durationDays: 2 },
        empSession
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('7. prevents duplicate LATE_REQUEST on same day', async () => {
    mockPrisma.leaveRequest.findFirst.mockResolvedValue({
      id: 'leave-existing',
      startDate: new Date(today),
      requestType: 'LATE_REQUEST',
      status: 'PENDING',
    });

    await expect(
      LeaveService.createLeaveRequest(
        { requestType: 'LATE_REQUEST', startDate: today, endDate: today, reason: 'Kẹt xe lần hai', durationDays: 0.5, expectedTime: '09:00' },
        empSession
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('LeaveService.processLeaveRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({ ...mockLeaveRequest });
    mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
    setupTransaction();
    mockPrisma.leaveRequest.update.mockResolvedValue({
      ...mockLeaveRequest,
      status: 'APPROVED',
      approverId: 'emp-hr',
      approvedAt: new Date(),
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('8. HR can approve a PENDING request', async () => {
    const result = await LeaveService.processLeaveRequest('leave-001', { decision: 'APPROVED' }, hrSession);
    expect(mockPrisma.leaveRequest.update).toHaveBeenCalledOnce();
    expect(result.status).toBe('APPROVED');
  });

  it('9. HR can reject a PENDING request with notes', async () => {
    mockPrisma.leaveRequest.update.mockResolvedValue({
      ...mockLeaveRequest,
      status: 'REJECTED',
      approvalNotes: 'Không đủ quỹ phép năm.',
    });

    const result = await LeaveService.processLeaveRequest(
      'leave-001',
      { decision: 'REJECTED', approvalNotes: 'Không đủ quỹ phép năm.' },
      hrSession
    );
    expect(result.status).toBe('REJECTED');
  });

  it('10. Employee (no privileged roles) cannot process — throws 403', async () => {
    await expect(
      LeaveService.processLeaveRequest('leave-001', { decision: 'APPROVED' }, empSession)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('11. Manager cannot self-approve their own request — throws 403', async () => {
    // Leave belongs to the manager themselves
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      ...mockLeaveRequest,
      employeeId: 'emp-mgr',
      employee: { ...mockEmployee, id: 'emp-mgr', departmentId: 'dept-01' },
    });
    // Manager employee record
    mockPrisma.employee.findUnique.mockResolvedValue({
      id: 'emp-mgr',
      managedDepartments: [{ id: 'dept-01' }],
    });

    await expect(
      LeaveService.processLeaveRequest('leave-001', { decision: 'APPROVED' }, managerSession)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('12. Manager blocked from employee in different department — throws 403', async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      ...mockLeaveRequest,
      employee: { ...mockEmployee, departmentId: 'dept-99' },
    });
    mockPrisma.employee.findUnique.mockResolvedValue({
      id: 'emp-mgr',
      managedDepartments: [{ id: 'dept-01' }], // manages dept-01, not dept-99
    });

    await expect(
      LeaveService.processLeaveRequest('leave-001', { decision: 'APPROVED' }, managerSession)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('13. Non-PENDING request cannot be processed — throws 400', async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      ...mockLeaveRequest,
      status: 'APPROVED',
    });

    await expect(
      LeaveService.processLeaveRequest('leave-001', { decision: 'REJECTED', approvalNotes: 'Quá hạn' }, hrSession)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('14. Not-found request throws 404', async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue(null);

    await expect(
      LeaveService.processLeaveRequest('leave-nonexistent', { decision: 'APPROVED' }, hrSession)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('LeaveService.cancelLeaveRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({ ...mockLeaveRequest });
    mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
    setupTransaction();
    mockPrisma.leaveRequest.update.mockResolvedValue({
      ...mockLeaveRequest,
      status: 'CANCELLED',
    });
    mockPrisma.auditLog.create.mockResolvedValue({});
  });

  it('15. Employee can cancel their own PENDING request', async () => {
    const result = await LeaveService.cancelLeaveRequest('leave-001', {}, empSession);
    expect(mockPrisma.leaveRequest.update).toHaveBeenCalledOnce();
    expect(result.status).toBe('CANCELLED');
  });

  it('16. Employee cannot cancel another employee\'s request — throws 403', async () => {
    // Leave belongs to a different employee
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      ...mockLeaveRequest,
      employeeId: 'emp-OTHER',
    });

    await expect(
      LeaveService.cancelLeaveRequest('leave-001', {}, empSession)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('17. Cannot cancel a non-PENDING (APPROVED) request — throws 400', async () => {
    mockPrisma.leaveRequest.findUnique.mockResolvedValue({
      ...mockLeaveRequest,
      status: 'APPROVED',
    });

    await expect(
      LeaveService.cancelLeaveRequest('leave-001', {}, empSession)
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('LeaveService.listLeaveRequests — RBAC scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
    mockPrisma.leaveRequest.count.mockResolvedValue(1);
    mockPrisma.leaveRequest.findMany.mockResolvedValue([{ ...mockLeaveRequest }]);
  });

  it('18. Employee sees only their own requests (scoped by employeeId)', async () => {
    await LeaveService.listLeaveRequests({ status: 'ALL', requestType: 'ALL', page: 1, limit: 50 }, empSession);
    // The where clause should have set employeeId filter
    const callArgs = mockPrisma.leaveRequest.findMany.mock.calls[0][0];
    expect(callArgs.where).toHaveProperty('employeeId', 'emp-001');
  });

  it('19. HR sees all requests (no RBAC restriction)', async () => {
    await LeaveService.listLeaveRequests({ status: 'ALL', requestType: 'ALL', page: 1, limit: 50 }, hrSession);
    const callArgs = mockPrisma.leaveRequest.findMany.mock.calls[0][0];
    // HR should NOT have employeeId scoping in where
    expect(callArgs.where).not.toHaveProperty('employeeId');
    expect(callArgs.where).not.toHaveProperty('OR');
  });

  it('20. Status filter applied correctly', async () => {
    await LeaveService.listLeaveRequests({ status: 'PENDING', requestType: 'ALL', page: 1, limit: 50 }, hrSession);
    const callArgs = mockPrisma.leaveRequest.findMany.mock.calls[0][0];
    expect(callArgs.where).toHaveProperty('status', 'PENDING');
  });

  it('21. RequestType filter applied correctly', async () => {
    await LeaveService.listLeaveRequests({ status: 'ALL', requestType: 'LATE_REQUEST', page: 1, limit: 50 }, hrSession);
    const callArgs = mockPrisma.leaveRequest.findMany.mock.calls[0][0];
    expect(callArgs.where).toHaveProperty('requestType', 'LATE_REQUEST');
  });

  it('22. Returns paginated meta', async () => {
    mockPrisma.leaveRequest.count.mockResolvedValue(45);
    const result = await LeaveService.listLeaveRequests({ status: 'ALL', requestType: 'ALL', page: 2, limit: 20 }, hrSession);
    expect(result.meta.page).toBe(2);
    expect(result.meta.total).toBe(45);
    expect(result.meta.totalPages).toBe(3); // ceil(45/20)
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('LeaveService.getDashboardSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.employee.findUnique.mockResolvedValue(mockEmployee);
  });

  it('23. HR dashboard returns correct pending counts', async () => {
    // count is called 4x: totalPending, LEAVE, LATE_REQUEST, EARLY_LEAVE
    mockPrisma.leaveRequest.count
      .mockResolvedValueOnce(7)  // totalPending
      .mockResolvedValueOnce(4)  // pendingLeaves
      .mockResolvedValueOnce(2)  // pendingLate
      .mockResolvedValueOnce(1); // pendingEarly
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);

    const result = await LeaveService.getDashboardSummary(hrSession);
    expect(result.totalPending).toBe(7);
    expect(result.pendingLeaves).toBe(4);
    expect(result.pendingLate).toBe(2);
    expect(result.pendingEarly).toBe(1);
    expect(result.recentPending).toEqual([]);
  });

  it('24. Employee dashboard scoped to own requests', async () => {
    mockPrisma.leaveRequest.count.mockResolvedValue(0);
    mockPrisma.leaveRequest.findMany.mockResolvedValue([]);

    await LeaveService.getDashboardSummary(empSession);

    // For employee, count should be called with the employeeId constraint
    const firstCall = mockPrisma.leaveRequest.count.mock.calls[0][0];
    expect(firstCall.where).toHaveProperty('employeeId', 'emp-001');
  });
});
