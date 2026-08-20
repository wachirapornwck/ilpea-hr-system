/**
 * src/types/payroll.ts
 * Payroll domain types.
 * ย้ายมาจาก src/types/index.ts เดิม
 * Phase 4 เตรียม structure ไว้ก่อน ยังไม่ implement logic
 */

import type { TimestampFields } from './common';
import type { Approvable } from './approval';

// ============================================================
// PAYROLL STATUS
// ============================================================

export type PayrollStatus = 'draft' | 'approved' | 'paid';

// ============================================================
// PAYROLL RECORD — Firestore document
// ============================================================

export interface PayrollRecord extends TimestampFields {
  id: string;
  employeeId: string;
  month: number; // 1–12
  year: number;
  baseSalary: number;
  overtimePay: number;
  deductions: number;
  netSalary: number;
  workDays: number;
  absentDays: number;
  lateDays: number;
  leaveDays: number; // เพิ่มใหม่ — เชื่อมกับ Leave module
  status: PayrollStatus;
}

// ============================================================
// PAYROLL SUMMARY — สำหรับแสดงผลใน Dashboard / Reports
// ============================================================

export interface PayrollSummary {
  employeeId: string;
  month: number;
  year: number;
  netSalary: number;
  status: PayrollStatus;
}

// ============================================================
// OVERTIME RECORD — แยกออกมาจาก PayrollRecord
// ============================================================

// สถานะการจ่ายเงิน — แยกจาก ApprovalStatus เพราะ 'paid' เกิดขึ้น "หลัง" approved แล้ว
export type OvertimePaymentStatus = 'unpaid' | 'paid';

export interface OvertimeRecord extends Approvable, TimestampFields {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  hours: number;
  rateMultiplier: number; // 1.5 weekday, 3.0 holiday
  amount: number; // hours × rate × multiplier
  paymentStatus: OvertimePaymentStatus; // ใช้คู่กับ Approvable.status
  reason?: string;
}
