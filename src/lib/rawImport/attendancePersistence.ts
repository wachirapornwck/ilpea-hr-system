// =============================================================================
// src/lib/rawImport/attendancePersistence.ts
// -----------------------------------------------------------------------------
// HR Standard Attendance Import persistence — เขียน batch + rows (IMMUTABLE).
//
// mirror pattern ของ persistRawImport (scan-event) ทุกอย่าง แต่เก็บ day-style row
// (EmployeeID | Date | Check in | Check out) ลง collection ของตัวเอง:
//   rawAttendanceBatches / rawAttendanceRows  (แยกจาก rawScanRows โดยสมบูรณ์)
//
// ยึด C1 rules:
//   - Raw immutable: get-then-set — ถ้า batch (checksum เดียวกัน) มีแล้ว = throw
//   - HR-only: importedBy = userId จาก session (caller derive มาแล้ว ไม่ trust client)
//   - batchId = checksum -> กัน import ไฟล์เดิมซ้ำ (idempotent ระดับไฟล์)
//   - ไม่มี derived field / ไม่ map / ไม่ late / ไม่ shift / ไม่แตะ attendance collection
//
// NOTE: get-then-set ไม่ atomic (by design เดียวกับ persistRawImport) — งาน HR
//       รายเดือน โอกาสชนน้อย + checksum กันซ้ำอยู่แล้ว
// =============================================================================

import { adminDb } from '@/lib/firebase/admin';
import {
  ATTENDANCE_IMPORT_COLLECTIONS,
  type ParsedAttendanceRow,
  type RawImportBatch,
  type RawImportStatus,
} from './attendanceImportTypes';

/** input สำหรับ persist (endpoint ชั้นบนเตรียมให้ครบ — identity มาจาก session แล้ว) */
export interface PersistAttendanceImportInput {
  fileName: string;
  fileChecksum: string; // SHA-256 hex (จาก computeChecksum)
  importedBy: string; // userId (HR) — derived จาก session โดย caller
  rows: ParsedAttendanceRow[]; // แถวที่ parse + validate ผ่าน
  errorCount: number; // จำนวนแถวที่ถูกข้าม (จาก validation)
}

const WRITE_CHUNK_SIZE = 400; // < 500 (ขีดจำกัด batch) เผื่อ safety

function deriveStatus(
  parsedCount: number,
  errorCount: number
): RawImportStatus {
  if (parsedCount === 0) return 'failed';
  if (errorCount > 0) return 'partial';
  return 'parsed';
}

/**
 * เขียน batch + attendance rows แบบ immutable
 * @throws ถ้า batch (checksum เดียวกัน) ถูก import ไปแล้ว — กัน raw ซ้ำ
 */
export async function persistAttendanceImport(
  input: PersistAttendanceImportInput
): Promise<RawImportBatch> {
  const { fileName, fileChecksum, importedBy, rows, errorCount } = input;

  if (!importedBy) {
    throw new Error(
      'persistAttendanceImport: importedBy (session userId) ต้องไม่ว่าง'
    );
  }

  // batchId ผูกกับ checksum ของไฟล์ -> import ไฟล์เดิมซ้ำจะถูกปฏิเสธ
  const batchId = fileChecksum;
  const now = new Date();
  const parsedCount = rows.length;

  const batch: RawImportBatch = {
    id: batchId,
    fileName,
    fileChecksum,
    importedBy,
    importedAt: now,
    rowCount: parsedCount + errorCount,
    parsedCount,
    errorCount,
    status: deriveStatus(parsedCount, errorCount),
  };

  const batchRef = adminDb
    .collection(ATTENDANCE_IMPORT_COLLECTIONS.BATCHES)
    .doc(batchId);

  // immutable: เช็คก่อน ถ้ามีอยู่แล้ว (ไฟล์เดิมถูก import ซ้ำ) = ปฏิเสธ ไม่ overwrite
  const existing = await batchRef.get();
  if (existing.exists) {
    throw new Error(
      `ไฟล์นี้ถูก import ไปแล้ว (checksum ${batchId}) — raw ห้ามเขียนทับ`
    );
  }

  await batchRef.set(batch);

  // เขียน attendance rows แบบ chunk (id = ${batchId}_${rowNumber}; batch เพิ่งยืนยันว่าไม่มีมาก่อน)
  const rowCol = adminDb.collection(ATTENDANCE_IMPORT_COLLECTIONS.ROWS);
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const writer = adminDb.batch();
    for (const row of chunk) {
      const id = `${batchId}_${row.rowNumber}`;
      writer.set(rowCol.doc(id), {
        id,
        batchId,
        rowNumber: row.rowNumber,
        employeeId: row.employeeId, // ดิบ, string (คง leading zero)
        date: row.date, // ดิบ
        checkIn: row.checkIn, // ดิบ | null
        checkOut: row.checkOut, // ดิบ | null
        rawLine: row.rawLine,
        createdAt: now,
      });
    }
    await writer.commit();
  }

  return batch;
}
