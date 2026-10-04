import { parseBusinessDate } from '@/lib/time/business-time';

const CANONICAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POSTGRES_DATE_CARRIER_PATTERN = /^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/;

export function formatClientBusinessDate(value: string): string {
  if (typeof value !== 'string') {
    throw new RangeError('Ngay nghiep vu phai la chuoi hop le.');
  }

  const carrierMatch = POSTGRES_DATE_CARRIER_PATTERN.exec(value);
  const canonicalDate = CANONICAL_DATE_PATTERN.test(value) ? value : carrierMatch?.[1];

  if (!canonicalDate) {
    throw new RangeError('Ngay nghiep vu phai la YYYY-MM-DD hoac PostgreSQL DATE carrier.');
  }

  parseBusinessDate(canonicalDate);

  const [year, month, day] = canonicalDate.split('-');
  return `${day}/${month}/${year}`;
}
