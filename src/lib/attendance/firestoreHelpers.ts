// =============================================================================
// lib/attendance/firestoreHelpers.ts
// =============================================================================
// Firestore Operations — ใช้ adminDb (REST API) แทน firebase-admin
// =============================================================================

import { adminDb, FieldValue, Timestamp } from '@/lib/firebase/admin';
import { FIRESTORE, SHIFTS } from './constants';
import {
  toDateString,
  toTimeString,
  getMonthRange,
  getNightShiftDate,
} from './dateUtils';
import {
  buildEffectiveShift,
  buildOverrideEffectiveShift,
  calculateAttendance,
} from './calculators';
import {
  validateClockIn,
  validateClockOut,
  validateManualAttendance,
  validateDateRange,
} from './validators';
import { checkLateWarningThreshold, buildWarningLetter } from './statusHelpers';
import { FirestoreAttendanceError, AttendanceNotFoundError } from './errors';
import type {
  AttendanceRecord,
  AttendanceAdjustment,
  ShiftOverride,
  EffectiveShift,
  AuditLog,
  AuditAction,
  LateRecord,
  ClockInPayload,
  ClockOutPayload,
  ManualAttendancePayload,
  AttendanceQueryFilter,
  AttendanceQueryResult,
  AttendanceSummary,
  TeamAttendanceSummary,
} from './types';

// =============================================================================
// Converter
// =============================================================================

function toAttendanceRecord(
  id: string,
  data: Record<string, any>
): AttendanceRecord {
  const toDate = (v: any): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'string') return new Date(v);
    if (v?.seconds) return new Date(v.seconds * 1000);
    return null;
  };
  return {
    id,
    userId: data.userId,
    date: data.date,
    shiftId: data.shiftId,
    effectiveShift: data.effectiveShift,
    clockInTime: toDate(data.clockInTime),
    clockOutTime: toDate(data.clockOutTime),
    status: data.status,
    dayType: data.dayType,
    lateMinutes: data.lateMinutes ?? 0,
    earlyLeaveMinutes: data.earlyLeaveMinutes ?? 0,
    workingMinutes: data.workingMinutes ?? 0,
    workingHours: data.workingHours ?? 0,
    overtimeMinutes: data.overtimeMinutes ?? 0,
    overtimeMultiplier: data.overtimeMultiplier ?? 1,
    shiftAllowance: data.shiftAllowance ?? 0,
    otMealAllowance: data.otMealAllowance ?? 0,
    note: data.note ?? null,
    source: data.source ?? 'system',
    lastModifiedBy: data.lastModifiedBy ?? '',
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  } as AttendanceRecord;
}

// =============================================================================
// Shift Override Resolution
// =============================================================================

export async function resolveShiftOverride(
  userId: string,
  departmentId: string,
  date: string
): Promise<ShiftOverride | null> {
  try {
    const snap = await adminDb
      .collection(FIRESTORE.COLLECTIONS.SHIFT_OVERRIDES)
      .where('date', '==', date)
      .get();

    if (snap.empty) return null;

    const overrides = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as ShiftOverride)
    );
    const priorityOrder: Record<string, number> = {
      individual: 1,
      team: 2,
      department: 3,
      company: 4,
    };

    const applicable = overrides
      .filter((o) => {
        if (o.scope === 'individual') return o.scopeId === userId;
        if (o.scope === 'department') return o.scopeId === departmentId;
        if (o.scope === 'company') return true;
        return false;
      })
      .sort(
        (a, b) =>
          (priorityOrder[a.scope] ?? 99) - (priorityOrder[b.scope] ?? 99)
      );

    return applicable[0] ?? null;
  } catch (error) {
    throw new FirestoreAttendanceError('resolveShiftOverride', error);
  }
}

export async function getEffectiveShift(
  userId: string,
  departmentId: string,
  shiftId: keyof typeof SHIFTS,
  date: string
): Promise<EffectiveShift> {
  const override = await resolveShiftOverride(userId, departmentId, date);
  if (override) {
    return buildOverrideEffectiveShift(
      shiftId,
      override.startTime,
      override.endTime,
      override.isOvernight,
      override.id
    );
  }
  return buildEffectiveShift(shiftId);
}

// =============================================================================
// READ
// =============================================================================

export async function getTodayAttendance(
  userId: string,
  dateStr?: string
): Promise<AttendanceRecord | null> {
  try {
    const date = dateStr ?? toDateString(new Date());
    const docId = FIRESTORE.ATTENDANCE_DOC_ID(userId, date);
    const doc = await adminDb
      .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
      .doc(docId)
      .get();
    if (!doc.exists || !doc.data()) return null;
    return toAttendanceRecord(doc.id, doc.data()!);
  } catch (error) {
    throw new FirestoreAttendanceError('getTodayAttendance', error);
  }
}

export async function getAttendanceByDateRange(
  filter: AttendanceQueryFilter
): Promise<AttendanceQueryResult> {
  try {
    validateDateRange(filter.startDate, filter.endDate);

    let q = adminDb
      .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
      .where('date', '>=', filter.startDate)
      .where('date', '<=', filter.endDate)
      .orderBy('date', 'asc');

    if (filter.userId) q = q.where('userId', '==', filter.userId);
    if (filter.status) q = q.where('status', '==', filter.status);
    if (filter.shiftId) q = q.where('shiftId', '==', filter.shiftId);

    const snap = await q.get();
    const records = snap.docs.map((d) => toAttendanceRecord(d.id, d.data()));
    return { records, total: records.length };
  } catch (error) {
    if (error instanceof FirestoreAttendanceError) throw error;
    throw new FirestoreAttendanceError('getAttendanceByDateRange', error);
  }
}

export async function getMonthlyAttendance(
  userId: string,
  year: number,
  month: number
): Promise<AttendanceRecord[]> {
  const { start, end } = getMonthRange(year, month);
  const result = await getAttendanceByDateRange({
    userId,
    startDate: toDateString(start),
    endDate: toDateString(end),
  });
  return result.records;
}

export async function getTeamAttendance(
  userIds: string[],
  dateStr: string
): Promise<TeamAttendanceSummary> {
  try {
    const records: AttendanceRecord[] = [];
    const BATCH = 10; // REST API 'in' operator รองรับสูงสุด 10

    for (let i = 0; i < userIds.length; i += BATCH) {
      const batch = userIds.slice(i, i + BATCH);
      const snap = await adminDb
        .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
        .where('userId', 'in', batch)
        .where('date', '==', dateStr)
        .get();
      records.push(...snap.docs.map((d) => toAttendanceRecord(d.id, d.data())));
    }

    const presentSet = new Set<string>();
    let present = 0,
      late = 0,
      onLeave = 0;

    for (const r of records) {
      if (
        ['present', 'late', 'early_leave', 'late_and_early_leave'].includes(
          r.status
        )
      ) {
        presentSet.add(r.userId);
        present++;
        if (r.status === 'late' || r.status === 'late_and_early_leave') late++;
      } else if (r.status === 'on_leave') onLeave++;
    }

    return {
      date: dateStr,
      departmentId: '',
      totalEmployees: userIds.length,
      present,
      absent: userIds.filter((id) => !presentSet.has(id)).length,
      late,
      onLeave,
      records,
    };
  } catch (error) {
    throw new FirestoreAttendanceError('getTeamAttendance', error);
  }
}

// =============================================================================
// WRITE: Clock In
// =============================================================================

export async function clockIn(
  payload: ClockInPayload,
  departmentId: string,
  isHoliday: boolean = false
): Promise<AttendanceRecord> {
  try {
    const clockInTime = payload.clockInTime ?? new Date();
    const shift = SHIFTS[payload.shiftId];
    const shiftDate = shift.IS_OVERNIGHT
      ? getNightShiftDate(clockInTime)
      : toDateString(clockInTime);

    const existing = await getTodayAttendance(payload.userId, shiftDate);
    validateClockIn(payload, existing);

    const effectiveShift = await getEffectiveShift(
      payload.userId,
      departmentId,
      payload.shiftId,
      shiftDate
    );
    const docId = FIRESTORE.ATTENDANCE_DOC_ID(payload.userId, shiftDate);
    const now = new Date();

    // รับ location extras จาก payload (ส่งมาจาก clock-in route)
    const p = payload as any;
    const data = {
      userId: payload.userId,
      date: shiftDate,
      shiftId: payload.shiftId,
      effectiveShift,
      clockInTime,
      clockOutTime: null,
      status: 'present',
      dayType: isHoliday ? 'holiday' : 'weekday',
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workingMinutes: 0,
      workingHours: 0,
      overtimeMinutes: 0,
      overtimeMultiplier: 1,
      shiftAllowance: 0,
      otMealAllowance: 0,
      // Location fields
      clockInLocation: p.clockInLocation ?? null,
      clockOutLocation: null,
      distanceMeters: p.distanceMeters ?? null,
      locationSuspect: p.locationSuspect ?? false,
      locationFlagReason: p.locationFlagReason ?? null,
      note: p.locationFlagReason ?? null,
      source: 'employee',
      lastModifiedBy: payload.userId,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb
      .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
      .doc(docId)
      .set(data);
    await writeAuditLog({
      action: 'attendance_adjustment',
      userId: payload.userId,
      targetId: docId,
      targetType: 'attendance',
      previousValue: null,
      newValue: { clockInTime },
    });

    return toAttendanceRecord(docId, data);
  } catch (error) {
    if (error instanceof Error && error.name !== 'Error') throw error;
    throw new FirestoreAttendanceError('clockIn', error);
  }
}

// =============================================================================
// WRITE: Clock Out + Full Calculation
// =============================================================================

export async function clockOut(
  payload: ClockOutPayload,
  departmentId: string,
  isHoliday: boolean = false
): Promise<AttendanceRecord> {
  try {
    const clockOutTime = payload.clockOutTime ?? new Date();
    const today = toDateString(new Date());
    const existing = await getTodayAttendance(payload.userId, today);

    validateClockOut(payload, existing);

    const clockInTime = existing!.clockInTime as Date;
    const result = calculateAttendance(
      clockInTime,
      clockOutTime,
      existing!.shiftId,
      existing!.date,
      existing!.effectiveShift,
      isHoliday,
      false
    );

    const docId = FIRESTORE.ATTENDANCE_DOC_ID(payload.userId, existing!.date);
    const updates = {
      clockOutTime,
      status: result.status,
      dayType: result.dayType,
      lateMinutes: result.lateness.lateMinutes,
      earlyLeaveMinutes: result.earlyLeave.earlyLeaveMinutes,
      workingMinutes: result.workingHours.workingMinutes,
      workingHours: result.workingHours.workingHours,
      overtimeMinutes: result.ot.cappedOtMinutes,
      overtimeMultiplier: result.ot.multiplier,
      shiftAllowance: result.shiftAllowance,
      otMealAllowance: result.otMealAllowance,
      lastModifiedBy: payload.userId,
      updatedAt: new Date(),
    };

    await adminDb
      .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
      .doc(docId)
      .update(updates);

    // Late record → check warning
    if (result.lateness.isLate) {
      await handleLateRecord(
        payload.userId,
        existing!.date,
        result.lateness.lateMinutes,
        docId
      );
    }

    await writeAuditLog({
      action: 'attendance_adjustment',
      userId: payload.userId,
      targetId: docId,
      targetType: 'attendance',
      previousValue: { clockOutTime: null },
      newValue: { clockOutTime, status: result.status },
    });

    return { ...existing!, ...updates };
  } catch (error) {
    if (error instanceof Error && error.name !== 'Error') throw error;
    throw new FirestoreAttendanceError('clockOut', error);
  }
}

// =============================================================================
// WRITE: HR Manual Adjustment (Audit Trail — ไม่เขียนทับ)
// =============================================================================

export async function adjustAttendance(
  payload: ManualAttendancePayload,
  isHoliday: boolean = false
): Promise<{ record: AttendanceRecord; adjustment: AttendanceAdjustment }> {
  try {
    const validation = validateManualAttendance(payload);
    if (!validation.valid) {
      throw new Error(validation.errors.map((e) => e.message).join('; '));
    }

    const existing = await getTodayAttendance(payload.userId, payload.date);
    if (!existing)
      throw new AttendanceNotFoundError(payload.userId, payload.date);

    const effectiveShift =
      existing.effectiveShift ?? buildEffectiveShift(payload.shiftId);
    const result = calculateAttendance(
      payload.clockInTime,
      payload.clockOutTime,
      payload.shiftId,
      payload.date,
      effectiveShift,
      isHoliday,
      false
    );

    const docId = FIRESTORE.ATTENDANCE_DOC_ID(payload.userId, payload.date);
    const updates = {
      clockInTime: payload.clockInTime,
      clockOutTime: payload.clockOutTime,
      status: result.status,
      dayType: result.dayType,
      lateMinutes: result.lateness.lateMinutes,
      earlyLeaveMinutes: result.earlyLeave.earlyLeaveMinutes,
      workingMinutes: result.workingHours.workingMinutes,
      workingHours: result.workingHours.workingHours,
      overtimeMinutes: result.ot.cappedOtMinutes,
      overtimeMultiplier: result.ot.multiplier,
      shiftAllowance: result.shiftAllowance,
      otMealAllowance: result.otMealAllowance,
      note: `${payload.reason} — ${payload.comment}`,
      source: 'hr',
      lastModifiedBy: payload.modifiedBy,
      updatedAt: new Date(),
    };

    await adminDb
      .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
      .doc(docId)
      .update(updates);

    // Audit trail — บันทึก adjustment แยก (ห้ามลบ)
    const adjustmentData = {
      attendanceId: docId,
      userId: payload.userId,
      date: payload.date,
      originalValues: {
        clockInTime: existing.clockInTime,
        clockOutTime: existing.clockOutTime,
        status: existing.status,
      },
      adjustedValues: {
        clockInTime: payload.clockInTime,
        clockOutTime: payload.clockOutTime,
        status: result.status,
      },
      reason: payload.reason,
      comment: payload.comment,
      adjustedBy: payload.modifiedBy,
      adjustedAt: new Date(),
    };
    const adjRef = await adminDb
      .collection(FIRESTORE.COLLECTIONS.ATTENDANCE_ADJUSTMENTS)
      .add(adjustmentData);

    await writeAuditLog({
      action: 'attendance_adjustment',
      userId: payload.modifiedBy,
      targetId: docId,
      targetType: 'attendance',
      previousValue: adjustmentData.originalValues,
      newValue: adjustmentData.adjustedValues,
      reason: payload.reason,
    });

    return {
      record: { ...existing, ...updates } as AttendanceRecord,
      adjustment: { id: adjRef.id, ...adjustmentData } as AttendanceAdjustment,
    };
  } catch (error) {
    if (error instanceof Error && error.name !== 'Error') throw error;
    throw new FirestoreAttendanceError('adjustAttendance', error);
  }
}

// =============================================================================
// Late Record + Warning Letter
// =============================================================================

async function handleLateRecord(
  userId: string,
  date: string,
  lateMinutes: number,
  attendanceId: string
): Promise<void> {
  try {
    const snap = await adminDb
      .collection(FIRESTORE.COLLECTIONS.LATE_RECORDS)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    const last = snap.empty ? null : snap.docs[0].data();
    const currentCount = last?.countInCycle ?? 0;
    const currentWarning = last?.warningCycle ?? 0;

    const {
      shouldGenerateWarning,
      countAfterIncrement,
      newWarningCount,
      shouldNotifyHR,
    } = checkLateWarningThreshold(currentCount, currentWarning);

    await adminDb.collection(FIRESTORE.COLLECTIONS.LATE_RECORDS).add({
      userId,
      date,
      lateMinutes,
      attendanceId,
      countInCycle: shouldGenerateWarning ? 0 : countAfterIncrement,
      warningCycle: newWarningCount,
      createdAt: new Date(),
    });

    if (shouldGenerateWarning) {
      const prevIds = snap.docs.map((d) => d.id);
      await adminDb.collection(FIRESTORE.COLLECTIONS.WARNING_LETTERS).add({
        userId,
        warningNumber: newWarningCount,
        lateRecordIds: prevIds,
        periodStart: date,
        periodEnd: date,
        issuedAt: new Date(),
        issuedBy: 'system',
      });

      if (shouldNotifyHR) {
        await adminDb.collection(FIRESTORE.COLLECTIONS.NOTIFICATIONS).add({
          type: 'warning_limit_reached',
          userId,
          warningCount: newWarningCount,
          message: `พนักงาน ${userId} ได้รับ Warning Letter ครบ ${newWarningCount} ฉบับ กรุณาตรวจสอบ`,
          isRead: false,
          createdAt: new Date(),
        });
      }
    }
  } catch (error) {
    console.error('[handleLateRecord] Failed (non-blocking):', error);
  }
}

// =============================================================================
// Shift Override CRUD
// =============================================================================

export async function createShiftOverride(
  override: Omit<ShiftOverride, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ShiftOverride> {
  try {
    const now = new Date();
    const ref = await adminDb
      .collection(FIRESTORE.COLLECTIONS.SHIFT_OVERRIDES)
      .add({ ...override, createdAt: now, updatedAt: now });

    await writeAuditLog({
      action: 'shift_override_created',
      userId: override.createdBy,
      targetId: ref.id,
      targetType: 'shiftOverride',
      previousValue: null,
      newValue: override,
    });

    return { id: ref.id, ...override, createdAt: now, updatedAt: now };
  } catch (error) {
    throw new FirestoreAttendanceError('createShiftOverride', error);
  }
}

// =============================================================================
// Audit Log
// =============================================================================

export async function writeAuditLog(
  log: Omit<AuditLog, 'id' | 'timestamp'>
): Promise<void> {
  try {
    await adminDb.collection(FIRESTORE.COLLECTIONS.AUDIT_LOGS).add({
      ...log,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[writeAuditLog] Failed (non-blocking):', error);
  }
}

// =============================================================================
// Batch: Mark Absent
// =============================================================================

export async function markAbsent(
  userIds: string[],
  dateStr: string,
  shiftIds: Record<string, string>
): Promise<number> {
  try {
    const now = new Date();
    for (const userId of userIds) {
      const docId = FIRESTORE.ATTENDANCE_DOC_ID(userId, dateStr);
      await adminDb
        .collection(FIRESTORE.COLLECTIONS.ATTENDANCE)
        .doc(docId)
        .set(
          {
            userId,
            date: dateStr,
            shiftId: shiftIds[userId] ?? 'DAY',
            effectiveShift: buildEffectiveShift(
              (shiftIds[userId] ?? 'DAY') as keyof typeof SHIFTS
            ),
            clockInTime: null,
            clockOutTime: null,
            status: 'absent',
            dayType: 'weekday',
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
            workingMinutes: 0,
            workingHours: 0,
            overtimeMinutes: 0,
            overtimeMultiplier: 1,
            shiftAllowance: 0,
            otMealAllowance: 0,
            note: 'Auto-marked absent by system',
            source: 'system',
            lastModifiedBy: 'system',
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
    }
    return userIds.length;
  } catch (error) {
    throw new FirestoreAttendanceError('markAbsent', error);
  }
}
