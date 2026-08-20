// =============================================================================
// lib/attendance/calculators.ts
// =============================================================================
// Business Logic: Late, Working Hours, OT, Early Leave
//
// Key Rules:
// 1. Paid breaks (10 นาที × 2) ไม่หัก — นับเป็นเวลางาน
// 2. Unpaid break (lunch 60 นาที) หักออก
// 3. OT ต้องเกิน 30 นาที ถึงจะนับ — ถ้าไม่ถึง = 0
// 4. OT สูงสุด 3 ชั่วโมง/วัน
// 5. ทุก calculation ใช้ EffectiveShift (อาจถูก override) ไม่ใช่ SHIFTS โดยตรง
// 6. วันหยุด แบ่ง 2 ช่วง: ช่วงงานปกติ (×1) และช่วง OT (×3)
// =============================================================================

import {
  SHIFTS,
  GRACE_PERIOD,
  OT_RULES,
  ATTENDANCE_STATUS,
  ATTENDANCE_LIMITS,
  DEFAULT_ALLOWANCES,
  type ShiftId,
  type BreakPeriod,
} from './constants';
import {
  toShiftRelativeMinutes,
  isNextDayFromShift,
  toTimeString,
} from './dateUtils';
import type {
  DayType,
  AttendanceStatus,
  EffectiveShift,
  WorkingHoursResult,
  OTResult,
  LatenessResult,
  EarlyLeaveResult,
  AttendanceCalculationResult,
} from './types';

// =============================================================================
// SECTION 1: Effective Shift Resolution
// Priority: Shift Override > Standard Shift
// =============================================================================

/**
 * สร้าง EffectiveShift จาก standard shift (ไม่มี override)
 */
export function buildEffectiveShift(shiftId: ShiftId): EffectiveShift {
  const shift = SHIFTS[shiftId];
  return {
    shiftId,
    startTotalMinutes: shift.START_TOTAL_MINUTES,
    endTotalMinutes: shift.END_TOTAL_MINUTES,
    isOvernight: shift.IS_OVERNIGHT,
    source: 'standard',
    regularWorkMinutes: shift.REGULAR_WORK_MINUTES,
  };
}

/**
 * สร้าง EffectiveShift จาก override
 * HR กำหนด startTime/endTime ใหม่ — ยังคงใช้ break ของ shift เดิม
 *
 * @param shiftId     กะเดิม (ใช้ดู breaks)
 * @param startTime   "HH:MM" เวลาเริ่มใหม่
 * @param endTime     "HH:MM" เวลาเลิกใหม่
 * @param isOvernight ข้ามคืนไหม
 * @param overrideId  document ID ของ override
 */
export function buildOverrideEffectiveShift(
  shiftId: ShiftId,
  startTime: string,
  endTime: string,
  isOvernight: boolean,
  overrideId: string
): EffectiveShift {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startTotal = sh * 60 + sm;
  const endTotal = isOvernight ? 24 * 60 + eh * 60 + em : eh * 60 + em;

  // คำนวณ regularWorkMinutes ใหม่ตาม override (หัก unpaid break 60 นาทีเสมอ)
  const grossMinutes = endTotal - startTotal;
  const regularWorkMinutes = Math.max(0, grossMinutes - 60);

  return {
    shiftId,
    startTotalMinutes: startTotal,
    endTotalMinutes: endTotal,
    isOvernight,
    source: 'override',
    overrideId,
    regularWorkMinutes,
  };
}

// =============================================================================
// SECTION 2: Break Deduction (Unpaid Only)
// =============================================================================

/**
 * คำนวณนาทีพักที่ต้องหักออก (เฉพาะ unpaid breaks)
 * paid breaks ไม่หัก — นับเป็นเวลางาน
 *
 * ใช้ overlap calculation:
 *   overlap = max(0, min(workEnd, breakEnd) - max(workStart, breakStart))
 *
 * @param clockInRel   นาทีนับจาก effective shift start ของ clock in
 * @param clockOutRel  นาทีนับจาก effective shift start ของ clock out
 * @param breaks       BREAKS ของกะนั้น
 * @param shiftStartMinutes  START_TOTAL_MINUTES ของกะ (ใช้ convert break periods)
 */
export function calculateUnpaidBreakDeduction(
  clockInRel: number,
  clockOutRel: number,
  breaks: readonly BreakPeriod[],
  shiftStartMinutes: number
): number {
  let totalDeducted = 0;
  for (const bp of breaks) {
    if (bp.isPaid) continue; // ✅ paid break — ข้ามไป ไม่หัก
    const bpStartRel = bp.startMinutes - shiftStartMinutes;
    const bpEndRel = bp.endMinutes - shiftStartMinutes;
    const overlap = Math.max(
      0,
      Math.min(clockOutRel, bpEndRel) - Math.max(clockInRel, bpStartRel)
    );
    totalDeducted += overlap;
  }
  return totalDeducted;
}

// =============================================================================
// SECTION 3: Lateness
// =============================================================================

/**
 * คำนวณการมาสาย
 *
 * Rules:
 * - Holiday → ไม่มี late (ทุกนาทีเป็น OT)
 * - clock in ≤ effective start + grace (15 นาที) → late = 0
 * - clock in > effective start + grace → late = clockInRel (นับจาก shift start)
 */
export function calculateLateness(
  clockIn: Date,
  shiftId: ShiftId,
  shiftDate: string,
  effectiveShift: EffectiveShift,
  isHoliday: boolean
): LatenessResult {
  const clockInTimeStr = toTimeString(clockIn);
  if (isHoliday)
    return {
      isLate: false,
      lateMinutes: 0,
      clockInTimeFormatted: clockInTimeStr,
    };

  const isNextDay = effectiveShift.isOvernight
    ? isNextDayFromShift(clockIn, shiftDate)
    : false;
  const clockInRel = toShiftRelativeMinutes(clockIn, shiftId, isNextDay);

  // adjust สำหรับ override (shift start อาจต่างจาก SHIFTS[shiftId].START)
  const adjustedClockInRel =
    clockInRel +
    (SHIFTS[shiftId].START_TOTAL_MINUTES - effectiveShift.startTotalMinutes);

  if (adjustedClockInRel <= GRACE_PERIOD.LATE_MINUTES) {
    return {
      isLate: false,
      lateMinutes: 0,
      clockInTimeFormatted: clockInTimeStr,
    };
  }

  return {
    isLate: true,
    lateMinutes: adjustedClockInRel,
    clockInTimeFormatted: clockInTimeStr,
  };
}

// =============================================================================
// SECTION 4: Working Hours
// =============================================================================

/**
 * คำนวณชั่วโมงทำงาน — หัก unpaid break อัตโนมัติ
 *
 * @param clockIn        Date ของ clock in
 * @param clockOut       Date ของ clock out
 * @param shiftId        กะที่ทำงาน
 * @param shiftDate      "YYYY-MM-DD" วันที่ shift เริ่ม
 * @param effectiveShift ผลลัพธ์หลัง resolve override
 */
export function calculateWorkingHours(
  clockIn: Date,
  clockOut: Date,
  shiftId: ShiftId,
  shiftDate: string,
  effectiveShift: EffectiveShift
): WorkingHoursResult {
  const shift = SHIFTS[shiftId];

  const clockInIsNextDay = effectiveShift.isOvernight
    ? isNextDayFromShift(clockIn, shiftDate)
    : false;
  const clockOutIsNextDay = effectiveShift.isOvernight
    ? isNextDayFromShift(clockOut, shiftDate)
    : false;

  const clockInRel = toShiftRelativeMinutes(clockIn, shiftId, clockInIsNextDay);
  const clockOutRel = toShiftRelativeMinutes(
    clockOut,
    shiftId,
    clockOutIsNextDay
  );

  // ระยะเวลาดิบ (ก่อนหักพัก)
  const grossMinutes = Math.max(0, clockOutRel - clockInRel);

  // หักเฉพาะ unpaid breaks
  const unpaidBreakMinutes = calculateUnpaidBreakDeduction(
    clockInRel,
    clockOutRel,
    shift.BREAKS,
    shift.START_TOTAL_MINUTES
  );

  const workingMinutes = Math.max(0, grossMinutes - unpaidBreakMinutes);
  const regularMinutes = Math.min(
    workingMinutes,
    effectiveShift.regularWorkMinutes
  );
  const rawOtMinutes = Math.max(
    0,
    workingMinutes - effectiveShift.regularWorkMinutes
  );

  // OT threshold: ต้องเกิน 30 นาที
  const otQualified = rawOtMinutes > OT_RULES.MINIMUM_MINUTES;
  const overtimeMinutes = otQualified
    ? Math.min(rawOtMinutes, OT_RULES.MAX_MINUTES)
    : 0;

  return {
    grossMinutes,
    unpaidBreakMinutes,
    workingMinutes,
    workingHours: Math.round((workingMinutes / 60) * 100) / 100,
    regularMinutes,
    overtimeMinutes,
    otQualified,
  };
}

// =============================================================================
// SECTION 5: OT Calculation
// =============================================================================

/**
 * คำนวณ OT และ rate
 *
 * วันธรรมดา:
 *   - OT หลังเลิกกะ ×1.5
 *   - ต้องเกิน 30 นาทีก่อน ถึงนับ
 *
 * วันหยุด:
 *   - ช่วงเวลางานปกติ (อยู่ใน regular work hours): ×1 บวกเพิ่ม
 *   - ช่วง OT (เกิน regular work hours): ×3 บวกเพิ่ม
 *   - ช่วง OT ก็ต้องเกิน 30 นาทีก่อน ถึงนับ ×3
 */
export function calculateOT(
  workingHours: WorkingHoursResult,
  dayType: DayType,
  effectiveShift: EffectiveShift
): OTResult {
  if (dayType === 'weekday') {
    return {
      otQualified: workingHours.otQualified,
      rawOtMinutes: Math.max(
        0,
        workingHours.workingMinutes - effectiveShift.regularWorkMinutes
      ),
      cappedOtMinutes: workingHours.overtimeMinutes,
      multiplier: OT_RULES.RATES.WEEKDAY,
      dayType,
    };
  }

  if (dayType === 'weekend' || dayType === 'holiday') {
    // ช่วงงานปกติ: นาทีที่ทำอยู่ใน regular work hours
    const holidayRegularMinutes = workingHours.regularMinutes;

    // ช่วง OT: นาทีที่เกิน regular (ต้องเกิน 30 นาที)
    const rawHolidayOt = Math.max(
      0,
      workingHours.workingMinutes - effectiveShift.regularWorkMinutes
    );
    const otQualified = rawHolidayOt > OT_RULES.MINIMUM_MINUTES;
    const cappedHolidayOt = otQualified
      ? Math.min(rawHolidayOt, OT_RULES.MAX_MINUTES)
      : 0;

    return {
      otQualified,
      rawOtMinutes: rawHolidayOt,
      cappedOtMinutes: holidayRegularMinutes + cappedHolidayOt, // รวมทั้งสองช่วง
      multiplier: OT_RULES.RATES.HOLIDAY_OT,
      dayType,
      holidayRegularMinutes,
      holidayOtMinutes: cappedHolidayOt,
    };
  }

  return {
    otQualified: false,
    rawOtMinutes: 0,
    cappedOtMinutes: 0,
    multiplier: 1,
    dayType,
  };
}

// =============================================================================
// SECTION 6: Early Leave
// =============================================================================

/**
 * คำนวณการออกก่อนเวลา
 * ใช้ effective shift end time (อาจถูก override)
 */
export function calculateEarlyLeave(
  clockOut: Date,
  shiftId: ShiftId,
  shiftDate: string,
  effectiveShift: EffectiveShift,
  dayType: DayType
): EarlyLeaveResult {
  const clockOutStr = toTimeString(clockOut);
  if (dayType === 'holiday' || dayType === 'weekend') {
    return {
      isEarlyLeave: false,
      earlyLeaveMinutes: 0,
      clockOutTimeFormatted: clockOutStr,
    };
  }

  const clockOutIsNextDay = effectiveShift.isOvernight
    ? isNextDayFromShift(clockOut, shiftDate)
    : false;
  const clockOutRel = toShiftRelativeMinutes(
    clockOut,
    shiftId,
    clockOutIsNextDay
  );

  // effective shift end relative to shift start
  const shiftEndRel =
    effectiveShift.endTotalMinutes - effectiveShift.startTotalMinutes;
  const graceBoundary = shiftEndRel - GRACE_PERIOD.EARLY_LEAVE_MINUTES;

  if (clockOutRel >= graceBoundary) {
    return {
      isEarlyLeave: false,
      earlyLeaveMinutes: 0,
      clockOutTimeFormatted: clockOutStr,
    };
  }

  return {
    isEarlyLeave: true,
    earlyLeaveMinutes: shiftEndRel - clockOutRel,
    clockOutTimeFormatted: clockOutStr,
  };
}

// =============================================================================
// SECTION 7: Day Type
// =============================================================================

export function getDayType(date: Date, isHoliday: boolean): DayType {
  if (isHoliday) return 'holiday';
  const dow = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
  }).format(date);
  return dow === 'Sat' || dow === 'Sun' ? 'weekend' : 'weekday';
}

// =============================================================================
// SECTION 8: Status
// =============================================================================

export function determineAttendanceStatus(
  lateness: LatenessResult,
  earlyLeave: EarlyLeaveResult,
  dayType: DayType,
  hasClockedIn: boolean,
  isOnLeave: boolean
): AttendanceStatus {
  if (dayType === 'holiday') return ATTENDANCE_STATUS.HOLIDAY;
  if (isOnLeave) return ATTENDANCE_STATUS.ON_LEAVE;
  if (dayType === 'weekend') return ATTENDANCE_STATUS.WEEKEND;
  if (!hasClockedIn) return ATTENDANCE_STATUS.ABSENT;
  if (lateness.isLate && earlyLeave.isEarlyLeave)
    return ATTENDANCE_STATUS.LATE_AND_EARLY_LEAVE;
  if (lateness.isLate) return ATTENDANCE_STATUS.LATE;
  if (earlyLeave.isEarlyLeave) return ATTENDANCE_STATUS.EARLY_LEAVE;
  return ATTENDANCE_STATUS.PRESENT;
}

// =============================================================================
// SECTION 9: Main Calculator (Entry Point)
// =============================================================================

/**
 * คำนวณทุกอย่างในครั้งเดียว
 *
 * @param clockIn        Date ของ clock in
 * @param clockOut       Date ของ clock out
 * @param shiftId        กะที่ทำงาน
 * @param shiftDate      "YYYY-MM-DD" วันที่ shift เริ่ม
 * @param effectiveShift ผลลัพธ์หลัง resolve override (ถ้ามี)
 * @param isHoliday      วันหยุดนักขัตฤกษ์หรือไม่
 * @param isOnLeave      พนักงานลาอยู่หรือไม่
 *
 * @example
 * // กะเช้า วันธรรมดา clock in 08:05, clock out 18:40
 * const result = calculateAttendance(clockIn, clockOut, 'DAY', '2024-06-24', effectiveShift, false, false)
 * result.lateness.isLate        // false (5 นาที ≤ grace 15 นาที)
 * result.ot.otQualified         // true (OT 100 นาที > threshold 30 นาที)
 * result.ot.cappedOtMinutes     // 100 นาที
 */
export function calculateAttendance(
  clockIn: Date,
  clockOut: Date,
  shiftId: ShiftId,
  shiftDate: string,
  effectiveShift: EffectiveShift,
  isHoliday: boolean,
  isOnLeave: boolean = false
): AttendanceCalculationResult {
  const dayType = getDayType(
    new Date(shiftDate + 'T12:00:00+07:00'),
    isHoliday
  );
  const lateness = calculateLateness(
    clockIn,
    shiftId,
    shiftDate,
    effectiveShift,
    isHoliday
  );
  const workHours = calculateWorkingHours(
    clockIn,
    clockOut,
    shiftId,
    shiftDate,
    effectiveShift
  );
  const ot = calculateOT(workHours, dayType, effectiveShift);
  const earlyLeave = calculateEarlyLeave(
    clockOut,
    shiftId,
    shiftDate,
    effectiveShift,
    dayType
  );
  const status = determineAttendanceStatus(
    lateness,
    earlyLeave,
    dayType,
    true,
    isOnLeave
  );

  // Allowances
  const shiftAllowance =
    shiftId === 'NIGHT' && dayType !== 'holiday'
      ? DEFAULT_ALLOWANCES.BLUE_COLLAR.SHIFT_NIGHT
      : 0;
  const otMealAllowance = ot.otQualified
    ? DEFAULT_ALLOWANCES.BLUE_COLLAR.OT_MEAL
    : 0;

  return {
    status,
    dayType,
    effectiveShift,
    lateness,
    earlyLeave,
    workingHours: workHours,
    ot,
    shiftAllowance,
    otMealAllowance,
  };
}

// =============================================================================
// SECTION 10: OT Pay Calculation
// =============================================================================

/**
 * คำนวณเงิน OT จาก result
 * ใช้ใน payroll calculation
 *
 * @param salary      เงินเดือน (fix pay เท่านั้น)
 * @param otResult    ผลจาก calculateOT
 *
 * @example
 * // เงินเดือน 12,000, OT วันธรรมดา 1.5 ชม.
 * calculateOTPay(12000, otResult) // 12000÷30÷8×1.5×1.5 = 112.50
 */
export function calculateOTPay(salary: number, otResult: OTResult): number {
  const hourlyRate = salary / 30 / 8;

  if (!otResult.otQualified) return 0;

  if (otResult.dayType === 'holiday') {
    // ช่วงงานปกติ: ×1 บวกเพิ่ม
    const regularPay =
      ((otResult.holidayRegularMinutes ?? 0) / 60) *
      hourlyRate *
      OT_RULES.RATES.HOLIDAY_REGULAR;
    // ช่วง OT: ×3 บวกเพิ่ม
    const otPay =
      ((otResult.holidayOtMinutes ?? 0) / 60) *
      hourlyRate *
      OT_RULES.RATES.HOLIDAY_OT;
    return Math.round((regularPay + otPay) * 100) / 100;
  }

  // Weekday/Weekend OT: ×1.5
  return (
    Math.round(
      (otResult.cappedOtMinutes / 60) *
        hourlyRate *
        OT_RULES.RATES.WEEKDAY *
        100
    ) / 100
  );
}

// =============================================================================
// SECTION 11: Monthly Helpers
// =============================================================================

/**
 * นับจำนวนวันทำงานปกติในเดือน (ไม่รวม weekend + holiday)
 */
export function countWorkingDaysInMonth(
  year: number,
  month: number,
  holidays: string[]
): number {
  const holidaySet = new Set(holidays);
  const lastDay = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
      d
    ).padStart(2, '0')}`;
    const dow = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      weekday: 'short',
    }).format(new Date(dateStr + 'T12:00:00+07:00'));
    if (dow !== 'Sat' && dow !== 'Sun' && !holidaySet.has(dateStr)) count++;
  }
  return count;
}

/**
 * ตรวจสอบว่าเดือนนี้ได้เบี้ยขยันไหม
 *
 * เงื่อนไขได้เบี้ยขยัน:
 * - ไม่มาสายเลย
 * - ไม่ขาดงานเลย
 * - ไม่มีการลาประเภทที่ทำให้หายเบี้ยขยัน
 */
export function checkDiligenceAllowance(
  hasLate: boolean,
  hasAbsent: boolean,
  hasLeaveLosingDiligence: boolean
): boolean {
  return !hasLate && !hasAbsent && !hasLeaveLosingDiligence;
}
