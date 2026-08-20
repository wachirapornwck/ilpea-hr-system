// =============================================================================
// src/lib/rawImport/attendanceParser.ts
// -----------------------------------------------------------------------------
// Parser ของ HR Standard Attendance Import — FORMAT ONLY. ไม่มี business logic.
//
// รองรับ 2 รูปแบบไฟล์ (ทั้งคู่เป็น standard template ที่ HR เตรียมมา):
//   1) CSV มาตรฐาน (comma/tab, มี/ไม่มี quote) — parse ด้วย SheetJS
//   2) Excel .xlsx / .xls — parse ด้วย SheetJS
//   (fingerprint quoted-tab เป็นของ legacy scan-event path — ไม่เกี่ยวกับไฟล์นี้)
//
// Required headers = FIXED template ชุดเดียว (ไม่มี alias หลายแบบ):
//   EmployeeID | Date | Check in | Check out
//   - อ่าน header ตาม "ชื่อ" ไม่อิงตำแหน่ง (สลับลำดับได้)
//   - normalize เฉพาะ format ที่ไม่เปลี่ยนความหมาย: lowercase + ตัด non-a-z0-9
//     (จึงยอมรับ "Employee ID" / "Check-in" / "check out" ว่าตรง canonical เดียวกัน)
//   - ขาด required column / มีซ้ำ → throw (ไฟล์ไม่ตรง template = reject ทั้งไฟล์)
//   - column ส่วนเกิน → ignore
//
// กติกา raw (ห้ามตีความ):
//   - employeeId/date/checkIn/checkOut เก็บค่าดิบตามไฟล์ (string)
//   - employeeId คง leading zero (string เสมอ ไม่ parse number)
//   - checkIn/checkOut = null เมื่อ cell ว่าง
//   - ห้าม timezone/late/shift/status/pairing/mapping/dedup
// =============================================================================

import type {
  AttendanceParseResult,
  CanonicalAttendanceField,
  ParsedAttendanceRow,
  RawParseError,
} from './attendanceImportTypes';

// -----------------------------------------------------------------------------
// Header contract (fixed template — ไม่มี alias หลายแบบ)
// -----------------------------------------------------------------------------

/** normalized header (lowercase + a-z0-9) -> canonical field */
const HEADER_MAP: Record<string, CanonicalAttendanceField> = {
  employeeid: 'employeeId',
  date: 'date',
  checkin: 'checkIn',
  checkout: 'checkOut',
};

/** canonical field -> display name (ใช้ในข้อความ error ให้ HR อ่านรู้เรื่อง) */
const CANONICAL_DISPLAY: Record<CanonicalAttendanceField, string> = {
  employeeId: 'EmployeeID',
  date: 'Date',
  checkIn: 'Check in',
  checkOut: 'Check out',
};

const REQUIRED_FIELDS: CanonicalAttendanceField[] = [
  'employeeId',
  'date',
  'checkIn',
  'checkOut',
];

/** map field -> column index ที่ resolve ได้จาก header */
type FieldIndexMap = Record<CanonicalAttendanceField, number>;

/** normalize header cell: ตัด BOM + lowercase + ตัดทุกอย่างที่ไม่ใช่ a-z0-9 */
function normalizeHeaderCell(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** '' หรือ whitespace ล้วน -> null (ค่าว่างเป็นข้อมูลดิบที่ถูกต้อง); อื่น ๆ คืนค่าดิบ */
function blankToNull(raw: string): string | null {
  return raw.trim() === '' ? null : raw;
}

/**
 * resolve header -> FieldIndexMap
 * - ไม่สนลำดับ/ตัวพิมพ์/ช่องว่าง/`_`/`-`
 * - ขาด required / มีซ้ำ -> throw (reject ทั้งไฟล์ ตาม template)
 */
function resolveAttendanceHeader(header: string[]): FieldIndexMap {
  const found: Partial<Record<CanonicalAttendanceField, number>> = {};
  const duplicates: CanonicalAttendanceField[] = [];

  header.forEach((cell, idx) => {
    const key = normalizeHeaderCell(cell);
    if (!key) return;
    const field = HEADER_MAP[key];
    if (field === undefined) return; // column ที่ไม่ใช่ template -> ignore
    if (found[field] === undefined) {
      found[field] = idx;
    } else if (!duplicates.includes(field)) {
      duplicates.push(field);
    }
  });

  const missing = REQUIRED_FIELDS.filter((f) => found[f] === undefined);

  if (missing.length > 0 || duplicates.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(
        `ขาดคอลัมน์: ${missing.map((f) => CANONICAL_DISPLAY[f]).join(', ')}`
      );
    }
    if (duplicates.length > 0) {
      parts.push(
        `คอลัมน์ซ้ำ: ${duplicates.map((f) => CANONICAL_DISPLAY[f]).join(', ')}`
      );
    }
    throw new Error(
      `ไฟล์ไม่ตรง import template (ต้องมี: ${REQUIRED_FIELDS.map(
        (f) => CANONICAL_DISPLAY[f]
      ).join(' | ')}) — ${parts.join(' | ')}`
    );
  }

  return found as FieldIndexMap;
}

// -----------------------------------------------------------------------------
// Row mapping (ใช้ร่วมทุกรูปแบบ)
// -----------------------------------------------------------------------------

function buildRow(
  cells: string[],
  cols: FieldIndexMap,
  rowNumber: number,
  rawLine: string
): ParsedAttendanceRow {
  return {
    rowNumber,
    employeeId: cells[cols.employeeId], // ดิบ, string (คง leading zero)
    date: cells[cols.date], // ดิบ
    checkIn: blankToNull(cells[cols.checkIn]),
    checkOut: blankToNull(cells[cols.checkOut]),
    rawLine,
  };
}

/**
 * แปลง array-of-arrays (header + data) -> AttendanceParseResult
 * @param aoa แถวแรก = header, ที่เหลือ = data
 * @param rawLineFor คืน rawLine ของแต่ละ data row
 */
function mapAoa(
  aoa: string[][],
  rawLineFor: (dataIndex: number, cells: string[]) => string
): AttendanceParseResult {
  if (aoa.length === 0) {
    throw new Error('ไฟล์ว่าง: ไม่มีข้อมูลให้ parse');
  }

  const header = aoa[0].map((h) => String(h ?? '').trim());
  const cols = resolveAttendanceHeader(header); // throw ถ้า header ไม่ตรง template
  const maxIndex = Math.max(...Object.values(cols));

  const rows: ParsedAttendanceRow[] = [];
  const errors: RawParseError[] = [];

  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i].map((c) => String(c ?? ''));
    const rowNumber = i; // 1-based ไม่รวม header
    const rawLine = rawLineFor(i, cells);

    // ข้ามแถวว่างล้วน (ไม่ถือเป็น error)
    if (cells.every((c) => c.trim() === '')) continue;

    // แถวสั้นเกินไป: cell ไม่พอถึง column ที่ต้อง map -> แถวเสีย (format)
    if (cells.length < maxIndex + 1) {
      errors.push({
        rowNumber,
        rawLine,
        message: `แถวเสีย: ต้องมีอย่างน้อย ${
          maxIndex + 1
        } column (ตาม header) พบ ${cells.length}`,
      });
      continue;
    }

    rows.push(buildRow(cells, cols, rowNumber, rawLine));
  }

  return { header, rows, errors };
}

// -----------------------------------------------------------------------------
// SheetJS reader (CSV / XLSX)
// -----------------------------------------------------------------------------

/** อ่าน sheet แรกเป็น array-of-arrays (string) */
async function readSheetAoa(
  data: Uint8Array | string,
  type: 'array' | 'string'
): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(data, { type });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('ไฟล์ไม่มี sheet ข้อมูล');
  }
  const sheet = workbook.Sheets[sheetName];
  // raw:false = คืนค่าตามที่ "แสดง" ในไฟล์ (คงหน้าตาที่ HR เห็นมากที่สุด)
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  return aoa.map((row) => (row as unknown[]).map((c) => String(c ?? '')));
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

function isXlsxFile(fileName: string, bytes: Uint8Array): boolean {
  if (/\.(xlsx|xls)$/i.test(fileName)) return true;
  if (bytes.length >= 2) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true; // PK (xlsx zip)
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return true; // xls (OLE)
  }
  return false;
}

/**
 * parse ไฟล์ standard attendance template (CSV / XLSX)
 * @throws Error เมื่อ "ไฟล์ใช้ไม่ได้" (ว่าง / ไม่มี sheet / header ไม่ตรง template)
 */
export async function parseAttendanceImport(
  fileName: string,
  bytes: Uint8Array
): Promise<AttendanceParseResult> {
  // 1) Excel
  if (isXlsxFile(fileName, bytes)) {
    const aoa = await readSheetAoa(bytes, 'array');
    return mapAoa(aoa, (_i, cells) => cells.join('\t'));
  }

  // 2) CSV (text) — ตัด BOM แล้วให้ SheetJS parse (รองรับ quoted comma)
  const content = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  const aoa = await readSheetAoa(content, 'string');
  return mapAoa(aoa, (_i, cells) => cells.join(','));
}
