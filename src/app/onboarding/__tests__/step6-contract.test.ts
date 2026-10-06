import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingPage from '../page';

// Exercise the real page handlers with deterministic hooks in Vitest's Node environment.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  stateIndex: 0,
  effects: [] as Array<{ deps: unknown[]; cleanup?: () => void }>,
  effectIndex: 0,
  pending: [] as Array<() => void>,
}));

vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value: unknown) => {
      hooks.states[index] = typeof value === 'function' ? value(hooks.states[index]) : value;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.effectIndex++;
    const previous = hooks.effects[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      hooks.effects[index] = { deps, cleanup: effect() || undefined };
    });
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const department = { id: 'department-a', name: 'Engineering', code: 'ENG', isActive: true };
const position = { id: 'position-a', title: 'Engineer', code: 'SWE', isActive: true };
const status = {
  organization: { id: 'test-tenant', name: 'Test Tenant' },
  onboardingStep: 6,
  isCompleted: false,
  onboardingSkipped: false,
  steps: [],
};
const response = (data: unknown, ok = true, success = true) => ({
  ok, json: async () => ({ success, data }),
});
let departmentResponse: ReturnType<typeof response> | Promise<ReturnType<typeof response>>;
let positionResponse: ReturnType<typeof response> | Promise<ReturnType<typeof response>>;
let initialStep: number;
const fetchMock = vi.fn();
let tree: React.ReactNode;

function renderPage() {
  hooks.stateIndex = 0;
  hooks.effectIndex = 0;
  tree = OnboardingPage();
  hooks.pending.splice(0).forEach((effect) => effect());
}

async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
  renderPage();
}

async function mountPage() {
  renderPage();
  await settle();
  await settle();
}

function elements(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child));
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}

function select(id: string) {
  const element = elements(tree).find((item) => item.type === 'select' && item.props.id === id);
  expect(element).toBeDefined();
  return element!;
}

function button(label = 'Lưu & Tiếp Tục') {
  const element = elements(tree).find((item) => item.props.onClick && text(item).includes(label));
  expect(element).toBeDefined();
  return element!;
}

function choose(id: string, value: string) {
  select(id).props.onChange({ target: { value } });
  renderPage();
}

function posts() {
  return fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST');
}

beforeEach(() => {
  hooks.states = [];
  hooks.effects = [];
  hooks.pending = [];
  initialStep = 6;
  departmentResponse = response([department, { ...department, id: 'inactive-department', isActive: false }]);
  positionResponse = response([position, { ...position, id: 'inactive-position', isActive: false }]);
  fetchMock.mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/onboarding/status') return response({ ...status, onboardingStep: initialStep });
    if (url === '/api/v1/departments') return departmentResponse;
    if (url === '/api/v1/positions') return positionResponse;
    if (url === '/api/v1/onboarding/step') return response({ status });
    throw new Error('Unexpected request in local test');
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  hooks.effects.forEach((effect) => effect.cleanup?.());
  vi.unstubAllGlobals();
});

describe('Onboarding Step 6 UI/API contract', () => {
  it('starts with empty required selections and renders only active API records by ID', async () => {
    await mountPage();
    for (const id of ['step6-department', 'step6-position']) {
      expect(select(id).props.value).toBe('');
      expect(select(id).props.required).toBe(true);
      expect(select(id).props.disabled).toBe(false);
    }
    const options = elements(tree).filter((item) => item.type === 'option');
    expect(options.map((item) => item.props.value)).toEqual(['', department.id, '', position.id]);
    expect(options.map((item) => text(item))).toContain('Engineering (ENG)');
    expect(options.map((item) => text(item))).toContain('Engineer (SWE)');
    expect(text(tree)).toContain('Phòng Ban *');
    expect(text(tree)).toContain('Chức Danh *');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/onboarding/status', '/api/v1/departments', '/api/v1/positions',
    ]);
    expect(posts()).toHaveLength(0);
  });

  it('submits both selected database IDs in the existing Step 6 POST payload', async () => {
    await mountPage();
    choose('step6-department', department.id);
    choose('step6-position', position.id);
    await button().props.onClick();
    expect(posts()).toHaveLength(1);
    const [url, options] = posts()[0];
    expect(url).toBe('/api/v1/onboarding/step');
    expect(JSON.parse(options.body)).toEqual({
      step: 6,
      data: {
        firstName: 'Văn A', lastName: 'Nguyễn', employeeCode: 'EMP-001',
        email: 'nhanvien@company.vn', phoneNumber: '0987654321', contractSalary: 18000000,
        departmentId: department.id, positionId: position.id,
      },
    });
  });

  it.each([['', ''], [department.id, ''], ['', position.id]])(
    'blocks submission when a required selection is empty (%s, %s)', async (departmentId, positionId) => {
      await mountPage();
      choose('step6-department', departmentId);
      choose('step6-position', positionId);
      await button().props.onClick();
      renderPage();
      expect(posts()).toHaveLength(0);
      expect(text(tree)).toContain('Vui lòng chọn đầy đủ Phòng Ban và Chức Danh');
    },
  );

  it('blocks submission while reference APIs are loading', async () => {
    departmentResponse = new Promise(() => {});
    await mountPage();
    expect(button().props.disabled).toBe(true);
    expect(select('step6-department').props.disabled).toBe(true);
    await button().props.onClick();
    expect(posts()).toHaveLength(0);
  });

  it.each(['department', 'position'])('fails closed if the %s API fails and permits a GET-only retry', async (api) => {
    if (api === 'department') departmentResponse = response([], false);
    else positionResponse = response([], true, false);
    await mountPage();
    expect(button().props.disabled).toBe(true);
    expect(text(tree)).toContain('Không thể tải phòng ban hoặc chức danh');
    await button().props.onClick();
    expect(posts()).toHaveLength(0);
    departmentResponse = response([department]);
    positionResponse = response([position]);
    button('Tải lại danh sách').props.onClick();
    renderPage();
    await settle();
    expect(button().props.disabled).toBe(false);
    expect(posts()).toHaveLength(0);
  });

  it('rejects a malformed reference collection instead of fabricating options', async () => {
    positionResponse = response({ positions: [position] });
    await mountPage();
    expect(button().props.disabled).toBe(true);
    await button().props.onClick();
    expect(posts()).toHaveLength(0);
  });

  it('rejects IDs that are not in the active reference lists', async () => {
    await mountPage();
    choose('step6-department', 'inactive-department');
    choose('step6-position', position.id);
    await button().props.onClick();
    renderPage();
    expect(posts()).toHaveLength(0);
    expect(text(tree)).toContain('không còn trong danh sách hoạt động');
  });

  it('does not fetch Step 6 references or gate the existing Step 1 save', async () => {
    initialStep = 1;
    await mountPage();
    expect(button().props.disabled).toBe(false);
    await button().props.onClick();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/onboarding/status', '/api/v1/onboarding/step',
    ]);
    expect(JSON.parse(posts()[0][1].body)).toMatchObject({ step: 1, data: { name: 'Test Tenant' } });
  });
});
