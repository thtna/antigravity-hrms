import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SuperAdminPage from '../page';

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value: unknown) => { hooks.states[index] = value; }];
  },
  useEffect: vi.fn(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock('@/components/layout/AppShell', () => ({ AppShell: 'main' }));
vi.mock('@/components/ui/toast', () => ({ useToastHelpers: () => ({ success: vi.fn(), error: toastError }) }));

const fetchMock = vi.fn();
const tenant = (status: 'PENDING' | 'SUSPENDED') => ({
  id: `test-${status}`, status, name: 'Existing Test Tenant', slug: 'existing-test-tenant',
  owner: { name: 'Test Owner', email: 'owner@example.test' },
  createdAt: '2026-10-01T00:00:00Z', employeesCount: 0, branchesCount: 0,
});

function render() {
  hooks.index = 0;
  return SuperAdminPage();
}
function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: React.ReactNode; header?: React.ReactNode }>(node)) return [];
  return [node, ...elements(node.props.header), ...elements(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return '';
}
async function loadMetrics(totalTenants: number, active: number) {
  render();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {
    items: [tenant('PENDING'), tenant('SUSPENDED')],
    metrics: { totalTenants, active, pending: 1, suspended: 1, rejected: 0, closed: 0,
      maxTenants: 5, registeredQuotaDisplay: `${totalTenants} / 5`, canRegisterMore: totalTenants < 5 },
  } }) });
  const refresh = elements(render()).find((el) =>
    typeof el.props.onClick === 'function' && text(el.props.children) === 'Làm mới'
  );
  await refresh!.props.onClick();
  return render();
}

describe('Super Admin registration quota UI contract', () => {
  beforeEach(() => {
    hooks.states = [];
    hooks.index = 0;
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([[4, 0, 80], [5, 0, 100], [7, 5, 100]])
    ('displays total registered=%i independently of active=%i', async (total, active, percent) => {
      const tree = await loadMetrics(total, active);
      expect(text(tree)).toContain('Giới hạn đăng ký tenant');
      expect(text(tree)).toContain(`${total} / 5`);
      expect(elements(tree).some((el) => el.props.style?.width === `${percent}%`)).toBe(true);
      expect(text(tree).includes('Không thể đăng ký tổ chức mới')).toBe(total >= 5);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/v1/super-admin/tenants?');
    });

  it.each([['Phê duyệt tổ chức', 'APPROVE'], ['Kích hoạt lại', 'ACTIVATE']])
    ('keeps %s enabled and opens confirmation at 5 active / 7 registered', async (title, action) => {
      let tree = await loadMetrics(7, 5);
      const button = elements(tree).find((el) => el.type === 'button' && el.props.title === title);
      expect(button).toBeDefined();
      expect(button!.props.disabled).not.toBe(true);
      button!.props.onClick();
      tree = render();
      expect(text(tree)).toContain(`Xác nhận: ${action === 'APPROVE' ? 'Phê duyệt' : 'Kích hoạt lại'} (${action})`);
      expect(text(tree)).toContain('không sử dụng thêm slot đăng ký');
      expect(toastError).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1); // Opening confirmation does not submit a mutation.
    });
});
