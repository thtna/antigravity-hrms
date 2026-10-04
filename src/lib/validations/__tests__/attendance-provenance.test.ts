import { describe, expect, it } from 'vitest';
import { CheckInSchema, CheckOutSchema } from '@/lib/validations/attendance';

const untrustedMethods = ['QR', 'GPS', 'MANUAL', 'BIOMETRIC'] as const;

describe('R2B public attendance provenance boundary', () => {
  it.each(untrustedMethods)('strips client check-in provenance %s', (checkInMethod) => {
    const parsed = CheckInSchema.parse({ checkInMethod });

    expect(parsed).not.toHaveProperty('checkInMethod');
  });

  it.each(untrustedMethods)('strips client check-out provenance %s', (checkOutMethod) => {
    const parsed = CheckOutSchema.parse({ checkOutMethod });

    expect(parsed).not.toHaveProperty('checkOutMethod');
  });
});
