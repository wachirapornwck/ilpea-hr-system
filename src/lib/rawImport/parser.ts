// =============================================================================
// src/lib/rawImport/parser.ts
// -----------------------------------------------------------------------------
// Fingerprint import parser — FORMAT ONLY. ไม่มี business logic.
//
// รองรับ 3 รูปแบบไฟล์ (ทุกแบบเป็น "scan event" ชุด field เดียวกัน:
//   No TMNo EnNo Name GMNo Mode DateTime):
//   1) Fingerprint quoted-tab CSV  — แต่ละบรรทัดครอบ " ... " ข้างในคั่นด้วย TAB, CRLF
//      (รูปแบบดั้งเดิมจากเครื่อง เช่น GLG_001.csv)
//   2) CSV มาตรฐาน (คั่นด้วย comma / tab, มี/ไม่มี quote) — parse ด้วย SheetJS
//   3) Excel .xlsx / .xls — parse ด้วย SheetJS
//
// Header เป็น NAME-BASED + ALIAS (ไม่สนลำดับ/ตัวพิมพ์/ช่องว่าง):
//   - normalize header cell = lowercase + ตัดอักขระที่ไม่ใช่ a-z0-9 ออก
//   - resolve เป็น index ของแต่ละ field ตาม FIELD_SPECS (first occurrence wins)
//   - ขาด required column ตัวใดตัวหนึ่ง = throw (ไฟล์ใช้ไม่ได้)
//   - column ส่วนเกิน = ignore
// เจตนา: ไฟล์ day-style (EmployeeID/Date/Check-in/Check-out) จะถูก reject เอง
//   เพราะหา Mode/DateTime (scan event) ไม่เจอ — ถูกต้องสำหรับ raw layer
//
// ทุกทางถูกแปลงเป็น "แถวของ cell" (string[][]) แล้ว map ด้วย logic เดียวกัน
// parser หน้าที่: อ่าน -> parse -> resolve header -> validate FORMAT -> คืนค่าดิบ
// parser ห้าม: map employee / calculate / classify / infer / normalize / timezone
// =============================================================================

import type { ParsedScanRow, RawParseError, RawParseResult } from './types';

// -----------------------------------------------------------------------------
// Header alias contract (approved) — field -> accepted headers (normalized)
// -----------------------------------------------------------------------------

/** field ของ ParsedScanRow ที่ต้อง resolve จาก header (ทุกตัว required) */
type RawField =
  | 'no'
  | 'tmNo'
  | 'enNo'
  | 'rawName'
  | 'gmNo'
  | 'mode'
  | 'dateTimeRaw';

interface FieldSpec {
  field: RawField;
  label: string; // ชื่อ canonical (ใช้ในข้อความ error)
  aliases: string[]; // normalized (lowercase, a-z0-9 only) — ต้องผ่าน normalizeHeaderCell แล้ว
}

/**
 * required 7 field — ลำดับในนี้ใช้เพื่อความอ่านง่าย/ข้อความเท่านั้น ไม่ได้บังคับลำดับใน header
 * NOTE: ห้ามเพิ่ม alias เชิงความหมายให้ mode (InOut/State) — mode ต้องเก็บดิบ
 *       และห้ามใส่ EmployeeID / Date / Check-in / Check-out / In / Out (day-style layer อื่น)
 */
const FIELD_SPECS: FieldSpec[] = [
  { field: 'no', label: 'No', aliases: ['no', 'index'] },
  {
    field: 'tmNo',
    label: 'TMNo',
    aliases: ['tmno', 'machineno', 'terminalno', 'deviceno'],
  },
  {
    field: 'enNo',
    label: 'EnNo',
    aliases: ['enno', 'employeeno', 'empno', 'empid'],
  },
  { field: 'rawName', label: 'Name', aliases: ['name'] },
  { field: 'gmNo', label: 'GMNo', aliases: ['gmno', 'groupno', 'deptno'] },
  { field: 'mode', label: 'Mode', aliases: ['mode'] },
  {
    field: 'dateTimeRaw',
    label: 'DateTime',
    aliases: ['datetime', 'scandatetime', 'scantime', 'timestamp'],
  },
];

/** normalized alias -> field (สร้างครั้งเดียว) */
const ALIAS_TO_FIELD: Record<string, RawField> = (() => {
  const map: Record<string, RawField> = {};
  for (const spec of FIELD_SPECS) {
    for (const alias of spec.aliases) {
      map[alias] = spec.field;
    }
  }
  return map;
})();

/** map field -> column index ที่ resolve ได้จาก header */
type FieldIndexMap = Record<RawField, number>;

/** normalize header cell: lowercase + ตัดทุกอย่างที่ไม่ใช่ a-z0-9 (No. / TM No / Date Time -> no/tmno/datetime) */
function normalizeHeaderCell(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// -----------------------------------------------------------------------------
// Header + row mapping (ใช้ร่วมกันทุกรูปแบบ)
// -----------------------------------------------------------------------------

/**
 * resolve header -> FieldIndexMap
 * - ไม่สนลำดับ/ตัวพิมพ์/ช่องว่าง
 * - alias ซ้ำ field เดิม: ใช้ตัวแรกที่เจอ (first occurrence wins)
 * - ขาด required field ใด ๆ -> throw (ไฟล์ใช้ไม่ได้)
 */
function resolveHeader(header: string[]): FieldIndexMap {
  const found: Partial<Record<RawField, number>> = {};

  header.forEach((cell, idx) => {
    const key = normalizeHeaderCell(cell);
    if (!key) return;
    const field = ALIAS_TO_FIELD[key];
    if (field !== undefined && found[field] === undefined) {
      found[field] = idx; // first occurrence wins
    }
  });

  const missing = FIELD_SPECS.filter((s) => found[s.field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Header ไม่ครบ: ขาดคอลัมน์ ${missing.map((s) => s.label).join(', ')}`
    );
  }

  return found as FieldIndexMap;
}

/** map cell 1 แถว -> ParsedScanRow (ค่าดิบล้วน) ตาม index ที่ resolve ไว้ */
function buildRow(
  cells: string[],
  cols: FieldIndexMap,
  rowNumber: number,
  rawLine: string
): ParsedScanRow {
  return {
    rowNumber,
    no: cells[cols.no],
    tmNo: cells[cols.tmNo],
    enNo: cells[cols.enNo],
    rawName: cells[cols.rawName],
    gmNo: cells[cols.gmNo],
    mode: cells[cols.mode],
    dateTimeRaw: cells[cols.dateTimeRaw], // เก็บ exact — ไม่ convert/split/timezone
    rawLine, // เก็บ exact (quoted-tab) / best-effort join (csv/xlsx)
  };
}

/**
 * แปลง array-of-arrays (header + data) เป็นผลลัพธ์มาตรฐาน
 * @param aoa แถวแรก = header, ที่เหลือ = data
 * @param rawLineFor คืน rawLine ของแต่ละ data row (index ตาม aoa)
 */
function mapAoa(
  aoa: string[][],
  rawLineFor: (dataIndex: number, cells: string[]) => string
): RawParseResult {
  if (aoa.length === 0) {
    throw new Error('ไฟล์ว่าง: ไม่มีข้อมูลให้ parse');
  }

  const header = aoa[0].map((h) => String(h ?? '').trim());
  const cols = resolveHeader(header); // throw ถ้า header ไม่ครบ
  const maxIndex = Math.max(...Object.values(cols)); // column สูงสุดที่ต้องมีในแต่ละแถว

  const rows: ParsedScanRow[] = [];
  const errors: RawParseError[] = [];

  for (let i = 1; i < aoa.length; i++) {
    const cells = aoa[i].map((c) => String(c ?? ''));
    const rowNumber = i; // 1-based ไม่รวม header
    const rawLine = rawLineFor(i, cells);

    // ข้ามแถวว่างล้วน (ไม่ถือเป็น error)
    if (cells.every((c) => c.trim() === '')) continue;

    // แถวสั้นเกินไป: cell ไม่พอถึง column ที่ต้อง map -> แถวเสีย (column เกินถูก ignore)
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
// Path 1: Fingerprint quoted-tab (custom)
// -----------------------------------------------------------------------------

/** แกะ quote ครอบบรรทัด แล้ว split ด้วย TAB (ไม่ trim ค่าภายใน) */
function splitQuotedTabLine(line: string): string[] {
  let s = line;
  if (s.endsWith('\r')) s = s.slice(0, -1);
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1);
  }
  return s.split('\t');
}

/** ตรวจว่าเนื้อไฟล์เป็น fingerprint quoted-tab หรือไม่ (บรรทัดแรกที่ไม่ว่าง) */
function looksLikeFingerprint(content: string): boolean {
  for (const raw of content.split('\n')) {
    const s = raw.replace('\r', '').trim();
    if (s === '') continue;
    return s.startsWith('"') && s.endsWith('"') && s.includes('\t');
  }
  return false;
}

/**
 * parse รูปแบบ fingerprint quoted-tab (คงพฤติกรรมเดิม 100%)
 * export ไว้เพื่อ backward-compat / เรียกตรงได้
 */
export function parseFingerprintExport(content: string): RawParseResult {
  const rawLines = content.split('\n');
  const lines = rawLines.filter(
    (l, i) => !(i === rawLines.length - 1 && l.replace('\r', '') === '')
  );

  const aoa = lines.map((l) => splitQuotedTabLine(l));
  const rawLineOf = (i: number) => {
    const o = lines[i];
    return o.endsWith('\r') ? o.slice(0, -1) : o;
  };
  return mapAoa(aoa, (i) => rawLineOf(i));
}

// -----------------------------------------------------------------------------
// Path 2 & 3: Standard CSV / Excel via SheetJS
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
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false, // คืนค่าเป็นข้อความตามที่แสดง (ไม่แปลงเป็น Date object)
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
  // magic bytes: xlsx = zip (PK\x03\x04), xls = D0 CF 11 E0
  if (bytes.length >= 4) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return true; // PK
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return true; // xls (OLE)
  }
  return false;
}

/**
 * parse ไฟล์ import (รองรับ fingerprint quoted-tab / CSV มาตรฐาน / xlsx)
 * @param fileName ชื่อไฟล์ (ใช้ช่วยเดา format)
 * @param bytes    bytes ต้นฉบับทั้งไฟล์
 * @throws Error เมื่อ "ไฟล์ใช้ไม่ได้" (ว่าง / ไม่มี sheet / header ไม่ครบ)
 */
export async function parseImportFile(
  fileName: string,
  bytes: Uint8Array
): Promise<RawParseResult> {
  // 1) Excel
  if (isXlsxFile(fileName, bytes)) {
    const aoa = await readSheetAoa(bytes, 'array');
    return mapAoa(aoa, (_i, cells) => cells.join('\t'));
  }

  // 2) Text
  const content = new TextDecoder('utf-8').decode(bytes);

  // 2a) Fingerprint quoted-tab (พฤติกรรมเดิม)
  if (looksLikeFingerprint(content)) {
    return parseFingerprintExport(content);
  }

  // 2b) CSV มาตรฐาน (comma / tab, มี/ไม่มี quote) ผ่าน SheetJS
  const aoa = await readSheetAoa(content, 'string');
  return mapAoa(aoa, (_i, cells) => cells.join(','));
}

// -----------------------------------------------------------------------------
// Checksum
// -----------------------------------------------------------------------------

/** SHA-256 checksum ของ bytes ต้นฉบับทั้งไฟล์ (hex) */
export async function computeChecksum(
  bytes: ArrayBuffer | Uint8Array
): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
