export const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const EXPLICIT_OFFSET_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/i;

interface BusinessDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const businessDateTimeFormatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function requireValidInstant(value: Date | string | number): Date {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('Thoi diem khong hop le.');
  }
  return instant;
}

function getBusinessDateTimeParts(value: Date | string | number): BusinessDateTimeParts {
  const instant = requireValidInstant(value);
  const parts = businessDateTimeFormatter.formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
    hour: Number(values.get('hour')),
    minute: Number(values.get('minute')),
    second: Number(values.get('second')),
  };
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateParts(dateString: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(dateString);
  if (!match) {
    throw new RangeError('Ngay nghiep vu phai co dinh dang YYYY-MM-DD.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError('Ngay nghiep vu khong ton tai trong lich.');
  }

  return { year, month, day };
}

export function getBusinessDateString(instant: Date | string | number = new Date()): string {
  const { year, month, day } = getBusinessDateTimeParts(instant);
  return formatDateParts(year, month, day);
}

export function parseBusinessDate(dateString: string): Date {
  const { year, month, day } = parseDateParts(dateString);
  const carrier = new Date(Date.UTC(year, month - 1, day));

  if (formatBusinessDate(carrier) !== dateString) {
    throw new RangeError('Ngay nghiep vu khong the round-trip chinh xac.');
  }

  return carrier;
}

export function formatBusinessDate(dateCarrier: Date): string {
  const carrier = requireValidInstant(dateCarrier);
  return formatDateParts(
    carrier.getUTCFullYear(),
    carrier.getUTCMonth() + 1,
    carrier.getUTCDate()
  );
}

export function addBusinessDays(date: string | Date, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError('So ngay cong them phai la so nguyen.');
  }

  const dateString = typeof date === 'string' ? date : formatBusinessDate(date);
  const carrier = parseBusinessDate(dateString);
  carrier.setUTCDate(carrier.getUTCDate() + days);
  return formatBusinessDate(carrier);
}

export function getBusinessWeekday(value: string | Date): number {
  const businessDate =
    typeof value === 'string' && DATE_PATTERN.test(value)
      ? value
      : getBusinessDateString(value);
  return parseBusinessDate(businessDate).getUTCDay();
}

export function getBusinessTimeMinutes(instant: Date | string | number): number {
  const { hour, minute } = getBusinessDateTimeParts(instant);
  return hour * 60 + minute;
}

export function hasExplicitUtcOffset(value: string): boolean {
  return EXPLICIT_OFFSET_PATTERN.test(value);
}

export function parseBusinessLocalDateTime(dateOrDateTime: string, time?: string): Date {
  const input = time === undefined ? dateOrDateTime : `${dateOrDateTime}T${time}`;

  if (time === undefined && hasExplicitUtcOffset(input)) {
    return requireValidInstant(input);
  }

  const match = LOCAL_DATE_TIME_PATTERN.exec(input);
  if (!match) {
    throw new RangeError('Thoi gian dia phuong phai co dinh dang YYYY-MM-DDTHH:mm[:ss[.SSS]].');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? '').padEnd(3, '0') || 0);

  parseDateParts(formatDateParts(year, month, day));
  if (hour > 23 || minute > 59 || second > 59) {
    throw new RangeError('Gio dia phuong khong hop le.');
  }

  const targetWallClock = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let candidateMs = targetWallClock;

  // Intl formats instants but does not parse wall-clock values. Refine an instant
  // until its formatted business-time components equal the requested components.
  for (let attempt = 0; attempt < 3; attempt++) {
    const represented = getBusinessDateTimeParts(new Date(candidateMs));
    const representedWallClock = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
      millisecond
    );
    const correction = targetWallClock - representedWallClock;
    candidateMs += correction;
    if (correction === 0) break;
  }

  const candidate = new Date(candidateMs);
  const roundTrip = getBusinessDateTimeParts(candidate);
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute ||
    roundTrip.second !== second
  ) {
    throw new RangeError('Thoi gian dia phuong khong the anh xa chinh xac vao mui gio nghiep vu.');
  }

  return candidate;
}

export function formatBusinessTime(instant: Date | string | number): string {
  const { hour, minute, second } = getBusinessDateTimeParts(instant);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}
