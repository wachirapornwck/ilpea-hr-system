// =============================================================================
// src/lib/rawImport/validation.ts
// -----------------------------------------------------------------------------
// Raw Import — FORMAT VALIDATION ONLY.
//
// รอบ C1 ตรวจได้เฉพาะระดับ "ไฟล์/รูปแบบ":
//   - ไฟล์อ่านได้และมีข้อมูล
//   - column ครบตาม verified format
//   - แถวเสีย (malformed) / parse error
//
// ห้ามทำ business validation (ไม่อยู่ใน C1):
//   - ห้ามเช็คว่า enNo map กับ employee ได้ไหม   (C2)
//   - ห้ามตีความ mode / IN-OUT                    (C3)
//   - ห้ามตรวจ duplicate / วันที่เชิงธุรกิจ / shift (C3/C4)
// =============================================================================

import type { RawParseResult } from './types';

/** ผลตรวจ format ของทั้งไฟล์ (ก่อน HR ตัดสินใจ commit) */
export interface RawImportValidation {
  /** ไฟล์นี้พอจะ commit ได้ไหม (ระดับ format) */
  ok: boolean;
  /** จำนวนแถวข้อมูลที่ parse สำเร็จ */
  parsedCount: number;
  /** จำนวนแถวที่ parse error (format) */
  errorCount: number;
  /** ข้อความสรุปเชิง format ที่ hard-block การ commit (เช่นไม่มีข้อมูลเลย) */
  blockingErrors: string[];
  /** คำเตือนที่ไม่ block (เช่น มีบางแถวเสียแต่ยัง commit ส่วนที่ดีได้) */
  warnings: string[];
}

/**
 * ตรวจผลจาก parseFingerprintExport (format-level)
 * - ไม่มี row สำเร็จเลย        -> blocking (commit ไม่ได้)
 * - มี row เสียบางส่วน         -> warning (commit ส่วนที่ดีได้ / raw เก็บทุกอย่าง)
 * หมายเหตุ: header ผิด/ไฟล์ว่าง parser จะ throw ตั้งแต่ parse แล้ว
 */
export function validateParseResult(
  result: RawParseResult
): RawImportValidation {
  const parsedCount = result.rows.length;
  const errorCount = result.errors.length;

  const blockingErrors: string[] = [];
  const warnings: string[] = [];

  if (parsedCount === 0) {
    blockingErrors.push('ไม่มีแถวข้อมูลที่ parse สำเร็จ — commit ไม่ได้');
  }

  if (errorCount > 0) {
    warnings.push(
      `พบแถวเสีย (format) ${errorCount} แถว — จะไม่ถูก commit; แถวที่ parse สำเร็จ ${parsedCount} แถวยัง commit ได้`
    );
  }

  return {
    ok: blockingErrors.length === 0,
    parsedCount,
    errorCount,
    blockingErrors,
    warnings,
  };
}
