// =============================================================================
// lib/attendance/statusHelpers.ts
// =============================================================================

import {
  ATTENDANCE_STATUS,
  SHIFTS,
  LATE_WARNING,
  type ShiftId,
} from './constants';
import type {
  AttendanceStatus,
  AttendanceRecord,
  AttendanceSummary,
  LateRecord,
  WarningLetter,
} from './types';

// -----------------------------------------------------------------------------
// Labels
// -----------------------------------------------------------------------------
const LABELS_TH: Record<AttendanceStatus, string> = {
  [ATTENDANCE_STATUS.PRESENT]: 'มาทำงาน',
  [ATTENDANCE_STATUS.LATE]: 'มาสาย',
  [ATTENDANCE_STATUS.EARLY_LEAVE]: 'ออกก่อนเวลา',
  [ATTENDANCE_STATUS.LATE_AND_EARLY_LEAVE]: 'มาสายและออกก่อน',
  [ATTENDANCE_STATUS.ABSENT]: 'ขาดงาน',
  [ATTENDANCE_STATUS.HOLIDAY]: 'วันหยุดนักขัตฤกษ์',
  [ATTENDANCE_STATUS.ON_LEAVE]: 'ลางาน',
  [ATTENDANCE_STATUS.WEEKEND]: 'วันหยุดประจำสัปดาห์',
};

const LABELS_EN: Record<AttendanceStatus, string> = {
  [ATTENDANCE_STATUS.PRESENT]: 'Present',
  [ATTENDANCE_STATUS.LATE]: 'Late',
  [ATTENDANCE_STATUS.EARLY_LEAVE]: 'Early Leave',
  [ATTENDANCE_STATUS.LATE_AND_EARLY_LEAVE]: 'Late & Early Leave',
  [ATTENDANCE_STATUS.ABSENT]: 'Absent',
  [ATTENDANCE_STATUS.HOLIDAY]: 'Public Holiday',
  [ATTENDANCE_STATUS.ON_LEAVE]: 'On Leave',
  [ATTENDANCE_STATUS.WEEKEND]: 'Weekend',
};

export function getStatusLabel(
  status: AttendanceStatus,
  lang: 'th' | 'en' = 'th'
): string {
  return lang === 'th'
    ? LABELS_TH[status] ?? status
    : LABELS_EN[status] ?? status;
}

// -----------------------------------------------------------------------------
// Colors (Tailwind)
// -----------------------------------------------------------------------------
export function getStatusColor(status: AttendanceStatus) {
  const colors: Record<
    AttendanceStatus,
    { bg: string; text: string; border: string; dot: string }
  > = {
    [ATTENDANCE_STATUS.PRESENT]: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
      dot: 'bg-green-500',
    },
    [ATTENDANCE_STATUS.LATE]: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
      dot: 'bg-yellow-500',
    },
    [ATTENDANCE_STATUS.EARLY_LEAVE]: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      dot: 'bg-orange-500',
    },
    [ATTENDANCE_STATUS.LATE_AND_EARLY_LEAVE]: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      dot: 'bg-red-500',
    },
    [ATTENDANCE_STATUS.ABSENT]: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      dot: 'bg-red-600',
    },
    [ATTENDANCE_STATUS.HOLIDAY]: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
      dot: 'bg-blue-500',
    },
    [ATTENDANCE_STATUS.ON_LEAVE]: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      dot: 'bg-purple-500',
    },
    [ATTENDANCE_STATUS.WEEKEND]: {
      bg: 'bg-gray-50',
      text: 'text-gray-500',
      border: 'border-gray-200',
      dot: 'bg-gray-400',
    },
  };
  return colors[status] ?? colors[ATTENDANCE_STATUS.ABSENT];
}

// -----------------------------------------------------------------------------
// Priority (sort: ปัญหาขึ้นก่อน)
// -----------------------------------------------------------------------------
const PRIORITY: Record<AttendanceStatus, number> = {
  [ATTENDANCE_STATUS.ABSENT]: 1,
  [ATTENDANCE_STATUS.LATE_AND_EARLY_LEAVE]: 2,
  [ATTENDANCE_STATUS.LATE]: 3,
  [ATTENDANCE_STATUS.EARLY_LEAVE]: 4,
  [ATTENDANCE_STATUS.PRESENT]: 5,
  [ATTENDANCE_STATUS.ON_LEAVE]: 6,
  [ATTENDANCE_STATUS.HOLIDAY]: 7,
  [ATTENDANCE_STATUS.WEEKEND]: 8,
};

export function getStatusPriority(status: AttendanceStatus): number {
  return PRIORITY[status] ?? 99;
}

export function sortByStatusPriority(
  records: AttendanceRecord[]
): AttendanceRecord[] {
  return [...records].sort(
    (a, b) => getStatusPriority(a.status) - getStatusPriority(b.status)
  );
}

// -----------------------------------------------------------------------------
// Editability
// -----------------------------------------------------------------------------
export function isAttendanceEditable(
  record: AttendanceRecord,
  userRole: 'employee' | 'manager' | 'hr' | 'admin'
): boolean {
  if (userRole === 'employee') return false;
  const daysDiff =
    (Date.now() - new Date(record.date + 'T12:00:00+07:00').getTime()) /
    (1000 * 60 * 60 * 24);
  if (userRole === 'manager') return daysDiff <= 7;
  return daysDiff <= 30; // hr / admin
}

// -----------------------------------------------------------------------------
// Shift Labels
// -----------------------------------------------------------------------------
export function getShiftLabel(
  shiftId: ShiftId,
  lang: 'th' | 'en' = 'th'
): string {
  return lang === 'th' ? SHIFTS[shiftId].label : SHIFTS[shiftId].labelEN;
}

export function getShiftTimeRange(shiftId: ShiftId): string {
  const s = SHIFTS[shiftId];
  const sh = String(s.START_HOUR).padStart(2, '0');
  const sm = String(s.START_MINUTE).padStart(2, '0');
  const eh = String(s.END_HOUR).padStart(2, '0');
  const em = String(s.END_MINUTE).padStart(2, '0');
  return `${sh}:${sm}–${eh}:${em}${s.IS_OVERNIGHT ? ' (+1)' : ''}`;
}

// -----------------------------------------------------------------------------
// Late Warning System
// ทุก 3 ครั้งที่สาย → Warning Letter 1 ฉบับ
// Warning 3 ฉบับ → แจ้ง HR
// -----------------------------------------------------------------------------

/**
 * ตรวจสอบว่า late count ถึง threshold ไหม และควร generate warning หรือเปล่า
 *
 * @param currentLateCount  จำนวนครั้งที่สายสะสมในรอบปัจจุบัน (ยังไม่ reset)
 * @returns { shouldGenerateWarning, newCycleCount, warningNumber }
 */
export function checkLateWarningThreshold(
  currentLateCount: number,
  currentWarningCount: number
): {
  shouldGenerateWarning: boolean;
  countAfterIncrement: number;
  newWarningCount: number;
  shouldNotifyHR: boolean;
} {
  const countAfterIncrement = currentLateCount + 1;
  const shouldGenerateWarning =
    countAfterIncrement >= LATE_WARNING.LATE_COUNT_PER_WARNING;
  const newWarningCount = shouldGenerateWarning
    ? currentWarningCount + 1
    : currentWarningCount;
  const shouldNotifyHR =
    newWarningCount >= LATE_WARNING.WARNING_COUNT_FOR_HR_NOTIFICATION;

  return {
    shouldGenerateWarning,
    countAfterIncrement,
    newWarningCount,
    shouldNotifyHR,
  };
}

/**
 * สร้าง Warning Letter object (ยังไม่ save Firestore)
 */
export function buildWarningLetter(
  userId: string,
  warningNumber: number,
  lateRecordIds: string[],
  records: LateRecord[]
): Omit<WarningLetter, 'id'> {
  const dates = records.map((r) => r.date).sort();
  return {
    userId,
    warningNumber,
    lateRecordIds,
    periodStart: dates[0],
    periodEnd: dates[dates.length - 1],
    issuedAt: new Date(),
    issuedBy: 'system',
  };
}

// -----------------------------------------------------------------------------
// Monthly Summary
// -----------------------------------------------------------------------------
export function summarizeMonthlyAttendance(
  records: AttendanceRecord[],
  totalWorkingDays: number,
  userId: string,
  year: number,
  month: number
): AttendanceSummary {
  let presentDays = 0,
    absentDays = 0,
    lateDays = 0,
    earlyLeaveDays = 0,
    leaveDays = 0;
  let totalLateMinutes = 0,
    totalOTMinutes = 0,
    totalWorkingHours = 0;
  const byShift: AttendanceSummary['byShift'] = {
    DAY: { days: 0, overtimeMinutes: 0 },
    NIGHT: { days: 0, overtimeMinutes: 0 },
    MAID: { days: 0, overtimeMinutes: 0 },
  };

  // เบี้ยขยัน: หายถ้ามาสายหรือขาดงาน (การลาตรวจแยก)
  let hasLate = false,
    hasAbsent = false;

  for (const r of records) {
    switch (r.status) {
      case 'present':
        presentDays++;
        break;
      case 'late':
        presentDays++;
        lateDays++;
        hasLate = true;
        break;
      case 'early_leave':
        presentDays++;
        earlyLeaveDays++;
        break;
      case 'late_and_early_leave':
        presentDays++;
        lateDays++;
        earlyLeaveDays++;
        hasLate = true;
        break;
      case 'absent':
        absentDays++;
        hasAbsent = true;
        break;
      case 'on_leave':
        leaveDays++;
        break;
    }
    totalLateMinutes += r.lateMinutes ?? 0;
    totalOTMinutes += r.overtimeMinutes ?? 0;
    totalWorkingHours += r.workingHours ?? 0;

    if (r.shiftId in byShift) {
      byShift[r.shiftId as ShiftId].days++;
      byShift[r.shiftId as ShiftId].overtimeMinutes += r.overtimeMinutes ?? 0;
    }
  }

  return {
    userId,
    year,
    month,
    totalWorkingDays,
    presentDays,
    absentDays,
    lateDays,
    earlyLeaveDays,
    leaveDays,
    totalLateMinutes,
    totalOvertimeMinutes: totalOTMinutes,
    totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
    diligenceAllowanceEarned: !hasLate && !hasAbsent,
    byShift,
  };
}
