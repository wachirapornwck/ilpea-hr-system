// =============================================================================
// lib/attendance/validators.ts
// =============================================================================

import {
  ATTENDANCE_LIMITS,
  SHIFTS,
  EMPLOYEE_TYPES,
  type ShiftId,
} from './constants';
import {
  toDateString,
  toTimeString,
  toShiftRelativeMinutes,
  isNextDayFromShift,
  isFutureDate,
  daysBetween,
} from './dateUtils';
import {
  AlreadyClockedInError,
  AlreadyClockedOutError,
  NotClockedInError,
  ClockOutBeforeClockInError,
  ShiftTooLongError,
  FutureDateError,
  InvalidClockTimeError,
  InvalidDateRangeError,
  WhiteCollarNoClockError,
} from './errors';
import type {
  AttendanceRecord,
  ClockInPayload,
  ClockOutPayload,
  ManualAttendancePayload,
  ValidationResult,
} from './types';

// =============================================================================
// White Collar Guard
// =============================================================================

/**
 * White Collar ไม่ต้อง clock in/out
 * ถ้า employeeType = white_collar → throw ทันที
 */
export function validateNotWhiteCollar(
  userId: string,
  employeeType: string
): void {
  if (employeeType === EMPLOYEE_TYPES.WHITE_COLLAR) {
    throw new WhiteCollarNoClockError(userId);
  }
}

// =============================================================================
// Clock In Validation
// =============================================================================

export function validateClockIn(
  payload: ClockInPayload,
  existingRecord?: AttendanceRecord | null
): void {
  const clockInTime = payload.clockInTime ?? new Date();
  const shift = SHIFTS[payload.shiftId];

  // กะดึก: หาวันที่ shift จริง
  const shiftDate = shift.IS_OVERNIGHT
    ? (() => {
        const { hour } = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Bangkok',
          hour: 'numeric',
          hour12: false,
        })
          .formatToParts(clockInTime)
          .reduce(
            (acc, p) => ({ ...acc, [p.type]: p.value }),
            {} as Record<string, string>
          );
        return parseInt(hour) < 6
          ? (() => {
              const d = new Date(clockInTime);
              d.setDate(d.getDate() - 1);
              return toDateString(d);
            })()
          : toDateString(clockInTime);
      })()
    : toDateString(clockInTime);

  // 1. ห้าม clock in วันอนาคต
  if (isFutureDate(new Date(shiftDate + 'T12:00:00+07:00'))) {
    throw new FutureDateError(shiftDate);
  }

  // 2. ห้าม clock in ซ้ำ
  if (existingRecord?.clockInTime) {
    throw new AlreadyClockedInError(shiftDate, shift.label);
  }

  // 3. ห้าม clock in เร็วเกินไป (> 60 นาทีก่อน shift start)
  const isNextDay = shift.IS_OVERNIGHT
    ? isNextDayFromShift(clockInTime, shiftDate)
    : false;
  const clockInRel = toShiftRelativeMinutes(
    clockInTime,
    payload.shiftId,
    isNextDay
  );
  if (clockInRel < -ATTENDANCE_LIMITS.EARLY_CLOCK_IN_MINUTES) {
    throw new InvalidClockTimeError(
      `Too early: ${Math.abs(clockInRel)} minutes before shift start (max ${
        ATTENDANCE_LIMITS.EARLY_CLOCK_IN_MINUTES
      } minutes early).`,
      { clockInRel, shiftId: payload.shiftId }
    );
  }
}

// =============================================================================
// Clock Out Validation
// =============================================================================

export function validateClockOut(
  payload: ClockOutPayload,
  existingRecord: AttendanceRecord | null
): void {
  const clockOutTime = payload.clockOutTime ?? new Date();

  // 1. ต้องมี clock in
  if (!existingRecord?.clockInTime) {
    throw new NotClockedInError(toDateString(clockOutTime));
  }

  const clockInTime =
    existingRecord.clockInTime instanceof Date
      ? existingRecord.clockInTime
      : new Date(
          (existingRecord.clockInTime as unknown as { seconds: number })
            .seconds * 1000
        );

  // 2. ห้าม clock out ซ้ำ
  if (existingRecord.clockOutTime) {
    const prevClockOut =
      existingRecord.clockOutTime instanceof Date
        ? existingRecord.clockOutTime
        : new Date(
            (existingRecord.clockOutTime as unknown as { seconds: number })
              .seconds * 1000
          );
    throw new AlreadyClockedOutError(
      existingRecord.date,
      toTimeString(prevClockOut)
    );
  }

  // 3. clock out ต้องหลัง clock in
  if (clockOutTime.getTime() <= clockInTime.getTime()) {
    throw new ClockOutBeforeClockInError(
      toTimeString(clockInTime),
      toTimeString(clockOutTime),
      SHIFTS[existingRecord.shiftId].IS_OVERNIGHT
    );
  }

  // 4. ระยะเวลาไม่เกิน 14 ชม.
  const shiftMinutes =
    (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60);
  if (shiftMinutes > ATTENDANCE_LIMITS.MAX_SHIFT_MINUTES) {
    throw new ShiftTooLongError(
      shiftMinutes,
      ATTENDANCE_LIMITS.MAX_SHIFT_MINUTES
    );
  }
}

// =============================================================================
// Manual Attendance Validation (HR)
// =============================================================================

export function validateManualAttendance(
  payload: ManualAttendancePayload
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  const recordDate = new Date(payload.date + 'T12:00:00+07:00');

  // 1. ไม่เกิน 30 วันย้อนหลัง
  if (
    daysBetween(recordDate, new Date()) > ATTENDANCE_LIMITS.MANUAL_EDIT_DAYS
  ) {
    errors.push({
      field: 'date',
      message: `Cannot edit records older than ${ATTENDANCE_LIMITS.MANUAL_EDIT_DAYS} days.`,
    });
  }

  // 2. ไม่ใช่อนาคต
  if (isFutureDate(recordDate)) {
    errors.push({
      field: 'date',
      message: 'Cannot create attendance for future date.',
    });
  }

  // 3. บังคับมี reason (≥ 5 ตัวอักษร)
  if (!payload.reason || payload.reason.trim().length < 5) {
    errors.push({
      field: 'reason',
      message: 'Reason must be at least 5 characters.',
    });
  }

  // 4. บังคับมี comment
  if (!payload.comment || payload.comment.trim().length < 3) {
    errors.push({ field: 'comment', message: 'Comment is required.' });
  }

  // 5. clock out หลัง clock in
  if (payload.clockOutTime.getTime() <= payload.clockInTime.getTime()) {
    errors.push({
      field: 'clockOutTime',
      message: 'Clock-out must be after clock-in.',
    });
  }

  // 6. ระยะเวลาไม่เกิน 14 ชม.
  const shiftMinutes =
    (payload.clockOutTime.getTime() - payload.clockInTime.getTime()) /
    (1000 * 60);
  if (shiftMinutes > ATTENDANCE_LIMITS.MAX_SHIFT_MINUTES) {
    errors.push({
      field: 'clockOutTime',
      message: `Shift duration exceeds maximum ${
        ATTENDANCE_LIMITS.MAX_SHIFT_MINUTES / 60
      }h.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// Date Range Validation
// =============================================================================

export function validateDateRange(startDate: string, endDate: string): void {
  const start = new Date(startDate + 'T00:00:00+07:00');
  const end = new Date(endDate + 'T00:00:00+07:00');

  if (start > end) {
    throw new InvalidDateRangeError('Start date must be before end date.', {
      startDate,
      endDate,
    });
  }

  const rangeDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > ATTENDANCE_LIMITS.MAX_REPORT_RANGE_DAYS) {
    throw new InvalidDateRangeError(
      `Range (${Math.round(rangeDays)} days) exceeds maximum (${
        ATTENDANCE_LIMITS.MAX_REPORT_RANGE_DAYS
      } days).`,
      { startDate, endDate }
    );
  }
}

// =============================================================================
// Shift Override Validation
// =============================================================================

export function validateShiftOverride(
  startTime: string,
  endTime: string,
  date: string
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(startTime))
    errors.push({
      field: 'startTime',
      message: 'Invalid start time format. Use HH:MM.',
    });
  if (!timeRegex.test(endTime))
    errors.push({
      field: 'endTime',
      message: 'Invalid end time format. Use HH:MM.',
    });

  if (
    isFutureDate(new Date(date + 'T12:00:00+07:00')) === false &&
    daysBetween(new Date(date + 'T12:00:00+07:00'), new Date()) > 7
  ) {
    errors.push({
      field: 'date',
      message: 'Cannot create override for dates older than 7 days.',
    });
  }

  return { valid: errors.length === 0, errors };
}

export function isValidShiftId(value: unknown): value is ShiftId {
  return typeof value === 'string' && Object.keys(SHIFTS).includes(value);
}
