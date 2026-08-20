// =============================================================================
// src/lib/rawImport/attendanceValidation.ts
// -----------------------------------------------------------------------------
// Validation ของ HR Standard Attendance Import — FORMAT / DATA-SHAPE ONLY.
//
// ทำงานบนผลของ attendanceParser (AttendanceParseResult) หลัง parse สำเร็จ
// header-level (required/duplicate/ไม่ตรง template) ถูกจัดการใน parser แล้ว
// (resolveAttendanceHeader throw) — ชั้นนี้จึงดูแค่ระดับ "แถว/ค่า"
//
// กติกา (ห้ามมี business logic):
//   - ตรวจได้: required value ว่าง (EmployeeID/Date), EmployeeID เป็น string
//     ที่ไม่ว่าง, row-level parse error, ไม่มีแถวใช้ได้เลย
//   - ห้ามตรวจ: รูปแบบวันที่/เวลาเชิงธุรกิจ, late, shift, status, IN/OUT pairing,
//     employee mapping, duplicate เชิง business
//   - checkIn/checkOut ว่างได้ (raw) — นับเป็น warning เท่านั้น ไม่ block
// =============================================================================

import type {
  AttendanceParseResult,
  ParsedAttendanceRow,
  RawParseError,
} from './attendanceImportTypes';

/** ผลการ validate ระดับไฟล์ (format/data-shape) */
export interface AttendanceValidationResult {
  ok: boolean; // ผ่านเกณฑ์ commit ได้หรือไม่ (ไม่มี blocking error)
  blockingErrors: string[]; // ระดับไฟล์ — ถ้ามี ห้าม commit
  warnings: string[]; // เตือน แต่ยัง commit ได้ (เช่น checkIn/checkOut ว่างบางแถว)
  rowErrors: RawParseError[]; // ระดับแถว (parse error + required value ว่าง)
}

/** ค่าถือว่า "ว่าง" เมื่อ null หรือ trim แล้วเป็นสตริงว่าง */
function isBlank(value: string | null): boolean {
  return value === null || value.trim() === '';
}

/**
 * ตรวจ required value ระดับแถว (format เท่านั้น)
 * required = EmployeeID, Date ; checkIn/checkOut ไม่ required (raw ว่างได้)
 * คืน message ถ้าแถวเสีย, คืน null ถ้าผ่าน
 */
function validateRow(row: ParsedAttendanceRow): string | null {
  const missing: string[] = [];
  if (isBlank(row.employeeId)) missing.push('EmployeeID');
  if (isBlank(row.date)) missing.push('Date');

  if (missing.length > 0) {
    return `ค่าที่จำเป็นว่าง: ${missing.join(', ')}`;
  }
  return null;
}

/**
 * validate ผลจาก attendanceParser
 * - รวม parse error (จาก parser) เข้ากับ row error (required value ว่าง)
 * - block เมื่อ: ไม่มีแถวใช้ได้เลย
 */
export function validateAttendanceParse(
  result: AttendanceParseResult
): AttendanceValidationResult {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  // เริ่มจาก parse error ที่ parser รายงานมา (แถวเสียเชิง format)
  const rowErrors: RawParseError[] = [...result.errors];

  let validRowCount = 0;
  let missingCheckCount = 0;

  for (const row of result.rows) {
    const rowError = validateRow(row);
    if (rowError) {
      rowErrors.push({
        rowNumber: row.rowNumber,
        rawLine: row.rawLine,
        message: rowError,
      });
      continue;
    }

    validRowCount += 1;
    // raw: checkIn/checkOut ว่างได้ — เตือนเฉย ๆ ไม่ block
    if (isBlank(row.checkIn) || isBlank(row.checkOut)) {
      missingCheckCount += 1;
    }
  }

  if (result.rows.length === 0 && result.errors.length === 0) {
    blockingErrors.push('ไม่มีข้อมูลในไฟล์ (มีแต่ header หรือไฟล์ว่าง)');
  }

  if (validRowCount === 0) {
    blockingErrors.push(
      'ไม่มีแถวที่นำเข้าได้ (ทุกแถวมีปัญหารูปแบบ/ค่าจำเป็นว่าง)'
    );
  }

  if (missingCheckCount > 0) {
    warnings.push(
      `${missingCheckCount} แถวมี Check in หรือ Check out ว่าง (นำเข้าเป็นค่าดิบตามไฟล์)`
    );
  }

  if (rowErrors.length > 0) {
    warnings.push(`${rowErrors.length} แถวถูกข้าม (ดูรายละเอียดด้านล่าง)`);
  }

  return {
    ok: blockingErrors.length === 0,
    blockingErrors,
    warnings,
    rowErrors,
  };
}
