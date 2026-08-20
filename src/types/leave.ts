/**
 * src/types/leave.ts
 * Leave domain types.
 * ใส่เฉพาะ leave-specific entities เท่านั้น
 * Approval types → import จาก approval.ts
 * Shared types → import จาก common.ts
 */

import type { TimestampFields, FileAttachment } from './common';
import type { Approvable } from './approval';

// ============================================================
// LEAVE TYPE — มาจาก Firestore collection "leaveTypes"
// ห้าม hardcode ประเภทการลาใน code
//
// ออกแบบใหม่ตามระเบียบการลาจริงของบริษัท (11 ประเภท) — เดิม field
// ง่ายเกินไป (paid: boolean, สิทธิเป็นตัวเลขคงที่ตัวเดียว) ไม่พอสำหรับ
// เงื่อนไขจริงที่ซับซ้อนกว่านั้น เช่น:
//   - พักผ่อน: สิทธิขึ้นกับอายุงาน (tenure tiers)
//   - ลาคลอด: สิทธิต่างกันตามเพศ
//   - ลาป่วย: ต้องมีใบรับรองแพทย์แบบมีเงื่อนไข (เกิน N วัน) ไม่ใช่ทุกครั้ง
//   - เลี้ยงบุตรป่วย: จ่ายแค่ 50%
// ============================================================

export type LeavePayType = 'full' | 'partial' | 'unpaid';

export type LeaveEntitlementType =
  | 'fixed' // จำนวนวันคงที่ เช่น ลากิจ 3 วัน
  | 'tenure_based' // ขึ้นกับอายุงาน เช่น พักผ่อน
  | 'gender_based' // ต่างกันตามเพศ เช่น ลาคลอด
  | 'doctor_specified' // ตามที่แพทย์ระบุ เช่น ลาทำหมัน
  | 'per_occurrence'; // นับครั้ง/ปี เช่น ฝึกอบรม 3 ครั้ง/ปี

export interface TenureTier {
  minYears: number; // อายุงานขั้นต่ำ (ปี) ที่เริ่มได้สิทธินี้
  days: number;
}

export interface GenderEntitlement {
  male?: number;
  female?: number;
}

export type AttachmentRequirement = 'always' | 'conditional' | 'never';

export interface LeaveType {
  id: string;
  code: string; // เช่น "SICK", "VACATION", "MATERNITY", "TRAINING"
  name: string; // ชื่อไทย เช่น "ลาป่วย"
  nameEN: string; // ชื่ออังกฤษ เช่น "Sick Leave"
  color: string; // hex เช่น "#10B981"
  icon: string; // เช่น "heart-pulse", "palm-tree"

  entitlementType: LeaveEntitlementType;
  fixedDays?: number; // ใช้เมื่อ entitlementType = 'fixed' | 'doctor_specified' (ค่าอ้างอิง)
  tenureTiers?: TenureTier[]; // ใช้เมื่อ entitlementType = 'tenure_based'
  genderEntitlement?: GenderEntitlement; // ใช้เมื่อ entitlementType = 'gender_based'
  maxOccurrencesPerYear?: number; // ใช้เมื่อ entitlementType = 'per_occurrence'

  payType: LeavePayType;
  payPercent?: number; // ใช้เมื่อ payType = 'partial' เช่น 50 สำหรับเลี้ยงบุตรป่วย
  countsHolidays: boolean; // นับรวมวันหยุดในการนับวันลาไหม

  advanceNoticeDays: number; // ต้องยื่นล่วงหน้ากี่วัน (0 = ยื่นย้อนหลัง/ทันที เช่น ลาป่วย/ลาทหาร)

  requiresAttachment: AttachmentRequirement;
  attachmentCondition?: string; // คำอธิบายเงื่อนไข เช่น "เกิน 2 วัน หรือลาติดต่อวันหยุด"

  affectsAttendanceBonus: boolean; // true = ยังได้เบี้ยขยันตามปกติ (มีแค่พักผ่อนเท่านั้นที่ true)
  minTenureYears?: number; // อายุงานขั้นต่ำที่มีสิทธิลาประเภทนี้ได้เลย เช่น อุปสมบท = 1 ปี

  requiresApproval: boolean; // ตามระเบียบคือ true ทุกประเภท เก็บไว้เผื่ออนาคต
  notes?: string; // เงื่อนไขพิเศษอื่นๆ ที่ยังไม่ได้ทำเป็น field แยก

  active: boolean;
  sortOrder: number;
}

export interface LeaveTypeCreateInput {
  requesterId: string;
  code: string;
  name: string;
  nameEN: string;
  color: string;
  icon: string;
  entitlementType: LeaveEntitlementType;
  fixedDays?: number;
  tenureTiers?: TenureTier[];
  genderEntitlement?: GenderEntitlement;
  maxOccurrencesPerYear?: number;
  payType: LeavePayType;
  payPercent?: number;
  countsHolidays: boolean;
  advanceNoticeDays: number;
  requiresAttachment: AttachmentRequirement;
  attachmentCondition?: string;
  affectsAttendanceBonus: boolean;
  minTenureYears?: number;
  notes?: string;
  sortOrder?: number;
}

export interface LeaveTypeUpdateInput extends Partial<LeaveTypeCreateInput> {
  requesterId: string;
  active?: boolean;
}

// ============================================================
// LEAVE BALANCE — Document ID: `${userId}_${year}`, collection "leaveBalances"
//
// ⚠️ ปรับให้ตรงกับ contract จริงที่ /api/attendance/dashboard/summary และ
// /api/employees/[id] ใช้งานอยู่แล้ว (field ชื่อ userId ไม่ใช่ employeeId,
// เดิม design ไว้เป็น nested balances/used/pending/remaining maps แต่ไม่มี
// ใครสร้างตามจริงเลย) — ใช้ flat map เดียวแทนคือ "เหลือเท่าไหร่" ต่อประเภท
// การลา ส่วนจำนวนที่รออนุมัติดูได้จาก query leaveRequests status='pending'
// โดยตรง ไม่ต้องเก็บซ้ำในนี้ ยอดจะถูกหักตอนอนุมัติเท่านั้น (ไม่หักตอนยื่น)
// ============================================================

export interface LeaveBalance {
  id: string; // `${userId}_${year}`
  userId: string;
  year: number;
  balances: Record<string, number>; // leaveTypeCode -> วันคงเหลือ เช่น { SICK: 28, VACATION: 8 }
  updatedAt: string; // ISO 8601
}

// ============================================================
// LEAVE DURATION — ผลลัพธ์จาก shift-aware calculation
// ============================================================

export interface LeaveDuration {
  calendarDays: number; // วันตามปฏิทิน
  workingDays: number; // วันทำงานจริง (หัก weekend + holiday)
  halfDay: boolean;
  morningOnly?: boolean;
}

// ============================================================
// LEAVE REQUEST — Firestore document
// extends Approvable เพื่อรองรับ approval workflow
// ============================================================

export interface LeaveRequest extends Approvable, TimestampFields {
  id: string;
  userId: string;
  leaveTypeId: string; // ref → leaveTypes collection
  leaveTypeCode: string; // denormalized เพื่อ query ง่าย
  leaveTypeName: string; // denormalized เพื่อ display
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  duration: LeaveDuration;
  reason: string;
  attachment?: FileAttachment;
}

// ============================================================
// LEAVE HISTORY — เก็บทุก action ห้าม overwrite ห้าม delete
// ============================================================

export interface LeaveHistory extends TimestampFields {
  id: string;
  leaveRequestId: string;
  action: string; // "submitted" | "approved" | "rejected" | "cancelled"
  previousStatus: string;
  newStatus: string;
  performedBy: string; // employeeId
  performedByName?: string;
  remarks?: string;
}

// ============================================================
// LEAVE SUMMARY — สำหรับแสดงผลใน Dashboard
// ============================================================

export interface LeaveSummary {
  userId: string;
  year: number;
  balance: LeaveBalance;
  pendingRequests: number;
  approvedRequests: number;
  recentRequests: LeaveRequest[];
}

// ============================================================
// LEAVE POLICY — อ่านจาก companySettings
// ============================================================

export interface LeavePolicy {
  probationLeaveAllowed: boolean;
  workingDaysPerWeek: number;
  requiresAttachmentAfterDays: number; // เช่น ลาป่วย > 3 วัน ต้องแนบใบรับรอง
}

// ============================================================
// PAYLOADS — สำหรับ API
// ============================================================

export interface CreateLeaveRequestPayload {
  leaveTypeId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  attachment?: FileAttachment;
}

export interface UpdateLeaveRequestPayload {
  action: 'approve' | 'reject' | 'cancel';
  remark?: string;
}
