import {
  BUSINESS_TIME_ZONE,
  formatBusinessTime,
  hasExplicitUtcOffset,
} from '@/lib/time/business-time';

const businessDateFormatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const businessLongDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function requireAbsoluteInstant(value: Date | string): Date {
  if (value instanceof Date) {
    const instant = new Date(value.getTime());
    if (Number.isNaN(instant.getTime())) {
      throw new RangeError('Thoi diem khong hop le.');
    }
    return instant;
  }

  if (typeof value !== 'string' || !hasExplicitUtcOffset(value)) {
    throw new RangeError('Thoi diem phai co mui gio UTC hoac offset ro rang.');
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Thoi diem khong hop le.');
  }

  return instant;
}

export function formatClientBusinessInstantTime(
  value: Date | string,
  options?: { precision?: 'minute' | 'second' }
): string {
  const precision = options?.precision ?? 'second';
  if (precision !== 'minute' && precision !== 'second') {
    throw new RangeError('Do chinh xac thoi gian khong hop le.');
  }

  const formatted = formatBusinessTime(requireAbsoluteInstant(value));
  return precision === 'minute' ? formatted.slice(0, 5) : formatted;
}

export function formatClientBusinessInstantDate(
  value: Date | string,
  options?: { includeYear?: boolean }
): string {
  const instant = requireAbsoluteInstant(value);
  const parts = businessDateFormatter.formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const day = values.get('day');
  const month = values.get('month');
  const year = values.get('year');

  if (!day || !month || !year) {
    throw new RangeError('Khong the dinh dang ngay nghiep vu.');
  }

  return options?.includeYear === false ? `${day}/${month}` : `${day}/${month}/${year}`;
}

export function formatClientBusinessInstantDateTime(value: Date | string): string {
  const instant = requireAbsoluteInstant(value);
  const parts = businessDateFormatter.formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const day = values.get('day');
  const month = values.get('month');
  const year = values.get('year');

  if (!day || !month || !year) {
    throw new RangeError('Khong the dinh dang ngay nghiep vu.');
  }

  return `${day}/${month}/${year} ${formatBusinessTime(instant)}`;
}

export function formatClientBusinessInstantLongDate(value: Date | string): string {
  return businessLongDateFormatter.format(requireAbsoluteInstant(value));
}
