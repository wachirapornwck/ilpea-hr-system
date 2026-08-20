// =============================================================================
// src/lib/rawImport/persistence.ts
// -----------------------------------------------------------------------------
// Raw Import persistence — เขียน RawImportBatch + RawScanRow (IMMUTABLE).
//
// ยึดตาม C1 rules:
//   - Raw immutable: เช็ค exists ก่อนเขียน (get-then-set) — ถ้ามีอยู่แล้ว = throw
//     (adminDb เป็น REST wrapper ที่ไม่มี .create(); ใช้ pattern เดียวกับ
//      employee import: get -> ถ้าไม่มีค่อย set, ไม่ overwrite ของเดิม)
//   - HR-only: importedBy ต้องเป็น userId จาก authenticated session (caller ส่งมา
//              — endpoint ชั้นบนเป็นคน derive จาก session, persistence ไม่ trust client)
//   - batchId = checksum-based กัน import ไฟล์เดิมซ้ำ (idempotent ที่ระดับไฟล์)
//   - ไม่มี derived field / ไม่แตะ collection attendance
//
// NOTE: get-then-set ไม่ atomic (เช่นเดียวกับ employee import ที่เป็น by design)
//       — raw import เป็นงาน HR รายเดือน โอกาสชนน้อย และ checksum กันซ้ำอยู่แล้ว
// =============================================================================

import { adminDb } from '@/lib/firebase/admin';
import {
  RAW_IMPORT_COLLECTIONS,
  type ParsedScanRow,
  type RawImportBatch,
  type RawImportStatus,
} from './types';

/** input สำหรับ persist (endpoint ชั้นบนเตรียมให้ครบ — identity มาจาก session แล้ว) */
export interface PersistRawImportInput {
  fileName: string;
  fileChecksum: string; // SHA-256 hex (จาก computeChecksum)
  importedBy: string; // userId (HR) — derived จาก session โดย caller
  rows: ParsedScanRow[]; // แถวที่ parse สำเร็จ
  errorCount: number; // จำนวนแถว parse error (จาก parser)
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
 * เขียน batch + scan rows แบบ immutable
 * @throws ถ้า batch (checksum เดียวกัน) ถูก import ไปแล้ว — กัน raw ซ้ำ
 */
export async function persistRawImport(
  input: PersistRawImportInput
): Promise<RawImportBatch> {
  const { fileName, fileChecksum, importedBy, rows, errorCount } = input;

  if (!importedBy) {
    throw new Error(
      'persistRawImport: importedBy (session userId) ต้องไม่ว่าง'
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
    .collection(RAW_IMPORT_COLLECTIONS.BATCHES)
    .doc(batchId);

  // immutable: เช็คก่อน ถ้ามีอยู่แล้ว (ไฟล์เดิมถูก import ซ้ำ) = ปฏิเสธ ไม่ overwrite
  const existing = await batchRef.get();
  if (existing.exists) {
    throw new Error(
      `ไฟล์นี้ถูก import ไปแล้ว (checksum ${batchId}) — raw ห้ามเขียนทับ`
    );
  }

  await batchRef.set(batch);

  // เขียน scan rows แบบ chunk (id ไม่ซ้ำ = ${batchId}_${rowNumber}; batch เพิ่งยืนยันว่าไม่มีมาก่อน)
  const scanCol = adminDb.collection(RAW_IMPORT_COLLECTIONS.SCAN_ROWS);
  for (let i = 0; i < rows.length; i += WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + WRITE_CHUNK_SIZE);
    const writer = adminDb.batch();
    for (const row of chunk) {
      const id = `${batchId}_${row.rowNumber}`;
      writer.set(scanCol.doc(id), {
        id,
        batchId,
        rowNumber: row.rowNumber,
        no: row.no,
        tmNo: row.tmNo,
        enNo: row.enNo,
        rawName: row.rawName,
        gmNo: row.gmNo,
        mode: row.mode,
        dateTimeRaw: row.dateTimeRaw,
        rawLine: row.rawLine,
        createdAt: now,
      });
    }
    await writer.commit();
  }

  return batch;
}
