// =============================================================================
// lib/attendance/types.ts
// =============================================================================

import type {
  ATTENDANCE_STATUS,
  SHIFTS,
  LEAVE_TYPES,
  HOLIDAY_TYPES,
  EMPLOYEE_TYPES,
  OVERRIDE_SCOPE,
  LeaveType,
  HolidayType,
  EmployeeType,
  OverrideScope,
  ShiftId,
} from './constants';

// -----------------------------------------------------------------------------
// Core Types
// -----------------------------------------------------------------------------
export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];
export type DayType = 'weekday' | 'weekend' | 'holiday';
export type AttendanceSource = 'employee' | 'manager' | 'hr' | 'system';

// ---------------------------------------------------------------------------
// C0.2: Locked future-architecture types — DECLARED ONLY, NOT WIRED.
// ห้าม wire เข้า runtime. dayType ที่ใช้จริงยังคงเป็น 'weekday'|'weekend'|'holiday'.
// ประกาศไว้เพื่อรองรับสถาปัตยกรรมที่ lock แล้ว (DayType/VerificationStatus เป็นคนละมิติ)
// ตั้งชื่อ CanonicalDayType เพื่อไม่ชนกับ DayType เดิมที่ยัง execute อยู่
// ---------------------------------------------------------------------------
export type CanonicalDayType = 'WORKDAY' | 'HOLIDAY' | 'LEAVE' | 'COMPENSATE';
export type VerificationStatus = 'UNVERIFIED' | 'ADJUSTED' | 'VERIFIED';

export type { ShiftId, LeaveType, HolidayType, EmployeeType, OverrideScope };

// -----------------------------------------------------------------------------
// Shift Override
// HR สามารถ override เวลาทำงานได้ทุกระดับ (company/dept/team/individual)
// Priority: individual > team > department > company > standard shift
// -----------------------------------------------------------------------------
export interface ShiftOverride {
  id: string;
  /** ขอบเขตที่ override */
  scope: OverrideScope;
  /** ใช้ตาม scope: companyId / departmentId / teamId / userId */
  scopeId: string;
  date: string; // "YYYY-MM-DD" วันที่ override มีผล
  /** เวลาเริ่มงานใหม่ "HH:MM" */
  startTime: string;
  /** เวลาเลิกงานใหม่ "HH:MM" */
  endTime: string;
  /** ข้ามคืนไหม (เช่น override กะดึกให้เลิกเร็วขึ้น) */
  isOvernight: boolean;
  reason: string;
  createdBy: string; // userId ของ HR
  createdAt: Date;
  updatedAt: Date;
}

// -----------------------------------------------------------------------------
// Effective Shift (ผลลัพธ์หลัง resolve standard + override)
// ทุก calculation ต้องใช้ EffectiveShift ไม่ใช่ SHIFTS โดยตรง
// -----------------------------------------------------------------------------
export interface EffectiveShift {
  shiftId: ShiftId;
  /** เวลาเริ่มงานจริง (นาทีนับจาก 00:00) */
  startTotalMinutes: number;
  /** เวลาเลิกงานจริง (นาทีนับจาก 00:00 ของวัน shift เริ่ม) */
  endTotalMinutes: number;
  isOvernight: boolean;
  /** มาจาก override หรือ standard shift */
  source: 'override' | 'standard';
  overrideId?: string;
  /** ชั่วโมงงานปกติหลังหัก unpaid break */
  regularWorkMinutes: number;
}

// -----------------------------------------------------------------------------
// Attendance Record (Firestore: attendance/{userId}_{YYYY-MM-DD})
// -----------------------------------------------------------------------------
export interface AttendanceRecord {
  id: string;
  userId: string;
  /**
   * C0.2: optional — รองรับ canonical architecture (business identity).
   * optional โดยเจตนา — ห้าม backfill/migrate Firestore; existing records
   * ที่ไม่มี field นี้ยังถูกต้องตาม type เดิม และ write path ไม่ต้องเปลี่ยน
   */
  employeeId?: string;
  date: string; // "YYYY-MM-DD" วันที่ shift เริ่ม
  shiftId: ShiftId;
  /** effective shift ที่ใช้คำนวณ (อาจถูก override) */
  effectiveShift: EffectiveShift;

  clockInTime: Date | null;
  clockOutTime: Date | null;

  status: AttendanceStatus;
  dayType: DayType;

  lateMinutes: number;
  earlyLeaveMinutes: number;
  workingMinutes: number; // นาทีงานจริง (หัก unpaid break)
  workingHours: number; // ทศนิยม เช่น 8.0
  overtimeMinutes: number; // 0 ถ้าไม่ถึง threshold 30 นาที
  overtimeMultiplier: number;

  /** ค่ากะ (บาท) — 0 ถ้าไม่ใช่กะดึก */
  shiftAllowance: number;
  /** ค่าอาหาร OT (บาท) — 0 ถ้าไม่ได้ทำ OT */
  otMealAllowance: number;

  note: string | null;
  source: AttendanceSource;
  lastModifiedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// -----------------------------------------------------------------------------
// Attendance Adjustment (Audit Trail)
// ห้ามเขียนทับ record เดิม — เก็บทุก adjustment แยก
// Firestore: attendanceAdjustments/{adjustmentId}
// -----------------------------------------------------------------------------
export interface AttendanceAdjustment {
  id: string;
  attendanceId: string; // ref ไปยัง attendance document
  userId: string;
  date: string;

  /** ข้อมูลเดิมก่อนแก้ไข */
  originalValues: {
    clockInTime: Date | null;
    clockOutTime: Date | null;
    shiftStart?: string;
    shiftEnd?: string;
    status: AttendanceStatus;
  };

  /** ข้อมูลใหม่หลังแก้ไข */
  adjustedValues: {
    clockInTime: Date | null;
    clockOutTime: Date | null;
    shiftStart?: string;
    shiftEnd?: string;
    status?: AttendanceStatus;
  };

  reason: string; // บังคับ
  comment: string; // บังคับ
  adjustedBy: string; // userId ของ HR
  adjustedAt: Date;
}

// -----------------------------------------------------------------------------
// Audit Log (Firestore: auditLogs/{logId})
// ทุก HR action สำคัญต้อง log — ลบไม่ได้
// -----------------------------------------------------------------------------
export interface AuditLog {
  id: string;
  action: AuditAction;
  userId: string; // ผู้ทำ action
  targetId: string; // document ที่ถูกกระทำ
  targetType: string; // 'attendance' | 'shiftOverride' | 'holiday' | etc.
  previousValue: unknown;
  newValue: unknown;
  reason?: string;
  timestamp: Date;
}

export type AuditAction =
  | 'attendance_adjustment'
  | 'shift_override_created'
  | 'shift_override_modified'
  | 'holiday_created'
  | 'holiday_modified'
  | 'employee_status_changed'
  | 'warning_generated'
  | 'hr_approval'
  | 'leave_approved'
  | 'leave_rejected'
  | 'payroll_generated';

// -----------------------------------------------------------------------------
// Late Record & Warning Letter
// -----------------------------------------------------------------------------

/**
 * LateRecord — บันทึกทุกครั้งที่พนักงานมาสาย
 * Firestore: lateRecords/{userId}_{date}
 */
export interface LateRecord {
  id: string;
  userId: string;
  date: string;
  lateMinutes: number;
  attendanceId: string; // ref ไปยัง attendance document
  /** ครั้งที่เท่าไหร่ในรอบปัจจุบัน (1, 2, 3 → reset) */
  countInCycle: number;
  /** รอบที่เท่าไหร่ (warning ครั้งที่เท่าไหร่) */
  warningCycle: number;
  createdAt: Date;
}

/**
 * WarningLetter — สร้างอัตโนมัติทุก 3 ครั้งที่สาย
 * Firestore: warningLetters/{letterId}
 */
export interface WarningLetter {
  id: string;
  userId: string;
  /** warning ฉบับที่เท่าไหร่ */
  warningNumber: number;
  /** late records 3 รายการที่ trigger warning นี้ */
  lateRecordIds: string[];
  /** ช่วงวันที่ที่สาย */
  periodStart: string;
  periodEnd: string;
  issuedAt: Date;
  issuedBy: string; // 'system' หรือ userId ของ HR
  /** HR รับทราบแล้วหรือยัง */
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

// -----------------------------------------------------------------------------
// Holiday
// -----------------------------------------------------------------------------
export interface Holiday {
  id: string;
  date: string; // "YYYY-MM-DD"
  name: string;
  nameEN?: string;
  type: HolidayType;
  /** ใช้กับทั้งบริษัทหรือแค่บางแผนก */
  scope: 'company' | 'department';
  departmentIds?: string[];
  createdBy: string;
  createdAt: Date;
}

// -----------------------------------------------------------------------------
// Shift Assignment
// -----------------------------------------------------------------------------
export interface ShiftAssignment {
  id: string;
  userId: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string | null; // null = จนกว่าจะเปลี่ยน
  shiftId: ShiftId;
  assignedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// -----------------------------------------------------------------------------
// Payroll Settings (Firestore: payrollSettings/{settingId})
// HR แก้ไขได้ผ่าน UI ไม่ต้องแตะ code
// -----------------------------------------------------------------------------
export interface PayrollSettings {
  id: string;
  /** Blue Collar fixed allowances */
  blueCollar: {
    diligenceAllowance: number; // เบี้ยขยัน
    housingAllowance: number; // ที่พัก
    mealAllowance: number; // อาหาร
    transportationAllowance: number; // เดินทาง
    shiftNightAllowance: number; // ค่ากะดึก (ต่อวัน)
    otMealAllowance: number; // ค่าอาหาร OT (ต่อวัน)
  };
  /** White Collar fixed allowances */
  whiteCollar: {
    housingAllowance: number; // ที่พัก
    phoneAllowance: number; // ค่าโทรศัพท์
  };
  /** OT Rules */
  ot: {
    minimumMinutes: number; // ต้องเกินกี่นาทีถึงได้ OT
    maxMinutesPerDay: number; // OT สูงสุดต่อวัน
    weekdayRate: number; // 1.5
    holidayRegularRate: number; // 1.0
    holidayOtRate: number; // 3.0
  };
  socialSecurityRate: number; // 0.05
  socialSecurityMinBase: number; // 1650
  socialSecurityMaxBase: number; // 17500
  effectiveDate: string; // "YYYY-MM-DD" วันที่มีผล
  updatedBy: string;
  updatedAt: Date;
}

// -----------------------------------------------------------------------------
// Position Allowances (Firestore: positionAllowances/{positionId})
// allowances ที่ต่างกันตาม position — HR แก้ได้ผ่าน UI
// -----------------------------------------------------------------------------
export interface PositionAllowances {
  positionId: string;
  positionName: string;
  employeeType: EmployeeType;
  allowances: Record<string, number>; // key = allowance name, value = amount
  updatedBy: string;
  updatedAt: Date;
}

// -----------------------------------------------------------------------------
// Input Payloads
// -----------------------------------------------------------------------------
export interface ClockInPayload {
  userId: string;
  shiftId: ShiftId;
  clockInTime?: Date;
}

export interface ClockOutPayload {
  userId: string;
  clockOutTime?: Date;
}

export interface ManualAttendancePayload {
  userId: string;
  date: string;
  shiftId: ShiftId;
  clockInTime: Date;
  clockOutTime: Date;
  reason: string; // บังคับ
  comment: string; // บังคับ
  modifiedBy: string;
}

// -----------------------------------------------------------------------------
// Calculation Results
// -----------------------------------------------------------------------------
export interface WorkingHoursResult {
  grossMinutes: number; // นาทีดิบ (ก่อนหักพัก)
  unpaidBreakMinutes: number; // หักออก (lunch เท่านั้น)
  workingMinutes: number; // งานจริง = gross - unpaid
  workingHours: number; // ทศนิยม 2 ตำแหน่ง
  regularMinutes: number; // min(working, regular_work)
  overtimeMinutes: number; // นาที OT หลัง threshold (0 ถ้าไม่ถึง 30 นาที)
  otQualified: boolean; // ผ่าน threshold 30 นาทีไหม
}

export interface OTResult {
  otQualified: boolean; // เกิน 30 นาทีไหม
  rawOtMinutes: number; // OT จริงก่อน cap
  cappedOtMinutes: number; // OT หลัง cap 3 ชม.
  multiplier: number;
  dayType: DayType;
  /** สำหรับวันหยุด แบ่งเป็น 2 ช่วง */
  holidayRegularMinutes?: number; // ช่วงเวลางานปกติ (× 1.0)
  holidayOtMinutes?: number; // ช่วง OT (× 3.0)
}

export interface LatenessResult {
  isLate: boolean;
  lateMinutes: number;
  clockInTimeFormatted: string;
}

export interface EarlyLeaveResult {
  isEarlyLeave: boolean;
  earlyLeaveMinutes: number;
  clockOutTimeFormatted: string;
}

export interface AttendanceCalculationResult {
  status: AttendanceStatus;
  dayType: DayType;
  effectiveShift: EffectiveShift;
  lateness: LatenessResult;
  earlyLeave: EarlyLeaveResult;
  workingHours: WorkingHoursResult;
  ot: OTResult;
  shiftAllowance: number;
  otMealAllowance: number;
}

// -----------------------------------------------------------------------------
// Summary & Reports
// -----------------------------------------------------------------------------
export interface AttendanceSummary {
  userId: string;
  year: number;
  month: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  leaveDays: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  totalWorkingHours: number;
  /** เบี้ยขยันได้หรือไม่ในเดือนนี้ */
  diligenceAllowanceEarned: boolean;
  byShift: Record<ShiftId, { days: number; overtimeMinutes: number }>;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

// -----------------------------------------------------------------------------
// Query
// -----------------------------------------------------------------------------
export interface AttendanceQueryFilter {
  userId?: string;
  departmentId?: string;
  startDate: string;
  endDate: string;
  status?: AttendanceStatus;
  shiftId?: ShiftId;
}

export interface AttendanceQueryResult {
  records: AttendanceRecord[];
  total: number;
}

// -----------------------------------------------------------------------------
// Team Attendance Summary (daily snapshot — ต่างจาก AttendanceSummary รายเดือน)
// -----------------------------------------------------------------------------
export interface TeamAttendanceSummary {
  date: string;
  departmentId: string;
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  records: AttendanceRecord[];
}
