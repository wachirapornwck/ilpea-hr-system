// =============================================================================
// lib/attendance/dateUtils.ts
// =============================================================================
// Date & Time Utilities — Bangkok Timezone + Overnight Shift Support
// =============================================================================

import { TIMEZONE, SHIFTS, type ShiftId } from './constants';

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun … 6=Sat
}

// -----------------------------------------------------------------------------
// Core: Bangkok Time
// -----------------------------------------------------------------------------

export function toBangkokTime(date: Date): LocalDateTime {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  const getStr = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const rawHour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: get('minute'),
    second: get('second'),
    dayOfWeek: weekdayMap[getStr('weekday')] ?? 0,
  };
}

export function getBangkokNow(): Date {
  return new Date();
}

export function createBangkokDate(
  dateStr: string,
  hour: number,
  minute: number
): Date {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${dateStr}T${hh}:${mm}:00+07:00`);
}

// -----------------------------------------------------------------------------
// Date String Utilities
// -----------------------------------------------------------------------------

export function toDateString(date: Date): string {
  const { year, month, day } = toBangkokTime(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0'
  )}`;
}

export function toTimeString(date: Date): string {
  const { hour, minute } = toBangkokTime(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function toMinutesSinceMidnight(date: Date): number {
  const { hour, minute } = toBangkokTime(date);
  return hour * 60 + minute;
}

// -----------------------------------------------------------------------------
// Overnight Shift Utilities
// -----------------------------------------------------------------------------

/**
 * แปลง clockTime → นาทีนับจาก shift start (shift-relative minutes)
 * กะดึก clock out วันถัดไป → ใส่ isNextDay=true → ค่า > 540 (9ชม.)
 */
export function toShiftRelativeMinutes(
  clockTime: Date,
  shiftId: ShiftId,
  isNextDay: boolean = false
): number {
  const shift = SHIFTS[shiftId];
  const minutesSinceMidnight = toMinutesSinceMidnight(clockTime);
  const absoluteMinutes = isNextDay
    ? 24 * 60 + minutesSinceMidnight
    : minutesSinceMidnight;
  return absoluteMinutes - shift.START_TOTAL_MINUTES;
}

/** ตรวจว่า clockTime อยู่วันถัดจาก shiftDate ไหม (Bangkok time) */
export function isNextDayFromShift(
  clockTime: Date,
  shiftDate: string
): boolean {
  return toDateString(clockTime) !== shiftDate;
}

/**
 * หาวันที่ shift เริ่มจาก clock in time ของกะดึก
 * ถ้า clock in หลังเที่ยงคืน (< 06:00) → shift date = เมื่อวาน
 */
export function getNightShiftDate(clockInTime: Date): string {
  const { hour } = toBangkokTime(clockInTime);
  if (hour < 6) {
    const yesterday = new Date(clockInTime);
    yesterday.setDate(yesterday.getDate() - 1);
    return toDateString(yesterday);
  }
  return toDateString(clockInTime);
}

// -----------------------------------------------------------------------------
// Date Comparison
// -----------------------------------------------------------------------------

export function isSameDay(d1: Date, d2: Date): boolean {
  return toDateString(d1) === toDateString(d2);
}

export function isFutureDate(date: Date): boolean {
  return toDateString(date) > toDateString(new Date());
}

export function daysBetween(d1: Date, d2: Date): number {
  const a = new Date(toDateString(d1) + 'T00:00:00+07:00');
  const b = new Date(toDateString(d2) + 'T00:00:00+07:00');
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

// -----------------------------------------------------------------------------
// Day Type
// -----------------------------------------------------------------------------

export function isWeekend(date: Date): boolean {
  const { dayOfWeek } = toBangkokTime(date);
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function getDayNameTH(date: Date): string {
  return ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'][
    toBangkokTime(date).dayOfWeek
  ];
}

// -----------------------------------------------------------------------------
// Range Utilities
// -----------------------------------------------------------------------------

export function getMonthRange(
  year: number,
  month: number
): { start: Date; end: Date } {
  const lastDay = new Date(year, month, 0).getDate();
  const m = String(month).padStart(2, '0');
  return {
    start: createBangkokDate(`${year}-${m}-01`, 0, 0),
    end: createBangkokDate(
      `${year}-${m}-${String(lastDay).padStart(2, '0')}`,
      23,
      59
    ),
  };
}

export function getDayRange(dateStr: string): { start: Date; end: Date } {
  return {
    start: createBangkokDate(dateStr, 0, 0),
    end: createBangkokDate(dateStr, 23, 59),
  };
}

export function getDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startStr + 'T00:00:00+07:00');
  const end = new Date(endStr + 'T00:00:00+07:00');
  while (cur <= end) {
    dates.push(toDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// -----------------------------------------------------------------------------
// Formatting
// -----------------------------------------------------------------------------

export function minutesToHM(total: number): { hours: number; minutes: number } {
  return {
    hours: Math.floor(Math.abs(total) / 60),
    minutes: Math.abs(total) % 60,
  };
}

export function formatDuration(total: number): string {
  const { hours, minutes } = minutesToHM(total);
  return `${hours}h ${minutes}m`;
}

export function formatDateTH(date: Date): string {
  const { year, month, day } = toBangkokTime(date);
  const months = [
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];
  return `${day} ${months[month - 1]} ${year + 543}`;
}

export function formatDateEN(date: Date): string {
  return date.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// -----------------------------------------------------------------------------
// Shift Schedule Helpers
// -----------------------------------------------------------------------------

export function getShiftStartTime(shiftId: ShiftId, dateStr: string): Date {
  const s = SHIFTS[shiftId];
  return createBangkokDate(dateStr, s.START_HOUR, s.START_MINUTE);
}

export function getShiftEndTime(shiftId: ShiftId, shiftDateStr: string): Date {
  const s = SHIFTS[shiftId];
  if (s.IS_OVERNIGHT) {
    const next = new Date(shiftDateStr + 'T00:00:00+07:00');
    next.setDate(next.getDate() + 1);
    return createBangkokDate(toDateString(next), s.END_HOUR, s.END_MINUTE);
  }
  return createBangkokDate(shiftDateStr, s.END_HOUR, s.END_MINUTE);
}

/** "HH:MM" → นาทีนับจาก 00:00 */
export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
