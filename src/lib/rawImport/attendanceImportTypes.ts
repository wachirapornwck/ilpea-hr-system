// =============================================================================
// src/lib/rawImport/attendanceImportTypes.ts
// -----------------------------------------------------------------------------
// HR Standard Attendance Import — contract (IMMUTABLE EVIDENCE).
//
// Template ที่ HR เตรียม/แปลงจาก fingerprint raw มาแล้ว "ก่อน" upload:
//   EmployeeID | Date | Check in | Check out
//   - 1 แถว = 1 คน / 1 วัน (in/out ถูกจับคู่โดย HR มาแล้ว)
//   - importer นี้ INGEST ค่าดิบตามไฟล์เท่านั้น — ไม่ตีความ IN/OUT, ไม่ pair,
//     ไม่ late/shift/status/mapping/payroll (ทั้งหมดอยู่หลัง Raw Import Boundary)
//
// แยกออกจาก fingerprint scan-event model (ParsedScanRow / RawScanRow) โดยสมบูรณ์:
//   - คนละ data model (scan-event มี Mode/TMNo/DateTime เดียว; template นี้มี
//     Date + checkIn + checkOut)
//   - ใช้ collection ของตัวเอง (rawAttendanceBatches / rawAttendanceRows)
//   - REUSE เฉพาะ type กลางที่ generic จริง: RawImportBatch / RawImportStatus /
//     RawParseError (provenance + format error — ไม่ผูก scan-event)
// =============================================================================

import type { RawImportBatch, RawImportStatus, RawParseError } from './types';

/** Firestore collections ของ attendance-template raw layer (แยกจาก scan-event) */
export const ATTENDANCE_IMPORT_COLLECTIONS = {
  BATCHES: 'rawAttendanceBatches',
  ROWS: 'rawAttendanceRows',
} as const;

/**
 * Required headers ตาม standard template (canonical display names)
 * ใช้โชว์ใน UI + ข้อความ validation "ไฟล์ไม่ตรง template"
 * รอบนี้ = ชุดเดียว ไม่มี alias หลายแบบ (ถ้า header ไม่ครบ → reject)
 */
export const REQUIRED_ATTENDANCE_HEADERS = [
  'EmployeeID',
  'Date',
  'Check in',
  'Check out',
] as const;

/** canonical field ภายในระบบ (ต่อ 1 required header) */
export type CanonicalAttendanceField =
  | 'employeeId'
  | 'date'
  | 'checkIn'
  | 'checkOut';

/**
 * ParsedAttendanceRow — ผลจาก parser ต่อ 1 แถว (ค่าดิบตาม column + provenance)
 * ยังไม่มี identity/persistence fields (เพิ่มตอนเขียน Firestore)
 *
 * กติกา raw:
 *   - employeeId เก็บเป็น string เสมอ (คง leading zero เช่น "000123" — ห้ามเป็น number)
 *   - date / checkIn / checkOut เก็บเป็น string ดิบตามที่อ่านจากไฟล์
 *     ห้าม convert timezone / parse เป็น business Date-Time / เดา IN/OUT
 *   - checkIn / checkOut = null เมื่อ cell ว่าง (ค่าว่างเป็นข้อมูลดิบที่ถูกต้อง)
 */
export interface ParsedAttendanceRow {
  rowNumber: number; // ลำดับแถวในไฟล์ (1-based, ไม่รวม header)
  employeeId: string; // column "EmployeeID" — ดิบ, string, คง leading zero
  date: string; // column "Date"       — ดิบ (string ตามไฟล์)
  checkIn: string | null; // column "Check in"   — ดิบ | null ถ้าว่าง
  checkOut: string | null; // column "Check out" — ดิบ | null ถ้าว่าง
  rawLine: string; // แถวต้นฉบับ best-effort (provenance) — ไม่ normalize
}

/**
 * RawAttendanceRow — ParsedAttendanceRow ที่ persist แล้ว (immutable)
 * Firestore: rawAttendanceRows/{id}  โดย id = `${batchId}_${rowNumber}`
 */
export interface RawAttendanceRow extends ParsedAttendanceRow {
  id: string; // `${batchId}_${rowNumber}`
  batchId: string; // ref -> RawImportBatch (rawAttendanceBatches)
  createdAt: Date;
}

/** ผลรวมจาก attendance parser — ยังไม่เขียน Firestore */
export interface AttendanceParseResult {
  header: string[]; // header ที่อ่านได้จริงจากไฟล์
  rows: ParsedAttendanceRow[]; // แถวที่ parse สำเร็จ
  errors: RawParseError[]; // แถวที่ parse ไม่ได้ (format เท่านั้น)
}

/** re-export type กลางที่ reuse เพื่อให้ layer ถัดไป import จากที่เดียว */
export type { RawImportBatch, RawImportStatus, RawParseError };
