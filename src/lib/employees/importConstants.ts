/**
 * src/lib/employees/importConstants.ts
 * Employee Import — shared constants and pure helper functions.
 *
 * Phase 6-3 Step 1: moved verbatim from src/app/(app)/employees/page.tsx.
 * No behavior changes. These are shared by the Import Preview (client) and,
 * in later steps, by the Validate/Import API routes — so there is exactly
 * one implementation of each rule.
 *
 * Everything here must stay pure: no React, no Firestore, no fetch.
 */

import type { ImportFieldDef } from './importTypes';

// ── Employee Import — Phase 4 (Validation) ──────────────────────────────
// Canonical import template: every column below must be present in the
// uploaded file's header row (exact label match), in any order. `required`
// controls the per-row "Required Value" check (#3), separate from the
// header-presence check (#1) which applies to all columns regardless.
export const IMPORT_TEMPLATE_FIELDS: ImportFieldDef[] = [
  { key: 'employeeId', label: 'รหัสพนักงาน', required: true },
  { key: 'titlePrefix', label: 'คำนำหน้า', required: false },
  { key: 'firstNameTH', label: 'ชื่อ (ไทย)', required: true },
  { key: 'lastNameTH', label: 'นามสกุล (ไทย)', required: true },
  { key: 'firstNameEN', label: 'ชื่อ (อังกฤษ)', required: true },
  { key: 'lastNameEN', label: 'นามสกุล (อังกฤษ)', required: true },
  { key: 'nickname', label: 'ชื่อเล่น', required: false },
  { key: 'gender', label: 'เพศ', required: false },
  { key: 'dateOfBirth', label: 'วันเดือนปีเกิด', required: false },
  { key: 'department', label: 'แผนก', required: true },
  { key: 'position', label: 'ตำแหน่ง', required: true },
  { key: 'employeeType', label: 'ประเภทพนักงาน', required: true },
  // กะ: required เฉพาะ blue_collar — ตรวจใน validateImportData() ตาม
  // employeeType ของแถวนั้น จึงตั้ง required:false ตรงนี้เพื่อไม่ให้
  // Required Value check (#3) บังคับกับ white_collar ที่เว้นว่างได้
  { key: 'shift', label: 'กะการทำงาน', required: false },
  { key: 'role', label: 'สิทธิ์การใช้งาน', required: true },
  { key: 'employmentStatus', label: 'สถานะการทำงาน', required: true },
  { key: 'startDate', label: 'วันที่เริ่มงาน', required: false },
  { key: 'probationEndDate', label: 'วันที่ผ่านทดลองงาน', required: false },
  { key: 'terminationDate', label: 'วันที่สิ้นสุดการทำงาน', required: false },
  { key: 'phone', label: 'เบอร์โทรศัพท์', required: false },
  { key: 'address', label: 'ที่อยู่', required: false },
  {
    key: 'emergencyContactName',
    label: 'ชื่อผู้ติดต่อฉุกเฉิน',
    required: false,
  },
  { key: 'emergencyContactRelation', label: 'ความสัมพันธ์', required: false },
  {
    key: 'emergencyContactPhone',
    label: 'เบอร์โทรผู้ติดต่อฉุกเฉิน',
    required: false,
  },
  { key: 'hrRemark', label: 'หมายเหตุ', required: false },
];

export const IMPORT_DATE_FIELD_KEYS = [
  'dateOfBirth',
  'startDate',
  'probationEndDate',
  'terminationDate',
];

// ทั้งสองช่องเป็น optional และใช้กฎเดียวกัน — รวมไว้เพื่อให้วนลูปเดียว
// ตรวจทั้งคู่ (รูปแบบเดียวกับ IMPORT_DATE_FIELD_KEYS ด้านบน)
export const IMPORT_PHONE_FIELD_KEYS = ['phone', 'emergencyContactPhone'];

// DDMMYY from a "YYYY-MM-DD" dateOfBirth string. Returns null if missing or
// not in the expected format — caller treats that employee as "skipped".
export function computeBirthdayPin(dateOfBirth?: string | null): string | null {
  if (!dateOfBirth) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const [, yyyy, mm, dd] = match;
  return `${dd}${mm}${yyyy.slice(2)}`;
}

// Same CSV field-escaping rule as Holiday's export (quote fields containing
// a comma/quote/newline, double up embedded quotes).
export function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// mr/นาย, mrs/นาง, miss/นางสาว(/ms) map exactly; anything else non-empty
// normalizes to 'other' (never an error — Schema v2's `other` + free-text
// escape hatch exists precisely so Import never has to reject a title).
export function normalizeTitlePrefix(
  raw: string
): 'mr' | 'mrs' | 'miss' | 'other' | '' {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const normalized = trimmed.replace(/\.$/, '').toLowerCase();
  if (trimmed === 'นาย' || normalized === 'mr') return 'mr';
  if (trimmed === 'นาง' || normalized === 'mrs') return 'mrs';
  if (trimmed === 'นางสาว' || normalized === 'miss' || normalized === 'ms')
    return 'miss';
  return 'other';
}

// ค่าที่ระบบรองรับจริงคือ 'male' | 'female' เท่านั้น (src/types/employee.ts)
// ส่วน UI ทั้งหน้า Add Employee และ Employee Detail ใช้ label ไทย
// ว่า "ชาย" / "หญิง" — จึงรับทั้งสองแบบเหมือน role/shift/employmentStatus
// ไม่เพิ่มค่าอื่น (เช่น M/F) เพราะระบบยังไม่มีที่ไหนนิยามไว้
const GENDER_VALUE_MAP: Record<string, string> = {
  male: 'male',
  female: 'female',
  ชาย: 'male',
  หญิง: 'female',
};
export function normalizeGender(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    GENDER_VALUE_MAP[trimmed] ?? GENDER_VALUE_MAP[trimmed.toLowerCase()] ?? null
  );
}

const ROLE_VALUE_MAP: Record<string, string> = {
  employee: 'employee',
  manager: 'manager',
  hr_manager: 'hr_manager',
  admin: 'admin',
  พนักงาน: 'employee',
  ผู้จัดการ: 'manager',
};
export function normalizeRole(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    ROLE_VALUE_MAP[trimmed] ?? ROLE_VALUE_MAP[trimmed.toLowerCase()] ?? null
  );
}

const SHIFT_VALUE_MAP: Record<string, string> = {
  DAY: 'DAY',
  NIGHT: 'NIGHT',
  MAID: 'MAID',
  กะเช้า: 'DAY',
  กะดึก: 'NIGHT',
  กะแม่บ้าน: 'MAID',
};
export function normalizeShift(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    SHIFT_VALUE_MAP[trimmed] ?? SHIFT_VALUE_MAP[trimmed.toUpperCase()] ?? null
  );
}

const EMPLOYMENT_STATUS_VALUE_MAP: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
  ปกติ: 'active',
  ระงับแล้ว: 'inactive',
};
export function normalizeEmploymentStatus(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return (
    EMPLOYMENT_STATUS_VALUE_MAP[trimmed] ??
    EMPLOYMENT_STATUS_VALUE_MAP[trimmed.toLowerCase()] ??
    null
  );
}

// ค่าที่ระบบรองรับจริงคือ 'blue_collar' | 'white_collar' เท่านั้น
// (src/types/employee.ts) รับเฉพาะค่าทางธุรกิจที่นิยามไว้อย่างเป็นทางการ
// ห้ามเพิ่ม alias ที่ธุรกิจไม่ได้นิยาม — Employee Type เป็น business data
// ระบบต้องไม่เดา
// หมายเหตุ: key ที่มี space/hyphen ถูก normalize เป็น underscore ก่อน lookup
// จึงครอบคลุม "Blue Collar" และ "blue-collar" โดยไม่ต้องแตก entry
const EMPLOYEE_TYPE_VALUE_MAP: Record<string, string> = {
  blue_collar: 'blue_collar',
  white_collar: 'white_collar',
};
export function normalizeEmployeeType(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase().replace(/[\s-]+/g, '_');
  return (
    EMPLOYEE_TYPE_VALUE_MAP[trimmed] ?? EMPLOYEE_TYPE_VALUE_MAP[key] ?? null
  );
}

// ⚠️ ROOT CAUSE ของบั๊ก "date cell ใน Excel ไม่ผ่าน validation":
// XLSX.read(..., { cellDates: true }) คืนค่า cell ที่จัดรูปแบบเป็นวันที่มาเป็น
// JS Date object เมื่อผ่าน String(...) จะได้ "Mon Jul 20 2026 00:00:00
// GMT+0700 (Indochina Time)" ซึ่งตกที่ isValidImportDate() ทุกแถว
// และห้ามใช้ .toISOString() แทน เพราะจะแปลงเป็น UTC ก่อน slice — ที่ UTC+7
// เที่ยงคืนวันที่ 2 จะกลายเป็นวันที่ 1 (บั๊กเดียวกับที่ Holiday Import
// เจอและแก้ไว้แล้ว) ต้องดึง year/month/date จาก local component ตรงๆ เท่านั้น
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ตรวจทั้ง "รูปแบบ" และ "มีอยู่จริงในปฏิทิน" — regex อย่างเดียวไม่พอ
// เพราะ "2026-02-30" / "2026-13-45" ผ่าน pattern ได้หมด
//
// ⚠️ ใช้ Date.UTC ไม่ใช่ new Date(y, m, d) — constructor แบบ local อิง
// timezone ของ browser ที่ UTC+7 อาจทำให้ round-trip เพี้ยนข้ามวัน
// (หลักเดียวกับ toLocalDateStr ข้างบน: ห้ามผสม local กับ UTC)
//
// JS จะ "roll over" วันที่เกินจริงเงียบๆ (Date.UTC(2026, 1, 30) → 2 มี.ค.)
// จึงต้องเทียบค่าที่ได้กลับกับ input ทีละส่วนเพื่อจับการ overflow
export function isValidImportDate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // ตัดค่านอกช่วงออกก่อน เพื่อไม่ต้องพึ่ง round-trip อย่างเดียว
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

// ตรวจเบอร์โทรไทย — ใช้ร่วมกันทั้ง phone และ emergencyContactPhone
// (ฟังก์ชันเดียว กฎจึงไม่มีทางแตกต่างกันภายหลัง)
//
// ตัดตัวคั่นทิ้งก่อน (ช่องว่าง / - / . / วงเล็บ) เพราะรูปแบบที่ HR
// พิมพ์ใน Excel จริงมีทั้ง "081-234-5678", "02 123 4567", "(02) 123-4567"
// รหัสนอกประเทศ +66 / 0066 ถูกแปลงกลับเป็น 0 นำหน้าแบบในประเทศ
//
// หลัง normalize แล้วรับเฉพาะ  2 รูปแบบ:
//   - มือถือ : 0 + [6,8,9] + อีก 8 หลัก = 10 หลัก (เช่น 0812345678)
//   - บ้าน  : 0 + [2-7]   + อีก 7 หลัก =  9 หลัก (เช่น 021234567, 038123456)
export function isValidThaiPhone(raw: string): boolean {
  // เก็บ + ไว้ก่อน เพื่อใช้ตรวจ prefix +66 แล้วค่อยตัดทิ้งทีหลัง
  const compact = raw.trim().replace(/[\s\-.()]/g, '');
  if (!compact) return false;

  let local = compact;
  if (local.startsWith('+66')) local = '0' + local.slice(3);
  else if (local.startsWith('0066')) local = '0' + local.slice(4);

  // กันอักขระอื่นที่หลงเหลือ (เช่น "ต่อ", "ext", + ที่ไม่ใช่ +66)
  if (!/^\d+$/.test(local)) return false;

  return /^0[689]\d{8}$/.test(local) || /^0[2-7]\d{7}$/.test(local);
}

// แถวว่างทั้งแถว = ทุก cell ว่างหลัง trim — ใช้เกณฑ์เดียวกันทั้ง CSV
// และ Excel เพื่อให้สองทางได้ผลลัพธ์เหมือนกัน (เดิม CSV filter บรรทัดว่างทิ้ง
// ตั้งแต่ก่อน parse ส่วน Excel ไม่ filter เลย → ผลไม่ตรงกัน)
export function isEmptyImportRow(cells: string[]): boolean {
  return cells.every((c) => String(c ?? '').trim() === '');
}
