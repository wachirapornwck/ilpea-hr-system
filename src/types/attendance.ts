// =============================================================================
// C0.2 — LEGACY / DEPRECATED compat boundary.
// Canonical attendance model = src/lib/attendance/types.ts (engine; มี consumer จริง).
// ไฟล์นี้ (domain) ไม่มี consumer แล้ว (0 references) — เก็บชั่วคราวเพื่อ compat,
// ยังไม่ลบ/ไม่ fold เพราะ Conflict #1(time) #2(status) #4(work-time naming) ยังไม่ตัดสิน.
// ห้าม import symbol จากไฟล์นี้ในโค้ดใหม่ — ใช้ canonical แทน.
// =============================================================================
/**
 * src/types/attendance.ts
 * Attendance domain types.
 * ย้ายมาจาก src/types/index.ts เดิม
 * GeoLocation ย้ายไปอยู่ common.ts แล้ว — import จากที่นั่น
 */

import type { TimestampFields, GeoLocation } from './common';

// ============================================================
// ENUMS
// ============================================================

/** @deprecated C0.2 legacy — ใช้ canonical จาก '@/lib/attendance/types' แทน */
export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'half-day'
  | 'holiday'
  | 'leave';

export type ClockEventType = 'check_in' | 'check_out';

/** @deprecated C0.2 legacy — ใช้ canonical จาก '@/lib/attendance/types' แทน */
export type GeoVerificationStatus =
  | 'auto_approved' // ≤100m
  | 'needs_review' // 101–300m
  | 'rejected'; // >300m

// ============================================================
// ATTENDANCE RECORD — Firestore document
// ============================================================

/** @deprecated C0.2 legacy — ใช้ canonical จาก '@/lib/attendance/types' แทน */
export interface AttendanceRecord extends TimestampFields {
  id: string;
  userId: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  shiftId: string;
  checkIn: string | null; // ISO 8601
  checkOut: string | null; // ISO 8601
  status: AttendanceStatus;
  workHours: number;
  overtimeHours: number;
  note: string;
  location?: GeoLocation;
  geoStatus?: GeoVerificationStatus;
}

// ============================================================
// ATTENDANCE TODAY RESPONSE — สำหรับ Dashboard
// ============================================================

/** @deprecated C0.2 legacy — ใช้ canonical จาก '@/lib/attendance/types' แทน */
export interface AttendanceTodayResponse {
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  checkInTime: string | null; // ISO 8601
  checkOutTime: string | null; // ISO 8601
  status: AttendanceStatus | null;
  workHours: number | null;
  shift: {
    startTime: string;
    endTime: string;
  } | null;
}

// ============================================================
// CLOCK EVENT — payload สำหรับ clock-in / clock-out
// ============================================================

/** @deprecated C0.2 legacy — ใช้ canonical จาก '@/lib/attendance/types' แทน */
export interface ClockEventPayload {
  type: ClockEventType;
  location: GeoLocation;
  timestamp: string; // ISO 8601
}
