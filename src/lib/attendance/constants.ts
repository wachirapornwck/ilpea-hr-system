// =============================================================================
// lib/attendance/constants.ts
// =============================================================================
// ILPEA Thailand — Attendance Constants
//
// กะเช้า  : 08:00–17:00 (พัก paid 2 ช่วง + lunch 60 นาที) งานจริง 480 นาที ✅
// กะดึก   : 20:00–05:00 (พัก paid 2 ช่วง + lunch 60 นาที) งานจริง 480 นาที ✅
// กะแม่บ้าน: 07:00–16:00 (พักกลางวัน 60 นาที เท่านั้น)   งานจริง 480 นาที ✅
// =============================================================================

export const TIMEZONE = 'Asia/Bangkok';

// -----------------------------------------------------------------------------
// Break Period Type
// startMinutes/endMinutes = นาทีนับจาก 00:00 ของวันที่ shift เริ่ม
// กะดึก: ค่า > 1440 = ข้ามเที่ยงคืนไปวันถัดไป
// -----------------------------------------------------------------------------
export interface BreakPeriod {
  label: string;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  /** true = นับเป็นเวลางาน ไม่หักออก */
  isPaid: boolean;
}

// -----------------------------------------------------------------------------
// Shift Definitions
// -----------------------------------------------------------------------------
export const SHIFTS = {
  // ---------------------------------------------------------------------------
  // กะเช้า 08:00–17:00
  // ---------------------------------------------------------------------------
  DAY: {
    id: 'DAY' as const,
    label: 'กะเช้า',
    labelEN: 'Day Shift',

    START_HOUR: 8,
    START_MINUTE: 0,
    START_TOTAL_MINUTES: 8 * 60, // 480

    END_HOUR: 17,
    END_MINUTE: 0,
    END_TOTAL_MINUTES: 17 * 60, // 1020

    IS_OVERNIGHT: false as const,

    BREAKS: [
      {
        label: 'พักเช้า',
        startMinutes: 10 * 60, // 600  (10:00)
        endMinutes: 10 * 60 + 10, // 610  (10:10)
        durationMinutes: 10,
        isPaid: true, // ✅ ไม่หัก
      },
      {
        label: 'พักกลางวัน',
        startMinutes: 12 * 60, // 720  (12:00)
        endMinutes: 13 * 60, // 780  (13:00)
        durationMinutes: 60,
        isPaid: false, // ❌ หักออก
      },
      {
        label: 'พักบ่าย',
        startMinutes: 15 * 60, // 900  (15:00)
        endMinutes: 15 * 60 + 10, // 910  (15:10)
        durationMinutes: 10,
        isPaid: true, // ✅ ไม่หัก
      },
    ] as BreakPeriod[],

    /** รวม unpaid break เท่านั้น = 60 นาที */
    UNPAID_BREAK_MINUTES: 60,

    /** งานจริงต่อวัน: (17:00−08:00) − 60 = 480 นาที = 8 ชม. */
    REGULAR_WORK_MINUTES: 17 * 60 - 8 * 60 - 60, // 480
  },

  // ---------------------------------------------------------------------------
  // กะดึก 20:00–05:00 (ข้ามคืน +1 วัน)
  // ---------------------------------------------------------------------------
  NIGHT: {
    id: 'NIGHT' as const,
    label: 'กะดึก',
    labelEN: 'Night Shift',

    START_HOUR: 20,
    START_MINUTE: 0,
    START_TOTAL_MINUTES: 20 * 60, // 1200

    END_HOUR: 5,
    END_MINUTE: 0,
    /** 05:00 วันถัดไป = 24*60 + 5*60 = 1740 */
    END_TOTAL_MINUTES: 24 * 60 + 5 * 60, // 1740

    IS_OVERNIGHT: true as const,

    BREAKS: [
      {
        label: 'พักดึก',
        startMinutes: 22 * 60, // 1320 (22:00)
        endMinutes: 22 * 60 + 10, // 1330 (22:10)
        durationMinutes: 10,
        isPaid: true, // ✅ ไม่หัก
      },
      {
        label: 'พักกลางคืน',
        startMinutes: 24 * 60, // 1440 (00:00 +1 วัน)
        endMinutes: 24 * 60 + 60, // 1500 (01:00 +1 วัน)
        durationMinutes: 60,
        isPaid: false, // ❌ หักออก
      },
      {
        label: 'พักเช้ามืด',
        startMinutes: 24 * 60 + 3 * 60, // 1620 (03:00 +1 วัน)
        endMinutes: 24 * 60 + 3 * 60 + 10, // 1630 (03:10 +1 วัน)
        durationMinutes: 10,
        isPaid: true, // ✅ ไม่หัก
      },
    ] as BreakPeriod[],

    /** รวม unpaid break เท่านั้น = 60 นาที */
    UNPAID_BREAK_MINUTES: 60,

    /** งานจริงต่อวัน: (1740−1200) − 60 = 480 นาที = 8 ชม. */
    REGULAR_WORK_MINUTES: 24 * 60 + 5 * 60 - 20 * 60 - 60, // 480
  },

  // ---------------------------------------------------------------------------
  // กะแม่บ้าน 07:00–16:00
  // พักกลางวันเท่านั้น (ไม่มี paid break เช้า/บ่าย)
  // งานจริง: (16:00−07:00) − 60 = 540 − 60 = 480 นาที = 8 ชม. ✅
  // ---------------------------------------------------------------------------
  MAID: {
    id: 'MAID' as const,
    label: 'กะแม่บ้าน',
    labelEN: 'Maid Shift',

    START_HOUR: 7,
    START_MINUTE: 0,
    START_TOTAL_MINUTES: 7 * 60, // 420

    END_HOUR: 16,
    END_MINUTE: 0,
    END_TOTAL_MINUTES: 16 * 60, // 960

    IS_OVERNIGHT: false as const,

    BREAKS: [
      {
        label: 'พักกลางวัน',
        startMinutes: 12 * 60, // 720  (12:00)
        endMinutes: 13 * 60, // 780  (13:00)
        durationMinutes: 60,
        isPaid: false, // หักออก
      },
    ] as BreakPeriod[],

    UNPAID_BREAK_MINUTES: 60,

    /** งานจริงต่อวัน: (960-420) - 60 = 480 นาที = 8 ชม. */
    REGULAR_WORK_MINUTES: 16 * 60 - 7 * 60 - 60, // 480
  },
} as const;

export type ShiftId = keyof typeof SHIFTS;

// -----------------------------------------------------------------------------
// Geolocation — ตรวจสอบพื้นที่ก่อน Clock In
// -----------------------------------------------------------------------------
export const GEOLOCATION = {
  /** ≤ ค่านี้ → อนุมัติอัตโนมัติ */
  APPROVE_RADIUS_METERS: 100,

  /** 101–300m → Allow แต่ Flag HR */
  FLAG_RADIUS_METERS: 300,

  /**
   * > FLAG_RADIUS_METERS → ปฏิเสธการ clock in
   * HR สามารถแก้ค่านี้ได้ใน companySettings
   */
  REJECT_RADIUS_METERS: 300,

  /**
   * GPS accuracy เกินค่านี้ → Flag เสมอ แม้จะอยู่ในรัศมี
   * (browser Geolocation API คืนค่าเป็นเมตร)
   */
  MAX_ACCURACY_METERS: 100,
} as const;

// -----------------------------------------------------------------------------
// Grace Period
// -----------------------------------------------------------------------------
export const GRACE_PERIOD = {
  /** ผ่อนผันมาสาย 15 นาที (late minutes ยังนับจาก shift start) */
  LATE_MINUTES: 15,
  /** ผ่อนผันออกก่อนเวลา 5 นาที */
  EARLY_LEAVE_MINUTES: 5,
} as const;

// -----------------------------------------------------------------------------
// OT Rules
// -----------------------------------------------------------------------------
export const OT_RULES = {
  /**
   * ต้องทำ OT เกิน 30 นาทีก่อน ถึงจะได้ OT
   * ถ้าไม่ถึง 30 นาที = ไม่ได้เลย
   */
  MINIMUM_MINUTES: 30,

  /** OT สูงสุด 3 ชั่วโมง/วัน */
  MAX_MINUTES: 3 * 60, // 180

  /**
   * OT Rate:
   * วันธรรมดา หลังเลิกกะ         = เงินเดือน÷30÷8 × 1.5
   * วันหยุด ช่วงเวลางานปกติ       = เงินเดือน÷30÷8 × 1.0 (บวกเพิ่ม)
   * วันหยุด ช่วง OT (หลังเลิกกะ) = เงินเดือน÷30÷8 × 3.0 (บวกเพิ่ม)
   */
  RATES: {
    WEEKDAY: 1.5,
    HOLIDAY_REGULAR: 1.0,
    HOLIDAY_OT: 3.0,
  },
} as const;

// -----------------------------------------------------------------------------
// Attendance Status
// -----------------------------------------------------------------------------
export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  LATE_AND_EARLY_LEAVE: 'late_and_early_leave',
  ABSENT: 'absent',
  HOLIDAY: 'holiday',
  ON_LEAVE: 'on_leave',
  WEEKEND: 'weekend',
} as const;

// -----------------------------------------------------------------------------
// Late Warning System
// -----------------------------------------------------------------------------
export const LATE_WARNING = {
  /** สาย 3 ครั้ง = warning letter 1 ฉบับ */
  LATE_COUNT_PER_WARNING: 3,
  /** warning 3 ฉบับ = แจ้ง HR */
  WARNING_COUNT_FOR_HR_NOTIFICATION: 3,
} as const;

// -----------------------------------------------------------------------------
// Leave Types
// -----------------------------------------------------------------------------
export const LEAVE_TYPES = {
  SICK: 'sick',
  ANNUAL: 'annual',
  BUSINESS: 'business',
  BUSINESS_UNPAID: 'business_unpaid',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  SICK_NEWBORN: 'sick_newborn',
  MILITARY: 'military',
  ORDINATION: 'ordination',
  STERILIZATION: 'sterilization',
  TRAINING: 'training',
  COMPENSATE: 'compensate',
} as const;

export type LeaveType = (typeof LEAVE_TYPES)[keyof typeof LEAVE_TYPES];

/**
 * การลาประเภทไหนที่ทำให้หายเบี้ยขยัน
 * ลาพักร้อน + ลากิจ (แจ้งล่วงหน้า) = ยังได้เบี้ยขยัน
 * ที่เหลือ = หาย
 */
export const LEAVE_LOSES_DILIGENCE: Record<string, boolean> = {
  [LEAVE_TYPES.SICK]: true,
  [LEAVE_TYPES.ANNUAL]: false, // ✅ ยังได้เบี้ยขยัน
  [LEAVE_TYPES.BUSINESS]: false, // ✅ ถ้าแจ้งล่วงหน้า
  [LEAVE_TYPES.BUSINESS_UNPAID]: true,
  [LEAVE_TYPES.MATERNITY]: true,
  [LEAVE_TYPES.PATERNITY]: true,
  [LEAVE_TYPES.SICK_NEWBORN]: true,
  [LEAVE_TYPES.MILITARY]: true,
  [LEAVE_TYPES.ORDINATION]: true,
  [LEAVE_TYPES.STERILIZATION]: true,
  [LEAVE_TYPES.TRAINING]: false, // ✅ ฝึกอบรมบริษัท ยังได้
  [LEAVE_TYPES.COMPENSATE]: false, // ✅ หยุดชดเชย ยังได้
};

// -----------------------------------------------------------------------------
// Holiday Types
// -----------------------------------------------------------------------------
export const HOLIDAY_TYPES = {
  PUBLIC: 'public', // วันหยุดนักขัตฤกษ์
  COMPANY: 'company', // วันหยุดบริษัท
  EMERGENCY: 'emergency', // วันหยุดฉุกเฉิน (น้ำท่วม, ไฟดับ ฯลฯ)
  SPECIAL: 'special', // วันหยุดพิเศษรัฐบาล
} as const;

export type HolidayType = (typeof HOLIDAY_TYPES)[keyof typeof HOLIDAY_TYPES];

// -----------------------------------------------------------------------------
// Employee Type
// -----------------------------------------------------------------------------
export const EMPLOYEE_TYPES = {
  BLUE_COLLAR: 'blue_collar', // พนักงานโรงงาน (สแกนนิ้ว, มี OT, มีกะ)
  WHITE_COLLAR: 'white_collar', // พนักงานสำนักงาน (ไม่สแกน, ไม่มี OT)
} as const;

export type EmployeeType = (typeof EMPLOYEE_TYPES)[keyof typeof EMPLOYEE_TYPES];

// -----------------------------------------------------------------------------
// Shift Override Scope
// -----------------------------------------------------------------------------
export const OVERRIDE_SCOPE = {
  COMPANY: 'company',
  DEPARTMENT: 'department',
  TEAM: 'team',
  INDIVIDUAL: 'individual',
} as const;

export type OverrideScope =
  (typeof OVERRIDE_SCOPE)[keyof typeof OVERRIDE_SCOPE];

// -----------------------------------------------------------------------------
// Social Security
// -----------------------------------------------------------------------------
export const SOCIAL_SECURITY = {
  /** อัตรา 5% ของ fix pay เท่านั้น */
  RATE: 0.05,
  /** ฐานเงินเดือนต่ำสุด */
  MIN_BASE: 1650,
  /** ฐานเงินเดือนสูงสุด */
  MAX_BASE: 17500,
  /** หักสูงสุด = 17500 × 5% = 875 บาท */
  MAX_DEDUCTION: 875,
  /** หักต่ำสุด = 1650 × 5% = 82.5 บาท */
  MIN_DEDUCTION: 82.5,
} as const;

// -----------------------------------------------------------------------------
// Payroll Allowances (Blue Collar — fixed amounts ใน Firestore)
// ค่าเหล่านี้เป็น default reference เท่านั้น
// ค่าจริงดึงจาก Firestore collection: payrollSettings
// -----------------------------------------------------------------------------
export const DEFAULT_ALLOWANCES = {
  BLUE_COLLAR: {
    DILIGENCE: 1000, // เบี้ยขยัน (หายถ้ามาสาย/ขาด/ลาบางประเภท)
    HOUSING: 1000, // ที่พัก
    MEAL: 800, // อาหาร
    TRANSPORTATION: 600, // เดินทาง
    SHIFT_NIGHT: 100, // ค่ากะ (กะดึกเท่านั้น ต่อวัน)
    OT_MEAL: 30, // ค่าอาหาร OT (วันที่ทำ OT เท่านั้น)
  },
  WHITE_COLLAR: {
    HOUSING: 5000, // ที่พัก
    PHONE: 1500, // ค่าโทรศัพท์
    // ไม่มี: เบี้ยขยัน, อาหาร, เดินทาง, ค่ากะ, ค่าอาหาร OT
  },
} as const;

// -----------------------------------------------------------------------------
// Attendance Limits
// -----------------------------------------------------------------------------
export const ATTENDANCE_LIMITS = {
  MAX_SHIFT_MINUTES: 14 * 60, // shift ยาวสุด 14 ชม.
  MANUAL_EDIT_DAYS: 30, // HR แก้ย้อนหลังได้ 30 วัน
  MAX_REPORT_RANGE_DAYS: 92, // report สูงสุด ~3 เดือน
  EARLY_CLOCK_IN_MINUTES: 60, // clock in ล่วงหน้าได้ 60 นาที
} as const;

// -----------------------------------------------------------------------------
// Firestore Collections
// -----------------------------------------------------------------------------
export const FIRESTORE = {
  COLLECTIONS: {
    ATTENDANCE: 'attendance',
    ATTENDANCE_ADJUSTMENTS: 'attendanceAdjustments', // audit trail
    HOLIDAYS: 'holidays',
    USERS: 'users',
    LEAVES: 'leaves',
    LEAVE_BALANCES: 'leaveBalances',
    SHIFT_ASSIGNMENTS: 'shiftAssignments',
    SHIFT_OVERRIDES: 'shiftOverrides',
    LATE_RECORDS: 'lateRecords',
    WARNING_LETTERS: 'warningLetters',
    NOTIFICATIONS: 'notifications',
    AUDIT_LOGS: 'auditLogs',
    PAYROLL: 'payroll',
    PAYROLL_SETTINGS: 'payrollSettings',
    POSITION_ALLOWANCES: 'positionAllowances',
    DEPARTMENTS: 'departments',
    POSITIONS: 'positions',
  },
  /**
   * Attendance Document ID: "{userId}_{YYYY-MM-DD}"
   * วันที่ = วันที่ shift เริ่มเสมอ
   * กะดึก clock in จันทร์ 20:00, clock out อังคาร 05:00 → date = จันทร์
   */
  ATTENDANCE_DOC_ID: (userId: string, date: string) => `${userId}_${date}`,
} as const;

// -----------------------------------------------------------------------------
// Error Codes
// -----------------------------------------------------------------------------
export const ATTENDANCE_ERROR_CODES = {
  ALREADY_CLOCKED_IN: 'ALREADY_CLOCKED_IN',
  NOT_CLOCKED_IN: 'NOT_CLOCKED_IN',
  ALREADY_CLOCKED_OUT: 'ALREADY_CLOCKED_OUT',
  INVALID_CLOCK_TIME: 'INVALID_CLOCK_TIME',
  CLOCK_OUT_BEFORE_CLOCK_IN: 'CLOCK_OUT_BEFORE_CLOCK_IN',
  ATTENDANCE_NOT_FOUND: 'ATTENDANCE_NOT_FOUND',
  EDIT_EXPIRED: 'EDIT_EXPIRED',
  FUTURE_DATE: 'FUTURE_DATE',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  SHIFT_TOO_LONG: 'SHIFT_TOO_LONG',
  SHIFT_NOT_ASSIGNED: 'SHIFT_NOT_ASSIGNED',
  AMBIGUOUS_SHIFT: 'AMBIGUOUS_SHIFT',
  WHITE_COLLAR_NO_CLOCK: 'WHITE_COLLAR_NO_CLOCK',
  FIRESTORE_ERROR: 'FIRESTORE_ERROR',
} as const;
