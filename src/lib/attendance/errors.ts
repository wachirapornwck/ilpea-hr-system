// =============================================================================
// lib/attendance/errors.ts
// =============================================================================

import { ATTENDANCE_ERROR_CODES } from './constants';

type AttendanceErrorCode =
  (typeof ATTENDANCE_ERROR_CODES)[keyof typeof ATTENDANCE_ERROR_CODES];

export class AttendanceError extends Error {
  public readonly code: AttendanceErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: AttendanceErrorCode,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AttendanceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}

export class AlreadyClockedInError extends AttendanceError {
  constructor(date: string, shift: string) {
    super(
      `Already clocked in for ${shift} on ${date}.`,
      ATTENDANCE_ERROR_CODES.ALREADY_CLOCKED_IN,
      409,
      { date, shift }
    );
    this.name = 'AlreadyClockedInError';
  }
}

export class NotClockedInError extends AttendanceError {
  constructor(date: string) {
    super(
      `No clock-in record found for ${date}.`,
      ATTENDANCE_ERROR_CODES.NOT_CLOCKED_IN,
      400,
      { date }
    );
    this.name = 'NotClockedInError';
  }
}

export class AlreadyClockedOutError extends AttendanceError {
  constructor(date: string, clockOutTime: string) {
    super(
      `Already clocked out at ${clockOutTime} for ${date}.`,
      ATTENDANCE_ERROR_CODES.ALREADY_CLOCKED_OUT,
      409,
      { date, clockOutTime }
    );
    this.name = 'AlreadyClockedOutError';
  }
}

export class ClockOutBeforeClockInError extends AttendanceError {
  constructor(
    clockInTime: string,
    clockOutTime: string,
    isOvernightShift: boolean
  ) {
    super(
      isOvernightShift
        ? `Night shift: clock-out (${clockOutTime}) must be next day after clock-in (${clockInTime}).`
        : `Clock-out (${clockOutTime}) cannot be before clock-in (${clockInTime}).`,
      ATTENDANCE_ERROR_CODES.CLOCK_OUT_BEFORE_CLOCK_IN,
      400,
      { clockInTime, clockOutTime, isOvernightShift }
    );
    this.name = 'ClockOutBeforeClockInError';
  }
}

export class InvalidClockTimeError extends AttendanceError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      `Invalid clock time: ${reason}`,
      ATTENDANCE_ERROR_CODES.INVALID_CLOCK_TIME,
      400,
      details
    );
    this.name = 'InvalidClockTimeError';
  }
}

export class FutureDateError extends AttendanceError {
  constructor(date: string) {
    super(
      `Cannot clock in for future date: ${date}`,
      ATTENDANCE_ERROR_CODES.FUTURE_DATE,
      400,
      { date }
    );
    this.name = 'FutureDateError';
  }
}

export class ShiftTooLongError extends AttendanceError {
  constructor(shiftMinutes: number, maxMinutes: number) {
    super(
      `Shift duration (${Math.round(
        shiftMinutes / 60
      )}h) exceeds maximum (${Math.round(maxMinutes / 60)}h).`,
      ATTENDANCE_ERROR_CODES.SHIFT_TOO_LONG,
      400,
      { shiftMinutes, maxMinutes }
    );
    this.name = 'ShiftTooLongError';
  }
}

export class ShiftNotAssignedError extends AttendanceError {
  constructor(userId: string, date: string) {
    super(
      `No shift assigned for employee ${userId} on ${date}.`,
      ATTENDANCE_ERROR_CODES.SHIFT_NOT_ASSIGNED,
      400,
      { userId, date }
    );
    this.name = 'ShiftNotAssignedError';
  }
}

export class AmbiguousShiftError extends AttendanceError {
  constructor(timeStr: string, possibleShifts: string[]) {
    super(
      `Clock time ${timeStr} is ambiguous between: ${possibleShifts.join(
        ', '
      )}.`,
      ATTENDANCE_ERROR_CODES.AMBIGUOUS_SHIFT,
      422,
      { timeStr, possibleShifts }
    );
    this.name = 'AmbiguousShiftError';
  }
}

export class WhiteCollarNoClockError extends AttendanceError {
  constructor(userId: string) {
    super(
      `White collar employee ${userId} does not require clock in/out.`,
      ATTENDANCE_ERROR_CODES.WHITE_COLLAR_NO_CLOCK,
      400,
      { userId }
    );
    this.name = 'WhiteCollarNoClockError';
  }
}

export class AttendanceNotFoundError extends AttendanceError {
  constructor(userId: string, date: string) {
    super(
      `Attendance record not found for ${userId} on ${date}.`,
      ATTENDANCE_ERROR_CODES.ATTENDANCE_NOT_FOUND,
      404,
      { userId, date }
    );
    this.name = 'AttendanceNotFoundError';
  }
}

export class AttendanceEditExpiredError extends AttendanceError {
  constructor(date: string, maxDays: number) {
    super(
      `Cannot edit attendance for ${date}. Limit is ${maxDays} days.`,
      ATTENDANCE_ERROR_CODES.EDIT_EXPIRED,
      403,
      { date, maxDays }
    );
    this.name = 'AttendanceEditExpiredError';
  }
}

export class InvalidDateRangeError extends AttendanceError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      `Invalid date range: ${reason}`,
      ATTENDANCE_ERROR_CODES.INVALID_DATE_RANGE,
      400,
      details
    );
    this.name = 'InvalidDateRangeError';
  }
}

export class FirestoreAttendanceError extends AttendanceError {
  constructor(operation: string, originalError: unknown) {
    const message =
      originalError instanceof Error ? originalError.message : 'Unknown error';
    super(
      `Firestore ${operation} failed: ${message}`,
      ATTENDANCE_ERROR_CODES.FIRESTORE_ERROR,
      500,
      { operation }
    );
    this.name = 'FirestoreAttendanceError';
  }
}

export function isAttendanceError(error: unknown): error is AttendanceError {
  return error instanceof AttendanceError;
}
