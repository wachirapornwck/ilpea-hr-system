/**
 * src/types/approval.ts
 * Generic approval engine types.
 * ต้องไม่มี leave-specific logic ในนี้
 * ใช้ซ้ำได้กับ: Leave, Attendance Adjustment, Overtime, Payroll, Expense
 */

import type { TimestampFields } from './common';

// ============================================================
// APPROVAL STATUS
// ============================================================

export type ApprovalStatus =
  | 'submitted' // สร้างแล้ว รอดำเนินการ
  | 'pending' // ส่งให้ผู้อนุมัติแล้ว
  | 'approved'
  | 'rejected'
  | 'cancelled';

// ============================================================
// APPROVAL MODULE — ระบุว่า feature ไหนเป็นเจ้าของ
// ============================================================

export type ApprovalModule =
  | 'leave'
  | 'attendance_adjustment'
  | 'overtime'
  | 'payroll'
  | 'expense'; // future

// ============================================================
// APPROVAL ACTION
// ============================================================

export type ApprovalAction = 'approve' | 'reject' | 'cancel' | 'forward';

// ============================================================
// APPROVAL STAGE — รองรับ multi-stage ในอนาคต
// ปัจจุบัน: stage=1, totalStages=1
// ============================================================

export interface ApprovalStage {
  stage: number; // 1-based
  totalStages: number;
  approverId: string; // employeeId ของผู้อนุมัติ
  approverName?: string;
  status: ApprovalStatus;
  decidedAt?: string; // ISO 8601
  remark?: string;
}

// ============================================================
// APPROVABLE — base interface ที่ document ที่ต้องอนุมัติต้อง extend
// ============================================================

export interface Approvable {
  status: ApprovalStatus;
  stages: ApprovalStage[];
  currentStage: number; // 1-based index
  approvedBy?: string; // employeeId
  approvedAt?: string; // ISO 8601
  approvalRemark?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionRemark?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancellationRemark?: string;
}

// ============================================================
// APPROVAL DECISION PAYLOAD — ส่งให้ approval.service.ts
// ============================================================

export interface ApprovalDecisionPayload {
  module: ApprovalModule;
  documentId: string;
  action: ApprovalAction;
  stage: number;
  approverId: string;
  remark?: string;
}

// ============================================================
// APPROVAL HISTORY RECORD — เก็บทุก action ห้าม overwrite
// ============================================================

export interface ApprovalHistoryRecord extends TimestampFields {
  id: string;
  module: ApprovalModule;
  documentId: string;
  action: ApprovalAction;
  stage: number;
  previousStatus: ApprovalStatus;
  newStatus: ApprovalStatus;
  performedBy: string; // employeeId
  performedByName?: string;
  remark?: string;
}

// ============================================================
// APPROVAL CONFIG — กำหนด approval chain ของแต่ละ module
// ============================================================

export interface ApprovalStageConfig {
  stage: number;
  approverId: string;
  approverName?: string;
}

export interface ApprovalConfig {
  module: ApprovalModule;
  stages: ApprovalStageConfig[];
}
