// =============================================================================
// src/types/holiday.ts
// =============================================================================
// Collection "holidays" — REUSES the existing collection name already
// queried live by 5 attendance routes (clock-in, clock-out, today, history,
// adjustment). The `date` field name/format ("YYYY-MM-DD") is load-bearing —
// do not rename or reformat it.
//
// Field name `isActive` (not `active`) per explicit spec.
//
// `type` is intentionally a free string, not a hardcoded union — the task
// requires new holiday types to be addable without code changes. The UI
// suggests common defaults (Public / Company / Substitute / Special) but
// does not enforce them.
//
// `scope` / `departmentIds` / `productionLineIds` / `locationIds` and
// `repeatEveryYear` are included now so the schema never needs a breaking
// migration later, but are NOT wired to any logic yet (v1 always writes
// scope: 'company'). Per this phase's explicit scope, this module is NOT
// connected to Attendance/Leave/Payroll calculation — that's next phase.
// =============================================================================

export type HolidayScope =
  | 'company'
  | 'department' // reserved, unused in v1
  | 'production_line' // reserved, unused in v1
  | 'location'; // reserved, unused in v1

export const SUGGESTED_HOLIDAY_TYPES = [
  'Public Holiday',
  'Company Holiday',
  'Substitute Holiday',
  'Special Holiday',
] as const;

export interface Holiday {
  id: string;
  name: string;
  nameEN?: string;
  date: string; // "YYYY-MM-DD" — ห้ามเปลี่ยนชื่อ/รูปแบบ ระบบ Attendance พึ่งพาอยู่
  type: string; // ข้อความอิสระ ดู SUGGESTED_HOLIDAY_TYPES สำหรับค่าที่แนะนำ
  description?: string;
  isActive: boolean;
  repeatEveryYear: boolean; // ยังไม่มี logic จับคู่ข้ามปีอัตโนมัติในเฟสนี้
  scope: HolidayScope; // เผื่ออนาคต — v1 เป็น 'company' เสมอ
  departmentIds?: string[]; // เผื่ออนาคต ยังไม่ใช้
  productionLineIds?: string[]; // เผื่ออนาคต ยังไม่ใช้
  locationIds?: string[]; // เผื่ออนาคต ยังไม่ใช้
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface HolidayCreateInput {
  requesterId: string;
  name: string;
  nameEN?: string;
  date: string;
  type: string;
  description?: string;
  repeatEveryYear?: boolean;
}

export interface HolidayUpdateInput {
  requesterId: string;
  name?: string;
  nameEN?: string;
  date?: string;
  type?: string;
  description?: string;
  repeatEveryYear?: boolean;
  isActive?: boolean;
}
