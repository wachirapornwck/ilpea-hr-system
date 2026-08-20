/**
 * src/types/employee.ts
 * Employee domain types.
 * ย้ายมาจาก src/types/index.ts เดิม
 */

import type { TimestampFields } from './common';

// ============================================================
// ENUMS
// ============================================================

export type UserRole = 'employee' | 'manager' | 'hr_manager' | 'admin';
export type EmployeeType = 'blue_collar' | 'white_collar';
export type EmploymentStatus = 'active' | 'inactive';
export type TitlePrefix = 'mr' | 'mrs' | 'miss' | 'other';

export const WHITE_COLLAR_POSITIONS = [
  'HR Manager',
  'Production Planner',
  'Production & Quality Manager',
  'Process Administrative Officer',
  'Maintenance Supervisor',
] as const;

export type WhiteCollarPosition = (typeof WHITE_COLLAR_POSITIONS)[number];

// ============================================================
// SHIFT
// ============================================================

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isDefault: boolean;
  createdAt: string; // ISO 8601 (เปลี่ยนจาก Date เป็น string เพื่อ Firestore)
}

// ============================================================
// USER — Session only, minimum fields สำหรับ UI rendering
// ============================================================

export interface User {
  id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  role: UserRole;
  employeeType: EmployeeType;
  department: string;
  profileImage: string | null;
}

// ============================================================
// EMPLOYEE DETAIL — Full detail โหลดผ่าน protected API
// ============================================================

export interface EmployeeDetail extends TimestampFields {
  id: string;
  employeeId: string;
  firstNameEN: string;
  lastNameEN: string;
  firstNameTH: string;
  lastNameTH: string;
  nickname?: string;
  gender: 'male' | 'female';
  role: UserRole;
  employeeType: EmployeeType;
  employmentStatus: EmploymentStatus;
  positionId: string;
  positionName: string;
  departmentId: string;
  departmentName: string;
  shiftId: string | null;
  startDate: string;
  phone?: string;
  lineId?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  profileImage?: string | null;
  mustChangePIN: boolean;
  // ── เพิ่มใหม่ ──
  dateOfBirth?: string; // YYYY-MM-DD
  productionLineId?: string; // ref → productionLines collection
  // ── Schema v2 ──
  titlePrefix?: TitlePrefix;
  titlePrefixOther?: string; // used only when titlePrefix === 'other'
  probationEndDate?: string; // YYYY-MM-DD
  terminationDate?: string; // YYYY-MM-DD — HR-planned exit date, distinct from disabledAt
  hrRemark?: string; // HR-only free text (endpoint is HR-only already, no extra gate needed)
  // Readonly — auto-set by POST /api/employees/[id]/disable, never part of
  // Create/Update payloads. Firestore has written these fields already;
  // this just exposes them to the type system.
  disabledAt?: string;
  disabledReason?: string;
}

// ============================================================
// EMPLOYEE LIST ITEM — Lightweight สำหรับ table/list
// ============================================================

export interface EmployeeListItem {
  id: string;
  employeeId: string;
  firstNameEN: string;
  lastNameEN: string;
  firstNameTH: string;
  lastNameTH: string;
  nickname?: string;
  role: UserRole;
  employeeType: EmployeeType;
  employmentStatus: EmploymentStatus;
  positionName: string;
  departmentId: string;
  departmentName: string;
  shiftId: string | null;
  startDate: string;
  profileImage?: string | null;
  dateOfBirth?: string | null;
}

// ============================================================
// FILTERS
// ============================================================

export interface EmployeeFilters {
  search: string;
  departmentId: string;
  positionId: string;
  employeeType: EmployeeType | '';
  employmentStatus: EmploymentStatus | '';
}

// ============================================================
// PAYLOADS
// ============================================================

export interface CreateEmployeePayload {
  employeeId: string;
  firstNameEN: string;
  lastNameEN: string;
  firstNameTH: string;
  lastNameTH: string;
  nickname?: string;
  gender: 'male' | 'female';
  role: UserRole;
  employeeType: EmployeeType;
  positionId: string;
  departmentId: string;
  shiftId: string | null;
  startDate: string;
  phone?: string;
  lineId?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  dateOfBirth?: string; // YYYY-MM-DD — optional, needed for Employee Import PIN generation
  // ── Schema v2 ──
  titlePrefix?: TitlePrefix;
  titlePrefixOther?: string; // used only when titlePrefix === 'other'
  probationEndDate?: string; // YYYY-MM-DD
  terminationDate?: string; // YYYY-MM-DD — HR-planned, optional even at creation
  hrRemark?: string;
  pin: string;
}

export interface UpdateEmployeePayload {
  departmentId?: string;
  positionId?: string;
  shiftId?: string | null;
  employmentStatus?: EmploymentStatus;
  employeeType?: EmployeeType;
  role?: UserRole;
  // ── Phase A: Editable Name (Employee Detail/Edit UX Refactor) ──
  firstNameTH?: string;
  lastNameTH?: string;
  firstNameEN?: string;
  lastNameEN?: string;
  phone?: string;
  lineId?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  profileImage?: string | null;
  // ── เพิ่มใหม่ ──
  nickname?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  productionLineId?: string; // ref → productionLines collection
  // ── Schema v2 ──
  titlePrefix?: TitlePrefix;
  titlePrefixOther?: string; // used only when titlePrefix === 'other'
  probationEndDate?: string; // YYYY-MM-DD
  terminationDate?: string; // YYYY-MM-DD — HR-planned exit date
  hrRemark?: string;
  // NOTE: gender and startDate are intentionally NOT included here.
  // Frozen per Schema v2 decision — see src/types/employee.ts history /
  // architecture discussion. gender has a functional dependency on
  // gender_based leave entitlement; startDate is queried directly by
  // attendance/dashboard/hr-today. Do not add either without an explicit
  // business requirement.
}

// ============================================================
// DEPARTMENT & POSITION
// ============================================================

export interface Department {
  id: string;
  name: string;
  nameEN: string;
  managerId?: string;
  active?: boolean;
  createdAt: string; // ISO 8601
}

export interface Position {
  id: string;
  code: string;
  name: string;
  description?: string;
  departmentId: string;
  employeeType: EmployeeType;
  defaultShiftId?: string;
  grade?: string;
  level?: number;
  isSupervisor: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
// ============================================================
// PRODUCTION LINE
// ============================================================

export interface ProductionLine {
  id: string;
  code: string;
  name: string;
  description?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
