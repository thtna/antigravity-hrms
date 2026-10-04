import {
  addBusinessDays,
  formatBusinessDate,
  getBusinessDateString,
  getBusinessWeekday,
  parseBusinessDate,
} from '@/lib/time/business-time';

export interface ClientBusinessDateRange {
  startDate: string;
  endDate: string;
}

export function getClientBusinessMonthRange(
  instant: Date | string | number = new Date(),
  monthOffset = 0
): ClientBusinessDateRange {
  if (!Number.isInteger(monthOffset)) {
    throw new RangeError('Do lech thang nghiep vu phai la so nguyen.');
  }

  const currentBusinessDate = getBusinessDateString(instant);
  const monthStart = parseBusinessDate(`${currentBusinessDate.slice(0, 7)}-01`);
  monthStart.setUTCMonth(monthStart.getUTCMonth() + monthOffset);

  const startDate = formatBusinessDate(monthStart);
  monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  const endDate = addBusinessDays(formatBusinessDate(monthStart), -1);

  return { startDate, endDate };
}

export function getClientBusinessWeekToDateRange(
  instant: Date | string | number = new Date()
): ClientBusinessDateRange {
  const endDate = getBusinessDateString(instant);
  const daysSinceMonday = (getBusinessWeekday(endDate) + 6) % 7;

  return {
    startDate: addBusinessDays(endDate, -daysSinceMonday),
    endDate,
  };
}
