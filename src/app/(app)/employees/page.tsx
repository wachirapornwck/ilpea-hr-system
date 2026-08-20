'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { useEmployees } from '@/lib/hooks/useEmployees';
import type { EmployeeType, EmploymentStatus } from '@/types';
import {
  computeBirthdayPin,
  escapeCsvField,
  toLocalDateStr,
  isEmptyImportRow,
} from '@/lib/employees/importConstants';
import type { ImportNormalizedRow } from '@/lib/employees/importTypes';

const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  blue_collar: 'Blue Collar',
  white_collar: 'White Collar',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'ปกติ',
  inactive: 'ระงับแล้ว',
};

const STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-600',
};

const SHIFT_LABEL: Record<string, string> = {
  DAY: 'กะเช้า',
  NIGHT: 'กะดึก',
  MAID: 'กะแม่บ้าน',
};

const BULK_RESET_CHUNK_SIZE = 8;

// Splits an array into fixed-size chunks — used for controlled concurrency
// in bulk PIN reset (Promise.allSettled per chunk, chunks run sequentially).
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface BulkResetFailure {
  employeeLabel: string; // employeeId, falls back to internal id if unknown
  name: string;
  message: string;
}

interface BulkResetSkipped {
  employeeLabel: string;
  name: string;
  reason: string;
}

interface BulkResetResult {
  success: number;
  failed: BulkResetFailure[];
  skipped: BulkResetSkipped[];
}

type BulkResetMode = 'custom' | 'birthday' | 'random';

// Generates `count` random 6-digit PINs that are unique within this one
// batch only (no database uniqueness check, per Phase 5 scope).
function generateUniqueRandomPins(count: number): string[] {
  const pins = new Set<string>();
  while (pins.size < count) {
    pins.add(String(Math.floor(Math.random() * 1000000)).padStart(6, '0'));
  }
  return Array.from(pins);
}

// ── Step 6 — response shapes of the two Import endpoints ──────────────
// Mirrors what POST /api/employees/import/validate and
// POST /api/employees/import return in their `data` field.
interface ValidateApiRow {
  rowNumber: number;
  employeeId: string;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  isDuplicate: boolean;
  normalized: ImportNormalizedRow;
}

interface ValidateApiResult {
  headerErrors: string[];
  rows: ValidateApiRow[];
  summary: { valid: number; warning: number; error: number; duplicate: number };
  totalRows: number;
  willCreate?: number;
  canImport: boolean;
}

interface ImportApiRow {
  rowNumber: number;
  employeeId: string;
  outcome: 'created' | 'skipped' | 'failed';
  reason?: string;
}

interface ImportApiResult {
  summary: { created: number; skipped: number; failed: number };
  totalRows: number;
  rows: ImportApiRow[];
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isHR = user?.role === 'admin' || user?.role === 'hr_manager';

  const {
    employees,
    total,
    page,
    hasMore,
    loading,
    error,
    filters,
    setFilters,
    setPage,
    refresh,
  } = useEmployees();

  // ── Employee Import (Phase 1) — UI placeholder only, no file/parse/API
  // logic yet. Deferred to later phases.
  const [showImportModal, setShowImportModal] = useState(false);
  // Phase 2 Step 1 — file is captured into state only. No extension/MIME
  // validation yet (that's Step 2) and no file-content reading (Phase 3).
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Phase 3 — raw preview data only (header row + subsequent rows as-is).
  // No validation, no column mapping, no import yet.
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  // เลขแถวจริงในไฟล์ของแต่ละแถวใน previewRows (index ตรงกัน)
  // เก็บแยกเป็น array คู่ขนาน แทนการเปลี่ยน previewRows เป็น object[] —
  // previewRows ถูกส่งให้ API ตรงๆ จึงต้องคงรูปเป็น string[][] ไว้
  const [previewRowNumbers, setPreviewRowNumbers] = useState<number[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleOpenImportModal = () => {
    setShowImportModal(true);
    setShowImportModal(true);
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    setSelectedFile(null);
    setFileError(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewRowNumbers([]);
    setPreviewError(null);
    setLoadingPreview(false);
    setValidating(false);
    setValidateResult(null);
    setImporting(false);
    setImportResult(null);
    setImportApiError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // NOTE: this page no longer fetches departments/positions for Import.
  // Step 6 moved business validation to the server, and both Import
  // endpoints load master data themselves — validating against whatever
  // the client had cached would risk disagreeing with the server.

  // ── Step 6 — server validation is the single source of truth ────────
  // Business validation is NOT run on the client any more. The client only
  // parses the file; POST /api/employees/import/validate re-runs the shared
  // validation core against fresh master data and its response is what the
  // user sees. Keeping a second client-side pass would show results that
  // disagree with the server (duplicates in particular, which the client
  // can only check against the currently-loaded page of employees).
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] =
    useState<ValidateApiResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportApiResult | null>(
    null
  );
  const [importApiError, setImportApiError] = useState<string | null>(null);

  const handleImportFileChange = (file: File | null) => {
    // A newly-picked file invalidates any preview from a previous file.
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewRowNumbers([]);
    setPreviewError(null);
    setValidateResult(null);
    setImportResult(null);
    setImportApiError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }
    const isValidExt = /\.(csv|xlsx|xls)$/.test(file.name.toLowerCase());
    if (!isValidExt) {
      setSelectedFile(null);
      setFileError('รองรับเฉพาะไฟล์ .csv, .xlsx และ .xls');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setSelectedFile(file);
    setFileError(null);
  };

  // Same hand-written quoted-field CSV line parser as Holiday's import (no
  // shared helper module in this project — each page keeps its own copy).
  const parseImportCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map((s) => s.trim());
  };

  // Step 6 — parse the file, then hand the raw cells to the Validate API.
  // The client no longer decides whether the data is valid; it only turns
  // the file into rows and reports problems it alone can see (unreadable
  // file, unsupported format, no data rows).
  const handleValidateFile = async () => {
    if (!selectedFile || !user?.id) return;

    setLoadingPreview(true);
    setPreviewError(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewRowNumbers([]);
    setValidateResult(null);
    setImportResult(null);
    setImportApiError(null);

    try {
      const isExcel = /\.(xlsx|xls)$/i.test(selectedFile.name);
      let rows: string[][];

      if (isExcel) {
        // Dynamic import keeps the (fairly large) xlsx library out of the
        // main bundle — only loaded when the user actually picks an Excel
        // file. Same pattern as Holiday's import.
        const XLSX = await import('xlsx');
        const buffer = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const raw = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          defval: '',
        });
        // Date cell (มาจาก cellDates:true) → "YYYY-MM-DD" ด้วย toLocalDateStr
        // ตัวเดียวกับที่ Holiday Import ใช้ ส่วน cell อื่นคง String(cell ?? '')
        // เดิมไว้ทุกประการ เพื่อไม่ให้กระทบข้อมูลนอกคอลัมน์วันที่
        rows = raw.map((r) =>
          r.map((cell) =>
            cell instanceof Date ? toLocalDateStr(cell) : String(cell ?? '')
          )
        );
      } else {
        // ⚠️ เดิมมี .filter((line) => line.trim().length > 0) ตรงนี้ — เอาออก
        // เพราะการตัดแถวว่างทิ้งก่อน parse ทำให้เลขแถวเลื่อนจากไฟล์จริง
        // และทำให้ CSV กับ Excel พฤติกรรมต่างกัน — ย้ายไปตัดหลังผูก
        // เลขแถวแล้วด้วย isEmptyImportRow ตัวเดียวกับฝั่ง Excel
        const text = await selectedFile.text();
        rows = text.split(/\r?\n/).map((line) => parseImportCsvLine(line));
      }

      if (rows.length === 0) {
        setPreviewError('ไม่พบข้อมูลในไฟล์ หรือไฟล์ไม่มีแถวข้อมูล');
        return;
      }

      const headers = rows[0].map((h) => String(h ?? '').trim());

      // ผูกเลขแถวจริง (header = แถว 1) ก่อน แล้วค่อยตัดแถวว่างทิ้ง
      // เลขที่แสดงจึงตรงกับสเปรดชีตของผู้ใช้เสมอ ไม่ว่าจะตัดแถวไหนออก
      const dataRows = rows
        .slice(1)
        .map((cells, i) => ({ rowNumber: i + 2, cells }))
        .filter((r) => !isEmptyImportRow(r.cells));

      if (dataRows.length === 0) {
        setPreviewError('ไม่พบข้อมูลในไฟล์ หรือไฟล์ไม่มีแถวข้อมูล');
        return;
      }

      const cells = dataRows.map((r) => r.cells);
      setPreviewHeaders(headers);
      setPreviewRows(cells);
      setPreviewRowNumbers(dataRows.map((r) => r.rowNumber));

      // Parsing succeeded — the server decides everything from here.
      await runServerValidation(headers, cells);
    } catch (err: any) {
      setPreviewError(`อ่านไฟล์ไม่สำเร็จ: ${err?.message ?? 'เกิดข้อผิดพลาด'}`);
    } finally {
      setLoadingPreview(false);
    }
  };

  // POST /api/employees/import/validate — read-only. Its response becomes
  // the preview the user sees.
  const runServerValidation = async (headers: string[], rows: string[][]) => {
    if (!user?.id) return;
    setValidating(true);
    setImportApiError(null);
    try {
      const res = await fetch('/api/employees/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterId: user.id, headers, rows }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setImportApiError(json?.error?.message ?? 'ตรวจสอบข้อมูลไม่สำเร็จ');
        return;
      }
      setValidateResult(json.data as ValidateApiResult);
    } catch (err: any) {
      setImportApiError(
        `เชื่อมต่อไม่สำเร็จ: ${err?.message ?? 'เกิดข้อผิดพลาด'}`
      );
    } finally {
      setValidating(false);
    }
  };

  // POST /api/employees/import — the only call that writes. Re-validates
  // server-side, so a stale validateResult cannot cause a bad write.
  const handleRunImport = async () => {
    if (!user?.id || previewRows.length === 0) return;
    setImporting(true);
    setImportApiError(null);
    try {
      const res = await fetch('/api/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterId: user.id,
          headers: previewHeaders,
          rows: previewRows,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setImportApiError(json?.error?.message ?? 'นำเข้าข้อมูลไม่สำเร็จ');
        return;
      }
      setImportResult(json.data as ImportApiResult);
      // New employees exist now — refresh the list behind the modal.
      if ((json.data as ImportApiResult).summary.created > 0) refresh();
    } catch (err: any) {
      setImportApiError(
        `เชื่อมต่อไม่สำเร็จ: ${err?.message ?? 'เกิดข้อผิดพลาด'}`
      );
    } finally {
      setImporting(false);
    }
  };

  const [searchInput, setSearchInput] = useState('');

  // ── Selection Mode toggle — checkboxes only render while this is on.
  // Off by default so the list looks normal until HR explicitly wants to
  // do a bulk action.
  const [selectionMode, setSelectionMode] = useState(false);

  const toggleSelectionMode = () => {
    setSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        // Leaving selection mode clears any in-progress selection too.
        setSelectedEmployeeIds(new Set());
      }
      return next;
    });
  };

  // ── Bulk Selection (Phase 2) — selection mechanism only, no bulk action
  // wired up yet. Keyed by employee.id (never row index) so selection stays
  // correct across pagination/search/refresh.
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set()
  );
  const selectAllRef = useRef<HTMLInputElement>(null);

  const currentPageIds = employees.map((e) => e.id);
  const selectedOnPageCount = currentPageIds.filter((id) =>
    selectedEmployeeIds.has(id)
  ).length;
  const isAllOnPageSelected =
    currentPageIds.length > 0 && selectedOnPageCount === currentPageIds.length;
  const isSomeOnPageSelected = selectedOnPageCount > 0 && !isAllOnPageSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isSomeOnPageSelected;
    }
  }, [isSomeOnPageSelected]);

  const toggleSelectRow = (id: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllOnPage = () => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (isAllOnPageSelected) {
        currentPageIds.forEach((id) => next.delete(id));
      } else {
        currentPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // Cache of { employeeId, name, dateOfBirth } per internal id, merged in
  // from whatever page of `employees` is currently loaded — no new fetch.
  // Lets the Result Summary show a human-readable label even for employees
  // selected on a page the user has since navigated away from, and lets
  // Birthday Mode compute PINs without re-fetching.
  type SelectedEmployeeMeta = Record<
    string,
    { employeeId: string; name: string; dateOfBirth?: string | null }
  >;

  const [selectedEmployeeMeta, setSelectedEmployeeMeta] =
    useState<SelectedEmployeeMeta>({});

  useEffect(() => {
    if (employees.length === 0) return;
    if (employees.length === 0) return;
    setSelectedEmployeeMeta((prev) => {
      const next = { ...prev };
      employees.forEach((e) => {
        next[e.id] = {
          employeeId: e.employeeId,
          name: `${e.firstNameTH} ${e.lastNameTH}`.trim() || e.employeeId,
          dateOfBirth: e.dateOfBirth,
        };
      });
      return next;
    });
  }, [employees]);

  // ── Bulk Reset PIN Modal (Phase 3 Custom PIN + Phase 4 Birthday Mode) ──
  const [showBulkResetModal, setShowBulkResetModal] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkResetMode>('custom');
  const [bulkPin, setBulkPin] = useState('');
  const [bulkPinError, setBulkPinError] = useState<string | null>(null);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkResetResult | null>(null);
  // Plaintext PIN per successfully-reset employee id — kept in memory only
  // long enough to build the CSV export. Never written to localStorage,
  // sessionStorage, or logged. Cleared on modal close and immediately after
  // a successful export (see handleExportBulkResetCsv).
  const [generatedPins, setGeneratedPins] = useState<Record<string, string>>(
    {}
  );

  const handleOpenBulkResetModal = () => {
    setBulkMode('custom');
    setBulkPin('');
    setBulkPinError(null);
    setBulkResult(null);
    setGeneratedPins({});
    setShowBulkResetModal(true);
  };

  // Cancel before submitting — selection is left untouched.
  const handleCloseBulkResetModal = () => {
    if (bulkResetting) return; // don't allow closing mid-flight
    setShowBulkResetModal(false);
    setBulkMode('custom');
    setBulkPin('');
    setBulkPinError(null);
    setBulkResult(null);
    setGeneratedPins({});
  };

  const handleBulkResetConfirm = async () => {
    if (!user?.id) return;

    let resolvePin: (id: string) => string | null;

    if (bulkMode === 'custom') {
      if (!/^\d{6}$/.test(bulkPin)) {
        setBulkPinError(
          'PIN ต้องเป็นตัวเลข 6 หลัก ห้ามมีช่องว่างหรือตัวอักษรอื่น'
        );
        return;
      }
      resolvePin = () => bulkPin;
    } else if (bulkMode === 'birthday') {
      resolvePin = (id) =>
        computeBirthdayPin(selectedEmployeeMeta[id]?.dateOfBirth);
    } else {
      // Random — pre-generate one unique PIN per selected employee for this
      // batch only (no database uniqueness check, per Phase 5 scope).
      const ids = Array.from(selectedEmployeeIds);
      const randomPins = generateUniqueRandomPins(ids.length);
      const randomPinById: Record<string, string> = {};
      ids.forEach((id, i) => {
        randomPinById[id] = randomPins[i];
      });
      resolvePin = (id) => randomPinById[id] ?? null;
    }

    setBulkPinError(null);
    setBulkResetting(true);
    setBulkResult(null);

    const allIds = Array.from(selectedEmployeeIds);
    const skipped: BulkResetSkipped[] = [];
    const pinById: Record<string, string> = {};

    allIds.forEach((id) => {
      const pin = resolvePin(id);
      if (!pin) {
        const meta = selectedEmployeeMeta[id];
        skipped.push({
          employeeLabel: meta?.employeeId ?? id,
          name: meta?.name ?? '',
          reason: 'ไม่มีวันเกิดในระบบ หรือรูปแบบไม่ถูกต้อง',
        });
      } else {
        pinById[id] = pin;
      }
    });

    const idsToProcess = Object.keys(pinById);
    const chunks = chunk(idsToProcess, BULK_RESET_CHUNK_SIZE);
    const failed: BulkResetFailure[] = [];
    const successPins: Record<string, string> = {};
    let successCount = 0;

    for (const group of chunks) {
      const settled = await Promise.allSettled(
        group.map(async (id) => {
          const res = await fetch(`/api/employees/${id}/change-pin`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requesterId: user.id,
              newPin: pinById[id],
            }),
          });
          const json = await res.json();
          return { id, json };
        })
      );

      settled.forEach((result, idx) => {
        const id = group[idx];
        const meta = selectedEmployeeMeta[id];
        const employeeLabel = meta?.employeeId ?? id;
        const name = meta?.name ?? '';

        if (result.status === 'fulfilled' && result.value.json?.success) {
          successCount++;
          successPins[id] = pinById[id]; // export list only ever includes successes
        } else {
          const message =
            result.status === 'fulfilled'
              ? result.value.json?.error?.message ?? 'เกิดข้อผิดพลาด'
              : 'เชื่อมต่อ API ไม่สำเร็จ';
          failed.push({ employeeLabel, name, message });
        }
      });
    }

    setBulkResetting(false);
    setGeneratedPins(successPins);
    setBulkResult({ success: successCount, failed, skipped });
  };

  // Export the plaintext PINs generated for successfully-reset employees
  // only — never failed/skipped rows. Same client-side CSV pattern as
  // Holiday's export (UTF-8 BOM + Blob + temporary <a> download).
  const handleExportBulkResetCsv = () => {
    const ids = Object.keys(generatedPins);
    if (ids.length === 0) return;

    const headers = ['Employee ID', 'Employee Name', 'Generated PIN'];
    const rows = ids.map((id) => {
      const meta = selectedEmployeeMeta[id];
      return [meta?.employeeId ?? id, meta?.name ?? '', generatedPins[id]];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => escapeCsvField(String(field))).join(','))
      .join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    a.download = `bulk-reset-pin-${now.getFullYear()}${pad(
      now.getMonth() + 1
    )}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Security: plaintext PINs only need to live in memory long enough to
    // build this export — clear immediately once the download is triggered.
    setGeneratedPins({});
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters({ search: searchInput });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput, setFilters]);

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/employees/${id}`);
    },
    [router]
  );

  // Preview counts for the Bulk Reset modal — "Ready" excludes employees
  // that Birthday Mode would skip (no dateOfBirth / bad format). Custom and
  // Random modes never skip anyone, so Ready === Selected for those.
  const bulkResetReadyCount =
    bulkMode === 'birthday'
      ? Array.from(selectedEmployeeIds).filter(
          (id) =>
            computeBirthdayPin(selectedEmployeeMeta[id]?.dateOfBirth) !== null
        ).length
      : selectedEmployeeIds.size;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">พนักงาน</h2>
          <p className="text-gray-500 mt-1 text-sm">ทั้งหมด {total} คน</p>
        </div>
        {isHR && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectionMode}
              className={`text-sm font-medium px-4 py-2 rounded-xl transition-colors ${
                selectionMode
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {selectionMode ? 'ยกเลิกการเลือก' : 'เลือกพนักงาน'}
            </button>
            <button
              onClick={handleOpenImportModal}
              className="bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Import
            </button>
            <button
              onClick={() => router.push('/employees/new')}
              className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <span>+</span> เพิ่มพนักงาน
            </button>
          </div>
        )}
      </div>

      {/* Bulk Action Toolbar (Phase 2) — placeholder only, no action wired
          yet. Shown only when at least one employee is selected. */}
      {isHR && selectedEmployeeIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
          <p className="text-sm text-blue-700 font-medium">
            Selected: {selectedEmployeeIds.size} employees
          </p>
          <div className="flex items-center gap-2">
            {/* Placeholder for future bulk actions (e.g. Reset PIN) */}
            <button
              onClick={handleOpenBulkResetModal}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors"
            >
              Reset PIN
            </button>
            <button
              onClick={() => setSelectedEmployeeIds(new Set())}
              className="px-3 py-1.5 rounded-lg border border-blue-200 text-xs text-blue-700 hover:bg-blue-100 transition-colors"
            >
              ล้างการเลือก
            </button>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 shadow-sm">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="ค้นหา รหัส, ชื่อ, นามสกุล, ชื่อเล่น..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Department filter */}
          <select
            value={filters.departmentId}
            onChange={(e) => setFilters({ departmentId: e.target.value })}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">ทุกแผนก</option>
            <option value="dept_gm">GM</option>
            <option value="dept_production">Production</option>
            <option value="dept_admin">Admin</option>
          </select>

          {/* Employee type filter */}
          <select
            value={filters.employeeType}
            onChange={(e) =>
              setFilters({ employeeType: e.target.value as EmployeeType | '' })
            }
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">ทุกประเภท</option>
            <option value="blue_collar">Blue Collar</option>
            <option value="white_collar">White Collar</option>
          </select>

          {/* Status filter */}
          <select
            value={filters.employmentStatus}
            onChange={(e) =>
              setFilters({
                employmentStatus: e.target.value as EmploymentStatus | '',
              })
            }
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="active">ปกติ</option>
            <option value="inactive">ระงับแล้ว</option>
            <option value="">ทั้งหมด</option>
          </select>

          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Error */}
        {error && (
          <div className="p-6 text-center">
            <p className="text-red-500 text-sm">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 text-blue-600 text-sm hover:underline"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-32 bg-gray-100 animate-pulse rounded" />
                  <div className="h-3 w-20 bg-gray-100 animate-pulse rounded" />
                </div>
                <div className="h-3 w-24 bg-gray-100 animate-pulse rounded" />
                <div className="h-3 w-16 bg-gray-100 animate-pulse rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && employees.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">ไม่พบข้อมูลพนักงาน</p>
            {filters.search && (
              <p className="text-gray-400 text-xs mt-1">
                ลองเปลี่ยนคำค้นหาหรือล้าง filter
              </p>
            )}
          </div>
        )}

        {/* Data */}
        {!loading && !error && employees.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {isHR && selectionMode && (
                      <th className="w-10 px-4 py-3">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={isAllOnPageSelected}
                          onChange={toggleSelectAllOnPage}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select all on this page"
                        />
                      </th>
                    )}
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500">
                      พนักงาน
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      แผนก / ตำแหน่ง
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      ประเภท
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      กะ
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      วันเริ่มงาน
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      สถานะ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {employees.map((emp) => (
                    <tr
                      key={emp.id}
                      onClick={() => handleRowClick(emp.id)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      {isHR && selectionMode && (
                        <td
                          className="px-4 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedEmployeeIds.has(emp.id)}
                            onChange={() => toggleSelectRow(emp.id)}
                            aria-label={`Select ${emp.firstNameTH} ${emp.lastNameTH}`}
                          />
                        </td>
                      )}
                      {/* Name + Avatar */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                            {emp.profileImage ? (
                              <img
                                src={emp.profileImage}
                                alt=""
                                className="w-9 h-9 rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-blue-600 font-semibold text-xs">
                                {emp.firstNameEN?.charAt(0) ?? '?'}
                                {emp.lastNameEN?.charAt(0) ?? ''}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {emp.firstNameTH} {emp.lastNameTH}
                            </p>
                            <p className="text-xs text-gray-400">
                              {emp.employeeId}
                              {emp.nickname ? ` · ${emp.nickname}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Department / Position */}
                      <td className="px-4 py-4">
                        <p className="text-gray-900">{emp.departmentName}</p>
                        <p className="text-xs text-gray-400">
                          {emp.positionName}
                        </p>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-4">
                        <span className="text-gray-600 text-xs">
                          {EMPLOYEE_TYPE_LABEL[emp.employeeType] ??
                            emp.employeeType}
                        </span>
                      </td>

                      {/* Shift */}
                      <td className="px-4 py-4 text-gray-600 text-xs">
                        {emp.shiftId
                          ? SHIFT_LABEL[emp.shiftId] ?? emp.shiftId
                          : '—'}
                      </td>

                      {/* Start Date */}
                      <td className="px-4 py-4 text-gray-600 text-xs">
                        {emp.startDate}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_CLASS[emp.employmentStatus] ??
                            'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {STATUS_LABEL[emp.employmentStatus] ??
                            emp.employmentStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                แสดง {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} จาก{' '}
                {total} คน
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← ก่อนหน้า
                </button>
                <span className="px-3 py-1 text-xs text-gray-500">
                  หน้า {page}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore || loading}
                  className="px-3 py-1 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ถัดไป →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bulk Reset PIN Modal — Custom PIN (Phase 3), Birthday (Phase 4),
          Random + Export CSV (Phase 5) */}
      {showBulkResetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                Reset PIN — {selectedEmployeeIds.size} employees
              </h3>
              <button
                onClick={handleCloseBulkResetModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {bulkResult ? (
              // ── Result Summary ──────────────────────────────────────
              <div className="px-6 py-4">
                <p className="text-sm font-medium text-gray-900 mb-3">
                  Reset PIN completed
                </p>
                <div className="flex gap-3 mb-4">
                  <div className="flex-1 bg-green-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-green-600">Success</p>
                    <p className="text-lg font-bold text-green-700">
                      {bulkResult.success}
                    </p>
                  </div>
                  <div className="flex-1 bg-red-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-red-500">Failed</p>
                    <p className="text-lg font-bold text-red-600">
                      {bulkResult.failed.length}
                    </p>
                  </div>
                  <div className="flex-1 bg-yellow-50 rounded-xl px-3 py-2">
                    <p className="text-xs text-yellow-600">Skipped</p>
                    <p className="text-lg font-bold text-yellow-700">
                      {bulkResult.skipped.length}
                    </p>
                  </div>
                </div>

                {bulkResult.skipped.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Skipped employees (ไม่มีวันเกิด/รูปแบบไม่ถูกต้อง):
                    </p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {bulkResult.skipped.map((s, i) => (
                        <p key={i} className="text-xs text-gray-600">
                          <span className="font-medium text-gray-800">
                            {s.employeeLabel}
                          </span>
                          {s.name ? ` (${s.name})` : ''}: {s.reason}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {bulkResult.failed.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Failed employees:
                    </p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {bulkResult.failed.map((f, i) => (
                        <p key={i} className="text-xs text-gray-600">
                          <span className="font-medium text-gray-800">
                            {f.employeeLabel}
                          </span>
                          {f.name ? ` (${f.name})` : ''}: {f.message}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  {bulkResult.success > 0 &&
                    Object.keys(generatedPins).length > 0 && (
                      <button
                        onClick={handleExportBulkResetCsv}
                        className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Export CSV
                      </button>
                    )}
                  <button
                    onClick={handleCloseBulkResetModal}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            ) : (
              // ── Mode + PIN Input ─────────────────────────────────────
              <div className="px-6 py-4">
                <p className="text-xs font-medium text-gray-500 mb-2">Mode</p>
                <div className="space-y-2 mb-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="bulkResetMode"
                      checked={bulkMode === 'custom'}
                      onChange={() => {
                        setBulkMode('custom');
                        setBulkPinError(null);
                      }}
                      disabled={bulkResetting}
                    />
                    Custom PIN
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="bulkResetMode"
                      checked={bulkMode === 'birthday'}
                      onChange={() => {
                        setBulkMode('birthday');
                        setBulkPinError(null);
                      }}
                      disabled={bulkResetting}
                    />
                    Birthday (DDMMYY)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name="bulkResetMode"
                      checked={bulkMode === 'random'}
                      onChange={() => {
                        setBulkMode('random');
                        setBulkPinError(null);
                      }}
                      disabled={bulkResetting}
                    />
                    Random
                  </label>
                </div>

                {bulkMode === 'custom' ? (
                  <>
                    <label className="block text-xs text-gray-500 mb-1">
                      PIN 6 หลัก (ใช้กับพนักงานที่เลือกทุกคน)
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={bulkPin}
                      onChange={(e) => {
                        setBulkPin(e.target.value.replace(/\D/g, ''));
                        setBulkPinError(null);
                      }}
                      disabled={bulkResetting}
                      placeholder="••••••"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    {bulkPinError && (
                      <p className="text-xs text-red-500 mt-1">
                        {bulkPinError}
                      </p>
                    )}
                  </>
                ) : bulkMode === 'birthday' ? (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    PIN จะคำนวณจากวันเกิดของแต่ละคนเป็นรูปแบบ{' '}
                    <span className="font-medium">DD-MM-YY</span> (เช่น เกิด 5
                    ม.ค. 2533 → 050133) — พนักงานที่ไม่มีวันเกิดในระบบจะถูกข้าม
                    ไปและแสดงในรายการ &quot;Skipped&quot; หลังทำเสร็จ
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    ระบบจะสุ่ม PIN 6 หลักให้พนักงานแต่ละคน ไม่ซ้ำกันภายในรอบนี้
                    — หลัง Reset เสร็จสามารถ Export รายการ PIN เป็น CSV
                    เพื่อแจกพนักงานได้
                  </p>
                )}

                {/* Preview — counts only, never shows actual PIN values */}
                <div className="flex gap-4 mt-4 text-xs text-gray-500">
                  <p>
                    Selected:{' '}
                    <span className="font-medium text-gray-800">
                      {selectedEmployeeIds.size}
                    </span>
                  </p>
                  <p>
                    Ready:{' '}
                    <span className="font-medium text-gray-800">
                      {bulkResetReadyCount}
                    </span>
                  </p>
                </div>

                <div className="flex gap-3 justify-end mt-5">
                  <button
                    onClick={handleCloseBulkResetModal}
                    disabled={bulkResetting}
                    className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleBulkResetConfirm}
                    disabled={bulkResetting}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {bulkResetting ? 'กำลังดำเนินการ...' : 'Confirm'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Employee Import Modal — Phase 1: UI placeholder only. No file
          input, parser, validation, preview, or API call in this phase. */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                Import Employees
              </h3>
              <button
                onClick={handleCloseImportModal}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Step 6 — once the import has run, the file/validation/preview
                  sections are replaced by the result. Re-importing the same
                  parsed rows would be a no-op anyway (every row would come
                  back "skipped"), so there is nothing useful to go back to. */}
              {importResult ? (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-gray-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-400">Total</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {importResult.totalRows}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-400">Created</p>
                      <p className="text-sm font-semibold text-green-700">
                        {importResult.summary.created}
                      </p>
                    </div>
                    <div className="bg-yellow-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-400">Skipped</p>
                      <p className="text-sm font-semibold text-yellow-700">
                        {importResult.summary.skipped}
                      </p>
                    </div>
                    <div className="bg-red-50 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-400">Failed</p>
                      <p className="text-sm font-semibold text-red-700">
                        {importResult.summary.failed}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-72 border border-gray-200 rounded-lg bg-white">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="text-left px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap">
                            Row
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap">
                            Employee ID
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap">
                            Result
                          </th>
                          <th className="text-left px-2 py-1.5 font-medium text-gray-600">
                            Reason
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.rows.map((r, i) => {
                          const cls =
                            r.outcome === 'created'
                              ? 'bg-green-100 text-green-700'
                              : r.outcome === 'skipped'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700';
                          return (
                            <tr key={i} className="border-t border-gray-100">
                              <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">
                                {previewRowNumbers[r.rowNumber - 1] ??
                                  r.rowNumber + 1}
                              </td>
                              <td className="px-2 py-1.5 text-gray-700 whitespace-nowrap">
                                {r.employeeId}
                              </td>
                              <td className="px-2 py-1.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls}`}
                                >
                                  {r.outcome}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 text-gray-500">
                                {r.reason ?? ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <>
                  {/* Section 1 — File Upload */}
                  <div className="border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                    <p className="text-sm text-gray-500 mb-2">
                      Upload CSV or Excel file
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        handleImportFileChange(file);
                      }}
                      className="text-sm"
                    />
                    {selectedFile && (
                      <p className="text-xs text-gray-500 mt-2">
                        ไฟล์: {selectedFile.name}
                      </p>
                    )}
                    {fileError && (
                      <p className="text-sm text-red-600 mt-2">{fileError}</p>
                    )}
                  </div>

                  {/* Section 2 — Validation */}
                  <div className="bg-gray-50 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Validation
                    </p>
                    {validating ? (
                      <p className="text-xs text-gray-400">
                        กำลังตรวจสอบข้อมูลกับระบบ...
                      </p>
                    ) : importApiError ? (
                      <p className="text-sm text-red-600">{importApiError}</p>
                    ) : !validateResult ? (
                      <p className="text-xs text-gray-400">
                        Validation results will appear here.
                      </p>
                    ) : validateResult.headerErrors.length > 0 ? (
                      <div className="space-y-1">
                        {validateResult.headerErrors.map((msg, i) => (
                          <p key={i} className="text-sm text-red-600">
                            {msg}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-green-600">
                        ตรวจสอบกับระบบแล้ว — Header ครบถ้วนตาม Template
                      </p>
                    )}
                  </div>

                  {/* Section 3 — Preview */}
                  <div className="bg-gray-50 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Preview
                    </p>
                    {loadingPreview ? (
                      <p className="text-xs text-gray-400">กำลังอ่านไฟล์...</p>
                    ) : previewError ? (
                      <p className="text-sm text-red-600">{previewError}</p>
                    ) : previewHeaders.length > 0 ? (
                      <>
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <p className="text-xs text-gray-400">File</p>
                            <p className="text-xs font-medium text-gray-800 truncate">
                              {selectedFile?.name}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Rows</p>
                            <p className="text-xs font-medium text-gray-800">
                              {previewRows.length}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Columns</p>
                            <p className="text-xs font-medium text-gray-800">
                              {previewHeaders.length}
                            </p>
                          </div>
                        </div>

                        {validateResult &&
                          validateResult.headerErrors.length === 0 && (
                            <div className="grid grid-cols-4 gap-3 mb-3">
                              <div>
                                <p className="text-xs text-gray-400">Valid</p>
                                <p className="text-xs font-medium text-green-700">
                                  {validateResult.summary.valid}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400">Warning</p>
                                <p className="text-xs font-medium text-yellow-700">
                                  {validateResult.summary.warning}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400">Error</p>
                                <p className="text-xs font-medium text-red-700">
                                  {validateResult.summary.error}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-400">
                                  Duplicate
                                </p>
                                <p className="text-xs font-medium text-gray-700">
                                  {validateResult.summary.duplicate}
                                </p>
                              </div>
                            </div>
                          )}

                        {validateResult &&
                          validateResult.headerErrors.length === 0 && (
                            <p className="text-xs text-gray-500 mb-3">
                              จะสร้างพนักงานใหม่{' '}
                              {validateResult.willCreate ?? 0} คน
                              {validateResult.summary.duplicate > 0 &&
                                ` · ข้าม ${validateResult.summary.duplicate} แถวที่มีอยู่แล้ว`}
                            </p>
                          )}

                        <div className="overflow-x-auto max-h-64 border border-gray-200 rounded-lg bg-white">
                          <table className="text-xs">
                            <thead>
                              <tr className="bg-gray-100">
                                {/* Row No. — เลขแถวจริงในไฟล์ต้นฉบับ ไม่ใช่ลำดับใน
                                preview จึงไม่ขึ้นกับ headerErrors หรือผล validation —
                                แสดงเสมอ เพื่อให้ HR เปิดไฟล์ต้นฉบับไปแก้ตรงแถวนั้นได้เลย */}
                                <th className="text-left px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap">
                                  Row
                                </th>
                                {validateResult &&
                                  validateResult.headerErrors.length === 0 && (
                                    <th className="text-left px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap">
                                      Status
                                    </th>
                                  )}
                                {previewHeaders.map((h, i) => (
                                  <th
                                    key={i}
                                    className="text-left px-2 py-1.5 font-medium text-gray-600 whitespace-nowrap"
                                  >
                                    {h || `Column ${i + 1}`}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewRows.map((row, ri) => {
                                const rv = validateResult?.rows[ri];
                                const statusClass =
                                  rv?.status === 'error'
                                    ? 'bg-red-100 text-red-700'
                                    : rv?.status === 'warning'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700';
                                const statusLabel =
                                  rv?.status === 'error'
                                    ? 'Error'
                                    : rv?.status === 'warning'
                                    ? 'Warning'
                                    : 'Valid';
                                return (
                                  <tr
                                    key={ri}
                                    className="border-t border-gray-100"
                                  >
                                    {/* เลขแถวจริงจากไฟล์ — ผูกไว้ตอน parse ก่อนตัดแถวว่าง
                                    จึงไม่เลื่อนแม้ไฟล์จะมีแถวว่างคั่นกลาง และไม่ขึ้นกับผล
                                    validation — fallback ri + 2 ไว้เผื่อกรณี array สองตัว
                                    หลุดกัน (ไม่ควรเกิด เพราะ set พร้อมกันที่เดียว) */}
                                    <td className="px-2 py-1.5 align-top text-gray-400 whitespace-nowrap">
                                      {previewRowNumbers[ri] ?? ri + 2}
                                    </td>
                                    {validateResult &&
                                      validateResult.headerErrors.length ===
                                        0 &&
                                      rv && (
                                        <td className="px-2 py-1.5 align-top">
                                          <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusClass}`}
                                          >
                                            {statusLabel}
                                          </span>
                                          {(rv.errors.length > 0 ||
                                            rv.warnings.length > 0) && (
                                            <div className="mt-1 space-y-0.5 max-w-[220px] whitespace-normal">
                                              {rv.errors.map((e, i) => (
                                                <p
                                                  key={`e${i}`}
                                                  className="text-[10px] text-red-600"
                                                >
                                                  {e}
                                                </p>
                                              ))}
                                              {rv.warnings.map((w, i) => (
                                                <p
                                                  key={`w${i}`}
                                                  className="text-[10px] text-yellow-600"
                                                >
                                                  {w}
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                      )}
                                    {previewHeaders.map((_, ci) => (
                                      <td
                                        key={ci}
                                        className="px-2 py-1.5 text-gray-700 whitespace-nowrap"
                                      >
                                        {row[ci] ?? ''}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">
                        Employee preview will appear here.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={handleCloseImportModal}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
              >
                {importResult ? 'Close' : 'Cancel'}
              </button>

              {/* Two buttons, never both enabled: Validate turns a file into a
                  server-checked preview; Import writes. Import only appears
                  once the server has said the file can be imported. */}
              {!importResult &&
                (validateResult?.canImport ? (
                  <button
                    onClick={handleRunImport}
                    disabled={importing}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing
                      ? 'กำลังนำเข้า...'
                      : `นำเข้า ${validateResult.willCreate ?? 0} รายการ`}
                  </button>
                ) : (
                  <button
                    onClick={handleValidateFile}
                    disabled={!selectedFile || loadingPreview || validating}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPreview
                      ? 'กำลังอ่านไฟล์...'
                      : validating
                      ? 'กำลังตรวจสอบ...'
                      : 'ตรวจสอบข้อมูล'}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
