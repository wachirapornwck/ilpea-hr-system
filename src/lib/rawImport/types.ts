// =============================================================================
// src/lib/rawImport/types.ts
// -----------------------------------------------------------------------------
// Raw Fingerprint Import Layer — IMMUTABLE EVIDENCE.
//
// Raw = หลักฐานดิบจากเครื่องสแกนนิ้ว ห้าม mutate/enrich/normalize business meaning.
// ชั้นนี้ต้องไม่มี derived field ใดๆ (status, dayType, shift, mapping, late,
// working hours, overtime, duplicate, holiday, leave, payroll) — เป็น C2/C3/C4+.
//
// Verified fingerprint export columns (จากไฟล์จริง GLG_001.csv):
//   No | TMNo | EnNo | Name | GMNo | Mode | DateTime
//   - quoted-line, tab-delimited, CRLF
//   - EnNo = ตัวเลข 6 หลัก | Name ว่างหรือ = EnNo (ใช้ระบุตัวไม่ได้)
//   - Mode = 0 ตลอด (เก็บ raw — ห้ามใช้ตัดสิน IN/OUT)
// =============================================================================

/** Firestore collections ของ raw layer (self-contained — ไม่แตะ attendance) */
export const RAW_IMPORT_COLLECTIONS = {
  BATCHES: 'rawImportBatches',
  SCAN_ROWS: 'rawScanRows',
} as const;

/** สถานะการ parse ของทั้ง batch (ระดับไฟล์ ไม่ใช่ business validation) */
export type RawImportStatus = 'parsed' | 'partial' | 'failed';

/**
 * RawImportBatch — 1 ไฟล์ / 1 import
 * immutable หลังเขียน (audit + reprocess ต้องย้อนดูได้ว่านำเข้าอะไรจริง)
 * Firestore: rawImportBatches/{id}
 */
export interface RawImportBatch {
  id: string; // batchId
  fileName: string; // ชื่อไฟล์ที่ HR upload
  fileChecksum: string; // SHA-256 hex ของ bytes ต้นฉบับทั้งไฟล์
  importedBy: string; // userId (HR) — ต้องมาจาก authenticated session
  importedAt: Date;
  rowCount: number; // จำนวนแถวข้อมูล (ไม่รวม header)
  parsedCount: number; // แถวที่ parse สำเร็จ
  errorCount: number; // แถวที่ parse error
  status: RawImportStatus;
}

/**
 * ParsedScanRow — ผลจาก parser ต่อ 1 แถว
 * เก็บ "ค่าดิบตาม column เครื่อง" เท่านั้น + provenance
 * ยังไม่มี identity/persistence fields (เพิ่มตอนเขียน Firestore)
 */
export interface ParsedScanRow {
  rowNumber: number; // ลำดับแถวในไฟล์ (1-based, ไม่รวม header)
  no: string; // column "No"      — ดิบ
  tmNo: string; // column "TMNo"   — machine id (ดิบ)
  enNo: string; // column "EnNo"   — รหัสบนเครื่อง (ดิบ)
  rawName: string; // column "Name" — ว่าง/=EnNo (ใช้ระบุตัวไม่ได้)
  gmNo: string; // column "GMNo"   — group id (ดิบ)
  mode: string; // column "Mode"   — เก็บดิบ ห้ามใช้ตัดสิน IN/OUT
  dateTimeRaw: string; // column "DateTime" — string ตรงจากไฟล์ ห้าม convert/timezone/split
  rawLine: string; // บรรทัดต้นฉบับ exact — ห้าม normalize/reorder
}

/**
 * RawScanRow — ParsedScanRow ที่ persist แล้ว (immutable)
 * Firestore: rawScanRows/{id}  โดย id = `${batchId}_${rowNumber}`
 */
export interface RawScanRow extends ParsedScanRow {
  id: string; // `${batchId}_${rowNumber}`
  batchId: string; // ref -> RawImportBatch
  createdAt: Date;
}

/** ข้อผิดพลาดระดับ parse (format) — แยกจาก business validation (ไม่อยู่ใน C1) */
export interface RawParseError {
  rowNumber: number;
  rawLine: string;
  message: string; // เหตุผลเชิง format เท่านั้น เช่น column ไม่ครบ/แถวเสีย
}

/** ผลรวมจาก parser — ยังไม่เขียน Firestore */
export interface RawParseResult {
  header: string[]; // header ที่อ่านได้จริงจากไฟล์
  rows: ParsedScanRow[]; // แถวที่ parse สำเร็จ
  errors: RawParseError[]; // แถวที่ parse ไม่ได้
}
